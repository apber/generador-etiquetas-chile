// Gemini API call for the photo reading (stage 7e). Works in the browser and in Node 18+ (fetch).
// In the app the call goes through the server (Cloudflare Worker) that holds the key;
// for tests it can be called directly with a key of the developer.

import { TRANSCRIPTION_SCHEMA } from './schema.js';
import { readingPrompt, PROMPT_VERSION } from './prompt.js';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * Chosen on 30-10-2026 after the first real tests (docs/lectura.md): 0 silent errors and 4-18 s per product.
 * Fallback when the daily quota of the main model runs out: faster but reads unclear text with confidence,
 * so its readings are reviewed in full.
 */
export const DEFAULT_MODEL = 'gemini-3.6-flash';
export const DEFAULT_THINKING = 'low';
export const FALLBACK_MODEL = 'gemini-3.5-flash-lite';

/**
 * images: [{ mimeType, base64 }].
 * options: { productHint, mediaResolution ('high' default | 'medium' | 'low' | null), temperature, thinkingLevel }
 */
export function buildRequest(images, options = {}) {
  const parts = [{ text: readingPrompt({ productHint: options.productHint, imageCount: images.length, focus: options.focus }) }];
  for (const img of images) parts.push({ inline_data: { mime_type: img.mimeType, data: img.base64 } });
  const generationConfig = {
    responseMimeType: 'application/json',
    responseSchema: TRANSCRIPTION_SCHEMA,
  };
  if (options.temperature !== undefined) generationConfig.temperature = options.temperature;
  const res = options.mediaResolution === undefined ? 'high' : options.mediaResolution;
  if (res) generationConfig.mediaResolution = `MEDIA_RESOLUTION_${res.toUpperCase()}`;
  if (options.thinkingLevel) generationConfig.thinkingConfig = { thinkingLevel: options.thinkingLevel };
  return { contents: [{ role: 'user', parts }], generationConfig };
}

export class ReadingError extends Error {
  constructor(code, message, info = {}) {
    super(message);
    this.code = code;
    this.info = info;
  }
}

/**
 * Calls Gemini and returns { transcription, usage, model, promptVersion, raw }.
 * Errors: ReadingError with code quota | overloaded | blocked | bad_key | bad_response | network | http.
 */
export async function readWithGemini(images, { apiKey, model = DEFAULT_MODEL, fetchImpl = fetch, retries = 1, ...options }) {
  if (!apiKey) throw new ReadingError('bad_key', 'Falta la clave de Gemini.');
  if (model === DEFAULT_MODEL && options.thinkingLevel === undefined) options.thinkingLevel = DEFAULT_THINKING;
  const body = JSON.stringify(buildRequest(images, options));
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  let attempt = 0;
  for (;;) {
    let res;
    try {
      res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey }, body });
    } catch (e) {
      throw new ReadingError('network', 'No hay conexión con el servicio de lectura.', { cause: String(e) });
    }
    const json = await res.json().catch(() => null);
    if (res.ok) return parseResponse(json, model);
    const status = json?.error?.status ?? '';
    if ((res.status === 503 || res.status === 500) && attempt < retries) {
      attempt += 1;
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    if (res.status === 429 || status === 'RESOURCE_EXHAUSTED') {
      throw new ReadingError('quota', 'Se acabó la cuota de lecturas por ahora. Intente más tarde o mañana.', { body: json });
    }
    if (res.status === 503) throw new ReadingError('overloaded', 'El servicio de lectura está ocupado. Intente en unos minutos.', { body: json });
    if (res.status === 400 && /API key/i.test(json?.error?.message ?? '')) throw new ReadingError('bad_key', 'La clave de Gemini no es válida.', { body: json });
    if (res.status === 403) throw new ReadingError('bad_key', 'La clave de Gemini no tiene permiso.', { body: json });
    throw new ReadingError('http', `Error del servicio de lectura (${res.status}).`, { body: json });
  }
}

/**
 * Main model, and the fallback model when the main one has no quota left (or is overloaded).
 * The result says { fallback: true } so the draft gets a full-review alert.
 */
export async function readWithFallback(images, options) {
  try {
    return { ...(await readWithGemini(images, { ...options, model: DEFAULT_MODEL })), fallback: false };
  } catch (e) {
    if (!(e instanceof ReadingError) || !['quota', 'overloaded'].includes(e.code)) throw e;
    const r = await readWithGemini(images, { ...options, model: FALLBACK_MODEL, thinkingLevel: undefined });
    return { ...r, fallback: true, fallbackReason: e.code };
  }
}

export function parseResponse(json, model) {
  const cand = json?.candidates?.[0];
  if (!cand) {
    const reason = json?.promptFeedback?.blockReason;
    throw new ReadingError('blocked', 'El servicio no devolvió una lectura.', { reason, body: json });
  }
  const text = (cand.content?.parts ?? []).filter((p) => typeof p.text === 'string' && !p.thought).map((p) => p.text).join('');
  let transcription;
  try {
    transcription = JSON.parse(text);
  } catch {
    throw new ReadingError('bad_response', 'La lectura llegó incompleta. Intente de nuevo.', { finishReason: cand.finishReason, text });
  }
  return {
    transcription,
    usage: json.usageMetadata ?? null,
    finishReason: cand.finishReason ?? null,
    model: json.modelVersion ?? model,
    promptVersion: PROMPT_VERSION,
  };
}

/** Models that accept generateContent (to choose one for the tests). */
export async function listModels({ apiKey, fetchImpl = fetch }) {
  const res = await fetchImpl(`${GEMINI_BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } });
  const json = await res.json();
  if (!res.ok) throw new ReadingError('http', `Error al listar modelos (${res.status}).`, { body: json });
  return (json.models ?? []).filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent')).map((m) => m.name.replace(/^models\//, ''));
}
