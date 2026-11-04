// Test page for the photo reading on the phone (stage 7e, step 3).
// Same code as the app will use: photo check (image-browser.js), Gemini (gemini.js), conversion and alerts
// (convert.js), close-up photo (merge.js). The Gemini key is kept only in this browser (localStorage).
// Everything from the AI is shown with textContent (never as HTML).

import { prepareImage } from '../src/reading/image-browser.js';
import { QUALITY_REASON_TEXT, QUALITY_THRESHOLDS } from '../src/reading/image-quality.js';
import {
  readWithGemini, readWithFallback, listModels, ReadingError, DEFAULT_MODEL, FALLBACK_MODEL,
} from '../src/reading/gemini.js';
import { transcriptionToDraft } from '../src/reading/convert.js';
import { mergeCloseUp, focusFor } from '../src/reading/merge.js';
import { PROMPT_VERSION } from '../src/reading/prompt.js';
import { NUTRIENTS } from '../src/nutrients.js';
import { NUTRIENT_LABELS, SEAL_NAMES } from '../src/i18n/es.js';
import { catalogIndex } from '../src/allergens.js';
import { nextAttemptAt, RETRY_CODES } from '../src/reading/retry.js';
import { compareDrafts } from '../src/reading/compare.js';
import { queueStore } from './queue-store.js';
import { groupBatch, hintOf } from './batch.js';

export const PAGE_VERSION = '0.6.6';

const KEY_STORE = 'lectura.geminiKey';
const HISTORY_STORE = 'lectura.history';
const COUNT_STORE = 'lectura.count';
const SETTINGS_STORE = 'lectura.settings';
const NOTIFY_STORE = 'lectura.notify';
const QUEUE_PAUSE_MS = 4000; // between waiting readings, to stay under the per-minute limit
const HISTORY_MAX = 60;
const HISTORY_PER_KEY = 3; // the last 3 readings of each product (and test)

const $ = (id) => document.getElementById(id);
const fmt = (x) => (x === null || x === undefined ? '—' : String(x).replace('.', ','));

// ---------- Small DOM helper (text only) ----------
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ---------- Storage (wrapped: private windows may refuse it) ----------
const store = {
  get(key, fallback = null) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

// ---------- State ----------
let catalog = null;
let index = null;
const photos = []; // { file, url, prepared }
let current = null; // reading record (see newRecord)
let abort = null;
let closeUpFocus = null;
let queueBusy = false;

// ---------- Quota counter (Gemini resets at midnight Pacific time) ----------
function pacificDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date());
}
function countToday() {
  const c = store.get(COUNT_STORE, {});
  return c.day === pacificDay() ? c : { day: pacificDay(), total: 0, byModel: {} };
}
function addCount(model) {
  const c = countToday();
  c.total += 1;
  c.byModel[model] = (c.byModel[model] ?? 0) + 1;
  store.set(COUNT_STORE, c);
  showQuota();
}
function showQuota() {
  const c = countToday();
  const parts = Object.entries(c.byModel).map(([m, n]) => `${n} con ${m}`);
  $('quota').textContent = `${c.total} ${c.total === 1 ? 'lectura' : 'lecturas'} hoy${parts.length ? ` (${parts.join(', ')})` : ''} · ${DEFAULT_MODEL}: ≈20 al día`;
}

// ---------- Key ----------
const getKey = () => store.get(KEY_STORE, '');
function showKey() {
  const key = getKey();
  $('key-empty').hidden = Boolean(key);
  $('key-set').hidden = !key;
  $('key-tail').textContent = key ? `termina en …${key.slice(-4)}` : '';
  $('key-section').classList.toggle('done', Boolean(key));
  updateReadButton();
}
function bindKey() {
  $('key-save').addEventListener('click', () => {
    const v = $('key-input').value.trim();
    if (!v) return;
    if (!store.set(KEY_STORE, v)) {
      alert('Este navegador no deja guardar la clave (¿ventana privada?).');
      return;
    }
    $('key-input').value = '';
    $('key-status').textContent = '';
    showKey();
  });
  $('key-change').addEventListener('click', () => {
    $('key-empty').hidden = false;
    $('key-set').hidden = true;
    $('key-input').focus();
  });
  $('key-delete').addEventListener('click', () => {
    if (!confirm('¿Borrar la clave de este navegador?')) return;
    store.remove(KEY_STORE);
    showKey();
  });
  $('key-test').addEventListener('click', async () => {
    $('key-status').textContent = 'Probando…';
    try {
      const models = await listModels({ apiKey: getKey() });
      fillModels(models);
      const has = [DEFAULT_MODEL, FALLBACK_MODEL].map((m) => `${m} ${models.includes(m) ? 'disponible' : 'NO aparece'}`);
      $('key-status').textContent = `La clave funciona: ${models.length} modelos. ${has.join(' · ')}.`;
    } catch (e) {
      $('key-status').textContent = `No funcionó: ${e.message}`;
    }
  });
}

// ---------- Settings ----------
function settings() {
  return { model: $('model').value || 'auto', thinking: $('thinking').value || undefined, media: $('media').value || 'high' };
}
function saveSettings() {
  store.set(SETTINGS_STORE, settings());
}
function fillModels(list) {
  const sel = $('model');
  const keep = sel.value;
  sel.replaceChildren(h('option', { value: 'auto' }, `Automático: ${DEFAULT_MODEL} (si se acaba, ${FALLBACK_MODEL})`));
  const names = list ?? [DEFAULT_MODEL, FALLBACK_MODEL];
  for (const m of names) sel.append(h('option', { value: m }, m));
  sel.value = [...sel.options].some((o) => o.value === keep) ? keep : 'auto';
}
function bindSettings() {
  fillModels(null);
  const s = store.get(SETTINGS_STORE, null);
  if (s) {
    if (s.model && s.model !== 'auto') $('model').append(h('option', { value: s.model }, s.model));
    $('model').value = s.model ?? 'auto';
    $('thinking').value = s.thinking ?? 'low';
    $('media').value = s.media ?? 'high';
  }
  for (const id of ['model', 'thinking', 'media']) $(id).addEventListener('change', saveSettings);
  $('load-models').addEventListener('click', async () => {
    try {
      fillModels(await listModels({ apiKey: getKey() }));
    } catch (e) {
      alert(`No se pudo cargar la lista: ${e.message}`);
    }
  });
  $('prompt-version').textContent = PROMPT_VERSION;
}

// ---------- Photos ----------
function metricsText(p) {
  const m = p.metrics;
  return `${p.original.width}×${p.original.height} · nitidez ${fmt(m.sharpness)} (mín. ${QUALITY_THRESHOLDS.minSharpness}) · luz ${m.meanLuminance} (mín. ${QUALITY_THRESHOLDS.minMeanLuminance}) · quemado ${fmt(Math.round(m.clippedShare * 1000) / 10)} % · ${m.kind === 'screen' ? 'captura' : 'foto'} · envío ${Math.round(p.image.bytes / 1024)} KB`;
}
function verdictText(p) {
  return p.ok ? 'Sirve' : `No sirve: ${p.reasons.map((r) => QUALITY_REASON_TEXT[r]).join(', ')}`;
}
async function addPhotos(fileList) {
  // All the chosen photos appear at once ("Revisando…"); then they are checked one by one.
  const items = fileList.map((file) => ({ file, url: null, prepared: null, error: null }));
  photos.push(...items);
  renderPhotos();
  for (const [n, item] of items.entries()) {
    showPhotosStatus(`Revisando ${items.length > 1 ? `${n + 1} de ${items.length} fotos` : 'la foto'}…`);
    item.url = URL.createObjectURL(item.file);
    try {
      item.prepared = await prepareImage(item.file);
    } catch (e) {
      item.error = `No se pudo abrir la imagen (${e.message}).`;
    }
    renderPhotos();
  }
  showPhotosStatus(null);
}
function showPhotosStatus(text) {
  $('photos-status').hidden = !text;
  $('photos-status').lastElementChild.textContent = text ?? '';
  updateReadButton();
}
/** Photos of the bag, captures of a page, or both: recognized per image (white share of a screen). */
function kindOf(prepared) {
  const kinds = new Set(prepared.map((p) => p.metrics.kind));
  return kinds.size === 1 && kinds.has('screen') ? 'web_capture' : 'label_photo';
}
function renderPhotos() {
  const list = $('photos');
  list.replaceChildren(...photos.map((p, i) => {
    const pr = p.prepared;
    const verdict = p.error
      ? h('span', { class: 'verdict' }, h('span', { class: 'badge warn', 'aria-hidden': 'true' }, '!'), ' ', p.error)
      : pr
        ? h('span', { class: 'verdict' }, h('span', { class: `badge ${pr.ok ? 'ok' : 'warn'}`, 'aria-hidden': 'true' }, pr.ok ? '✓' : '!'), ' ', verdictText(pr))
        : h('span', { class: 'verdict' }, 'Revisando…');
    return h('li', { class: 'photo' },
      p.url ? h('img', { src: p.url, alt: `Foto ${i + 1}` }) : h('span', { class: 'pending' }, h('span', { class: 'spinner', 'aria-hidden': 'true' })),
      h('div', {}, h('div', {}, `Foto ${i + 1}: `, verdict), pr ? h('div', { class: 'metrics' }, metricsText(pr)) : null),
      h('button', { class: 'btn small', type: 'button', 'aria-label': `Quitar la foto ${i + 1}`, onclick: () => removePhoto(i) }, 'Quitar'));
  }));
  const anyBad = photos.some((p) => p.prepared && !p.prepared.ok);
  $('force-wrap').hidden = !anyBad;
  if (!anyBad) $('force').checked = false;
  updateReadButton();
}
function removePhoto(i) {
  if (photos[i].url) URL.revokeObjectURL(photos[i].url);
  photos.splice(i, 1);
  renderPhotos();
}
function updateReadButton() {
  const ready = photos.length > 0 && photos.every((p) => p.prepared || p.error) && !photos.some((p) => p.error) && $('photos-status').hidden;
  const bad = photos.some((p) => p.prepared && !p.prepared.ok);
  $('read').disabled = !getKey() || !ready || (bad && !$('force').checked) || Boolean(abort);
  $('read').textContent = photos.length ? `Leer etiqueta (${photos.length} ${photos.length === 1 ? 'foto' : 'fotos'})` : 'Leer etiqueta';
}

// ---------- Reading ----------
async function callGemini(images, extra = {}, { normalOnly = false, label = null } = {}) {
  const s = normalOnly ? { ...settings(), model: DEFAULT_MODEL, thinking: undefined } : settings();
  abort = new AbortController();
  const t0 = performance.now();
  let stage = label ?? 'Leyendo…';
  const onAttempt = ({ model, attempt }) => {
    if (model === FALLBACK_MODEL && s.model === 'auto') stage = 'Lector normal ocupado. Probando el lector rápido…';
    else if (attempt > 0) stage = 'Servicio ocupado. Reintentando…';
  };
  const common = { apiKey: getKey(), productHint: $('hint').value.trim() || null, mediaResolution: s.media, signal: abort.signal, onAttempt, ...extra };
  const timer = setInterval(() => {
    $('progress-text').textContent = `${stage} ${Math.round((performance.now() - t0) / 1000)} s`;
  }, 500);
  $('progress').hidden = false;
  $('error').hidden = true;
  updateReadButton();
  try {
    const r = s.model === 'auto' && !normalOnly
      ? await readWithFallback(images, common)
      : { ...(await readWithGemini(images, { ...common, model: s.model, thinkingLevel: s.thinking })), fallback: false };
    r.seconds = Math.round((performance.now() - t0) / 100) / 10;
    addCount(r.model?.replace(/^models\//, '') ?? s.model);
    return r;
  } finally {
    clearInterval(timer);
    abort = null;
    $('progress').hidden = true;
    $('progress-text').textContent = 'Leyendo…';
    updateReadButton();
  }
}
const closeButton = () => h('button', { class: 'btn small close', type: 'button', onclick: () => { $('error').hidden = true; } }, 'Cerrar');
function showError(e) {
  const box = $('error');
  box.hidden = false;
  box.classList.remove('notice');
  if (e?.name === 'AbortError' || /abort/i.test(String(e?.info?.cause ?? ''))) {
    box.replaceChildren(closeButton(), h('p', {}, 'Lectura cancelada.'));
    return;
  }
  const msg = e instanceof ReadingError ? e.message : `Error inesperado: ${e?.message ?? e}`;
  const info = e instanceof ReadingError ? JSON.stringify(e.info?.body ?? e.info ?? {}, null, 1).slice(0, 2000) : String(e?.stack ?? '');
  box.replaceChildren(...[closeButton(), h('p', {}, h('strong', {}, msg)), info ? h('details', {}, h('summary', {}, 'Detalle técnico'), h('pre', {}, info)) : null].filter(Boolean));
}

const qualityOf = (prepared, files) => prepared.map((p, i) => ({ name: files[i], ok: p.ok, reasons: p.reasons, metrics: p.metrics, original: p.original, sent: { width: p.image.width, height: p.image.height, bytes: p.image.bytes } }));
/** base: { hint, test, kind, files, quality, forced } of the photos that were read. */
function newRecord(reading, base, extra = {}) {
  return {
    app: 'lectura-pruebas',
    pageVersion: PAGE_VERSION,
    id: `r${Date.now()}`,
    createdAt: new Date().toISOString(),
    hint: base.hint,
    test: base.test ?? null,
    kind: base.kind,
    files: base.files,
    quality: base.quality,
    forced: base.forced, // read although a photo did not pass the check («Leer igual»)
    ...(base.batch ? { batch: true } : {}), // from a batch of photos (the file names gave product and test)
    ...extra,
    reading: { transcription: reading.transcription, model: reading.model, usage: reading.usage, seconds: reading.seconds, promptVersion: reading.promptVersion, fallback: reading.fallback, fallbackReason: reading.fallbackReason ?? null, finishReason: reading.finishReason ?? null },
    closeUps: [],
    transcription: reading.transcription,
  };
}

async function doRead() {
  const ready = photos.filter((p) => p.prepared);
  if (!ready.length) return;
  const files = ready.map((p, i) => p.file.name || `foto-${i + 1}.jpg`);
  const prepared = ready.map((p) => p.prepared);
  const base = {
    hint: $('hint').value.trim() || null, test: null, kind: kindOf(prepared), files,
    quality: qualityOf(prepared, files), forced: prepared.some((p) => !p.ok),
  };
  const images = prepared.map((p) => p.image);
  const auto = settings().model === 'auto';
  try {
    const reading = await callGemini(images);
    current = newRecord(reading, base);
    saveToHistory(current);
    let notice;
    if (auto && reading.fallback) {
      // Read again by itself with the normal reader when it is back (decided on 04-11-2026).
      await enqueue({ kind: 'reread', of: current.id, base, images, reason: reading.fallbackReason });
      notice = 'Leída con el lector rápido. Quedó en espera para leerla de nuevo con el lector normal y comparar.';
    }
    renderResult(notice);
    $('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    if (auto && e instanceof ReadingError && RETRY_CODES.includes(e.code)) {
      await enqueue({ kind: 'read', of: null, base, images, reason: e.code, body: e.info?.body });
      showWaiting(base.hint);
      return;
    }
    showError(e);
  }
}
function showWaiting(hint) {
  const box = $('error');
  box.hidden = false;
  box.classList.add('notice');
  box.replaceChildren(closeButton(), h('p', {}, h('strong', {}, `No hubo lector disponible: «${hint ?? 'sin nombre'}» quedó en espera.`), ' Se leerá sola con el lector normal; mire «En espera del lector normal».'));
  $('queue-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------- Waiting readings (read again by themselves with the normal reader) ----------
let queueSeq = 0;
function queueItem({ kind, of, base, images, reason, body = null, now = Date.now() }) {
  queueSeq += 1;
  return {
    id: `q${now}-${queueSeq}`, order: now * 1000 + (queueSeq % 1000), kind, of, createdAt: new Date(now).toISOString(), base, images, reason,
    notBefore: reason === 'batch' ? now : nextAttemptAt(reason, now, body) ?? now, attempts: 0, lastError: null,
  };
}
async function enqueue(args) {
  await queueStore.put(queueItem(args));
  await renderQueue();
}
async function processQueue({ only = null } = {}) {
  if (queueBusy || abort || !getKey()) return;
  queueBusy = true;
  let done = 0;
  try {
    for (const item of await queueStore.all()) {
      if (only ? item.id !== only : (item.failed || item.notBefore > Date.now())) continue;
      if (done) await new Promise((r) => setTimeout(r, QUEUE_PAUSE_MS));
      const label = `En espera: leyendo «${item.base.hint ?? 'sin nombre'}» con el lector normal…`;
      try {
        const reading = await callGemini(item.images, { productHint: item.base.productHint ?? item.base.hint }, { normalOnly: true, label });
        const rec = newRecord(reading, item.base, {
          waited: { queuedAt: item.createdAt, reason: item.reason, attempts: item.attempts + 1 },
          ...(item.of ? { rereadOf: item.of } : {}),
        });
        const original = item.of ? historyList().find((x) => x.id === item.of) : null;
        if (original) {
          rec.comparison = { with: original.id, model: original.reading.model, differences: compareDrafts(draftOf(original), draftOf(rec)) };
        }
        saveToHistory(rec);
        await queueStore.remove(item.id);
        done += 1;
        await notifyReady(rec, (await queueStore.all()).length);
        await renderQueue();
      } catch (e) {
        if (e?.name === 'AbortError') break;
        const code = e instanceof ReadingError ? e.code : 'unexpected';
        const at = nextAttemptAt(code, Date.now(), e?.info?.body);
        await queueStore.put({ ...item, attempts: item.attempts + 1, lastError: e.message ?? String(e), notBefore: at ?? item.notBefore, failed: at === null });
        if (code === 'quota') {
          // The quota is shared: every waiting reading waits (for the reset, or a minute for the per-minute limit).
          for (const other of await queueStore.all()) if (!other.failed) await queueStore.put({ ...other, notBefore: Math.max(other.notBefore, at) });
          break;
        }
      }
    }
  } finally {
    queueBusy = false;
    await renderQueue();
  }
}
async function clearQueue() {
  if (!confirm('¿Quitar todas las lecturas en espera? Se borran sus fotos.')) return;
  for (const it of await queueStore.all()) await queueStore.remove(it.id);
  await renderQueue();
}
async function removeFromQueue(id) {
  if (!confirm('¿Quitar esta lectura de la espera? Se borran sus fotos.')) return;
  await queueStore.remove(id);
  await renderQueue();
}
const when = (ms) => new Date(ms).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
const REASON_TEXT = { batch: 'lote de fotos', quota: 'se acabaron las lecturas normales del día', overloaded: 'el servicio estaba ocupado', timeout: 'el servicio no respondió a tiempo', network: 'no había conexión' };
async function renderQueue() {
  const items = await queueStore.all();
  $('queue-section').hidden = !items.length;
  $('queue-memory').hidden = queueStore.persistent;
  $('queue').replaceChildren(...items.map((it) => {
    const what = it.kind === 'reread'
      ? `ya leída con el lector rápido (${REASON_TEXT[it.reason] ?? it.reason}); falta la del normal`
      : `sin leer (${REASON_TEXT[it.reason] ?? it.reason})`;
    const bad = it.base.quality.filter((q) => !q.ok).length;
    const next = it.failed ? `No se pudo: ${it.lastError}` : it.notBefore > Date.now() ? `Próximo intento: ${when(it.notBefore)}` : 'Se lee apenas se pueda';
    return h('li', {},
      h('div', { class: 'what' },
        h('strong', {}, `${it.base.hint ?? '(sin nombre)'}${it.base.test ? ` · prueba ${it.base.test}` : ''}`),
        h('span', {}, `${it.base.files.length} foto(s)${bad ? ` (${bad} no pasa la revisión)` : ''} · ${what}`), h('br'),
        h('span', {}, `${next}${it.attempts && !it.failed ? ` (intentos: ${it.attempts})` : ''}`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', disabled: queueBusy || Boolean(abort), onclick: () => processQueue({ only: it.id }) }, 'Intentar ahora'),
        h('button', { class: 'btn small', type: 'button', 'aria-label': `Quitar de la espera ${it.base.hint ?? ''}`, onclick: () => removeFromQueue(it.id) }, 'Quitar')));
  }));
}
async function notifyReady(rec, left = 0) {
  const name = `${rec.hint ?? 'sin nombre'}${rec.test ? ` · prueba ${rec.test}` : ''}`;
  const diff = rec.comparison ? ` ${rec.comparison.differences.length ? `${rec.comparison.differences.length} diferencia(s) con la lectura rápida.` : 'Igual a la lectura rápida.'}` : '';
  const rest = left ? ` Quedan ${left} en espera.` : '';
  try {
    if (store.get(NOTIFY_STORE, false) && 'Notification' in window && Notification.permission === 'granted') {
      // One notification for the whole queue (same tag): it is replaced, not piled up.
      await showNotification(`Lectura lista: ${name}`, { body: `Se leyó con el lector normal.${diff}${rest}`, tag: 'lectura-cola', renotify: true });
    }
  } catch { /* the page still shows it */ }
  const box = $('error');
  box.hidden = false;
  box.classList.add('notice');
  box.replaceChildren(closeButton(), h('p', {}, h('strong', {}, `Lectura lista: ${name}.`), diff, rest),
    h('button', { class: 'btn small', type: 'button', onclick: () => { box.hidden = true; openHistory(rec.id); } }, 'Abrir'));
}
// ---------- Notifications (setting) ----------
// The checkbox keeps what the person chose; the phone's permission is shown apart (on 04-11 the checkbox
// unchecked itself on Android when the permission was not granted, with no explanation).
const PERMISSION_TEXT = {
  granted: 'Permiso del teléfono: concedido. Los avisos están activos.',
  default: 'Falta el permiso del teléfono. Apriete «Pedir permiso» y elija «Permitir». Si no aparece la pregunta, Chrome la ocultó: toque el candado (o los ajustes del sitio) junto a la dirección → Notificaciones → Permitir.',
  denied: 'El teléfono bloqueó las notificaciones de esta página. Para permitirlas: en Chrome, toque el candado (o los ajustes del sitio) junto a la dirección → Notificaciones → Permitir, y vuelva a abrir la página.',
};
function showNotifySetting() {
  const supported = 'Notification' in window;
  const on = store.get(NOTIFY_STORE, false);
  $('notify').disabled = !supported;
  $('notify').checked = supported && on;
  const perm = supported ? Notification.permission : null;
  $('notify-status').hidden = !on && supported;
  $('notify-status').textContent = !supported ? 'Este navegador no muestra notificaciones.' : `${PERMISSION_TEXT[perm] ?? `Permiso: ${perm}.`}`;
  $('notify-ask').hidden = !on || !supported || perm === 'granted';
  $('notify-test').hidden = !on || perm !== 'granted';
}
async function askPermission() {
  try {
    const r = await Notification.requestPermission();
    if (r === 'default') $('notify-status').textContent = PERMISSION_TEXT.default;
  } catch { /* old browsers */ }
  showNotifySetting();
}
async function toggleNotify() {
  const on = $('notify').checked;
  store.set(NOTIFY_STORE, on);
  if (on && Notification.permission === 'default') await askPermission();
  else showNotifySetting();
}
/** Shows a notification: through the service worker (Android does not allow new Notification()). */
async function showNotification(title, options) {
  const ready = navigator.serviceWorker
    ? await Promise.race([navigator.serviceWorker.ready, new Promise((r) => setTimeout(() => r(null), 3000))])
    : null;
  if (ready) return ready.showNotification(title, options);
  return new Notification(title, options);
}
async function testNotify() {
  try {
    await showNotification('Prueba de aviso', { body: 'Así llega el aviso cuando termina una lectura en espera.', tag: 'lectura-cola' });
    $('notify-status').textContent = `${PERMISSION_TEXT.granted} Aviso de prueba enviado: debería verse arriba en el teléfono.`;
  } catch (e) {
    $('notify-status').textContent = `No se pudo mostrar el aviso: ${e.message}`;
  }
}

// ---------- Batch of photos of several products ----------
let batch = null; // { items: [{ file, prepared, error }], plan }
async function pickBatch(fileList) {
  const files = [...fileList];
  if (!files.length) return;
  batch = { items: files.map((file) => ({ file, prepared: null, error: null })), plan: groupBatch(files.map((f) => f.name)) };
  $('batch-plan').hidden = true;
  $('batch-status').hidden = false;
  for (const [n, it] of batch.items.entries()) {
    $('batch-status').lastElementChild.textContent = `Revisando ${n + 1} de ${files.length} fotos…`;
    try {
      it.prepared = await prepareImage(it.file);
    } catch (e) {
      it.error = e.message;
    }
  }
  $('batch-status').hidden = true;
  renderBatch();
}
function batchGroupIndexes(g) {
  return [...g.files, ...g.shared].filter((i) => batch.items[i].prepared);
}
function renderBatch() {
  const { plan, items } = batch;
  $('batch-plan').hidden = false;
  $('batch-groups').replaceChildren(...plan.groups.map((g) => {
    const idx = batchGroupIndexes(g);
    const bad = idx.filter((i) => !items[i].prepared.ok).length;
    const broken = [...g.files, ...g.shared].filter((i) => items[i].error).length;
    return h('li', {}, h('div', { class: 'what' },
      h('strong', {}, `${g.product}${g.test ? ` · prueba ${g.test}` : ''}`),
      h('span', {}, [
        `${idx.length} foto(s)${g.shared.length ? ` (${g.shared.length} compartida${g.shared.length > 1 ? 's' : ''})` : ''}`,
        bad ? `${bad} no pasa la revisión` : 'todas pasan la revisión',
        broken ? `${broken} no se pudo abrir` : null,
      ].filter(Boolean).join(' · ')),
      h('span', { class: 'code' }, ` ${[...g.files, ...g.shared].map((i) => items[i].file.name).join(', ')}`)));
  }));
  $('batch-unknown').hidden = !plan.unknown.length;
  $('batch-unknown').textContent = plan.unknown.length ? `Sin producto en el nombre (no se usan): ${plan.unknown.map((i) => items[i].file.name).join(', ')}` : '';
  const n = plan.groups.filter((g) => batchGroupIndexes(g).length).length;
  $('batch-queue').disabled = !n;
  $('batch-queue').textContent = `Poner ${n} ${n === 1 ? 'lectura' : 'lecturas'} en la cola`;
}
async function queueBatch() {
  if (!batch) return;
  const now = Date.now();
  let count = 0;
  for (const g of batch.plan.groups) {
    const idx = batchGroupIndexes(g);
    if (!idx.length) continue;
    const prepared = idx.map((i) => batch.items[i].prepared);
    const files = idx.map((i) => batch.items[i].file.name);
    const base = {
      hint: g.product, productHint: hintOf(g.product), test: g.test, kind: kindOf(prepared), files,
      quality: qualityOf(prepared, files), forced: prepared.some((p) => !p.ok), batch: true,
    };
    await queueStore.put(queueItem({ kind: 'read', of: null, base, images: prepared.map((p) => p.image), reason: 'batch', now }));
    count += 1;
  }
  batch = null;
  $('batch-plan').hidden = true;
  await renderQueue();
  const box = $('error');
  box.hidden = false;
  box.classList.add('notice');
  box.replaceChildren(closeButton(), h('p', {}, h('strong', {}, `${count} ${count === 1 ? 'lectura quedó' : 'lecturas quedaron'} en la cola.`), ' Se leen una tras otra con el lector normal; si se acaban las del día, siguen solas después de que se renueve la cuota (con la página abierta).'));
  $('queue-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  processQueue();
}
function draftOf(rec) {
  return transcriptionToDraft(rec.transcription, {
    catalog, productName: rec.hint, sourceKind: rec.kind, files: rec.files,
    model: rec.reading.model, promptVersion: rec.reading.promptVersion, fallback: rec.reading.fallback, fallbackReason: rec.reading.fallbackReason ?? undefined, date: rec.createdAt.slice(0, 10),
  });
}

// ---------- Close-up photo of one part ----------
const FOCUS_NAMES = { allergens: 'las frases de alérgenos', table: 'la tabla (o solo las filas dudosas)', ingredients: 'la lista de ingredientes' };
function openChooser(focus, text) {
  closeUpFocus = focus;
  $('chooser-focus-wrap').hidden = Boolean(focus);
  $('chooser-text').textContent = text ?? (focus ? `Saque una foto de cerca de solo ${FOCUS_NAMES[focus]}: de frente, sin reflejo, que se lea la letra.` : 'Elija qué parte quiere aclarar y saque una foto de cerca de solo esa parte.');
  $('chooser').showModal();
}
async function doCloseUp(file) {
  const focus = closeUpFocus ?? $('chooser-focus').value;
  $('chooser').close();
  if (!current || !file) return;
  let prepared;
  try {
    prepared = await prepareImage(file);
  } catch (e) {
    showError(new Error(`No se pudo abrir la imagen (${e.message}).`));
    return;
  }
  if (!prepared.ok && !confirm(`La foto de cerca ${verdictText(prepared).toLowerCase()} (${metricsText(prepared)}). ¿Leerla igual?`)) return;
  try {
    const reading = await callGemini([prepared.image], { focus });
    const merged = mergeCloseUp(current.transcription, reading.transcription, focus);
    current.closeUps.push({
      focus, file: file.name || 'foto-de-cerca.jpg', replaced: merged.replaced,
      quality: { ok: prepared.ok, reasons: prepared.reasons, metrics: prepared.metrics, original: prepared.original },
      transcription: reading.transcription, model: reading.model, usage: reading.usage, seconds: reading.seconds, fallback: reading.fallback, fallbackReason: reading.fallbackReason ?? null,
    });
    current.transcription = merged.transcription;
    saveToHistory(current);
    renderResult(merged.replaced ? `La foto de cerca reemplazó ${FOCUS_NAMES[focus]}.` : `La foto de cerca no trae ${FOCUS_NAMES[focus]}: se deja la lectura anterior.`);
  } catch (e) {
    showError(e);
  }
}

// ---------- Result ----------
const ACTION = {
  retake: { label: 'Otra foto', symbol: '!', cls: 'pending' },
  review: { label: 'Revisar', symbol: '!', cls: 'pending' },
  fallback: { label: 'Completar', symbol: '!', cls: 'pending' },
  confirm: { label: 'Confirmar', symbol: '?', cls: 'confirm' },
  none: { label: 'Información', symbol: 'i', cls: 'info' },
};
const STATUS = {
  ok: { label: 'Confirmado', symbol: '✓', cls: 'ok' },
  unverified: { label: 'Sin verificar', symbol: '○', cls: 'info' },
  derived: { label: 'Calculado de la porción', symbol: '≈', cls: 'ok' },
  doubtful: { label: 'No se lee bien', symbol: '!', cls: 'warn' },
  mismatch: { label: 'No calza', symbol: '✕', cls: 'warn' },
  missing: { label: 'Falta', symbol: '—', cls: 'warn' },
};

function result() {
  const fallback = current.reading.fallback || current.closeUps.some((c) => c.fallback);
  const fallbackReason = current.reading.fallback ? current.reading.fallbackReason : current.closeUps.find((c) => c.fallback)?.fallbackReason;
  return transcriptionToDraft(current.transcription, {
    catalog, productName: current.hint, sourceKind: current.kind, files: [...current.files, ...current.closeUps.map((c) => c.file)],
    model: current.reading.model, promptVersion: current.reading.promptVersion, fallback, fallbackReason: fallbackReason ?? undefined, date: current.createdAt.slice(0, 10),
  });
}

function withBold(text) {
  // Ingredients: {allergen} in bold.
  const out = [];
  const re = /\{([^}]*)\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(h('b', {}, m[1]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}
const allergenNames = (ids) => (ids ?? []).map((id) => index.get(id)?.name.es ?? id).join(', ');

const FIELD_NAMES = { serving_g: 'porción', ingredients: 'ingredientes', contains: 'contiene', may_contain: 'puede contener', country_of_origin: 'origen' };
function renderResult(notice) {
  const r = result();
  current.result = r;
  const rd = current.reading;
  const u = rd.usage;
  $('result-section').hidden = false;
  $('result-title').textContent = current.hint ? `Resultado: ${current.hint}` : 'Resultado';
  $('result-meta').textContent = [
    new Date(current.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }),
    `${rd.model}${rd.fallback ? ' (respaldo)' : ''}`,
    rd.seconds ? `${fmt(rd.seconds)} s` : null,
    u ? `tokens ${u.promptTokenCount ?? '?'} + ${u.candidatesTokenCount ?? '?'}${u.thoughtsTokenCount ? ` (+${u.thoughtsTokenCount} razonando)` : ''}` : null,
    current.closeUps.length ? `${current.closeUps.length} foto(s) de cerca` : null,
    current.kind === 'web_capture' ? 'capturas de página' : current.quality.some((q) => q.metrics.kind === 'screen') ? 'fotos y capturas' : 'fotos',
    `instrucciones v${rd.promptVersion}`,
    current.test ? `prueba ${current.test}` : null,
    current.forced ? 'leída igual (alguna foto no pasó la revisión)' : null,
    current.waited ? `leída sola después de esperar (${REASON_TEXT[current.waited.reason] ?? current.waited.reason})` : null,
  ].filter(Boolean).join(' · ');
  if (!notice && current.comparison) {
    const d = current.comparison.differences;
    notice = d.length
      ? `Relectura con el lector normal: ${d.length} diferencia(s) con la lectura rápida (${d.map((x) => FIELD_NAMES[x.field] ?? NUTRIENT_LABELS[x.field] ?? x.field).join(', ')}). Lo demás queda confirmado por los dos.`
      : 'Relectura con el lector normal: igual a la lectura rápida (todo confirmado por los dos).';
  }

  const info = r.alerts.filter((a) => a.action === 'none').length;
  $('summary').replaceChildren(...[
    notice ? h('p', { class: 'pill ok', role: 'status' }, h('span', { 'aria-hidden': 'true' }, '✓'), notice) : null,
    r.summary.pending
      ? h('span', { class: 'pill warn' }, h('span', { 'aria-hidden': 'true' }, '!'), `${r.summary.pending} por revisar (se guarda igual)`)
      : h('span', { class: 'pill ok' }, h('span', { 'aria-hidden': 'true' }, '✓'), 'Nada por revisar'),
    r.summary.confirm ? h('span', { class: 'pill ok' }, h('span', { 'aria-hidden': 'true' }, '?'), `${r.summary.confirm} por confirmar`) : null,
    info ? h('span', { class: 'pill info' }, h('span', { 'aria-hidden': 'true' }, 'i'), `${info} informativas`) : null,
  ].filter(Boolean));

  const order = { retake: 0, review: 1, fallback: 2, confirm: 3, none: 4 };
  const alerts = [...r.alerts].sort((a, b) => order[a.action] - order[b.action]);
  $('alerts').replaceChildren(...(alerts.length ? alerts.map((a) => {
    const act = ACTION[a.action] ?? ACTION.none;
    const focus = focusFor(a.code);
    return h('li', { class: `alert ${act.cls}` },
      h('div', { class: 'head' },
        h('span', { class: `badge ${act.cls === 'pending' ? 'warn' : act.cls === 'confirm' ? 'ok' : 'info'}`, 'aria-hidden': 'true' }, act.symbol),
        h('span', { class: 'action' }, act.label),
        h('span', { class: 'code' }, a.code)),
      a.message ? h('p', { class: 'msg' }, a.message) : null,
      a.detail ? h('p', { class: 'detail' }, a.detail) : null,
      focus && ['retake', 'review'].includes(a.action)
        ? h('button', { class: 'btn small', type: 'button', onclick: () => openChooser(focus) }, h('span', { 'aria-hidden': 'true' }, '📷'), ` Foto de cerca de ${FOCUS_NAMES[focus]}`)
        : null);
  }) : [h('li', { class: 'alert confirm' }, h('p', { class: 'msg' }, 'Sin avisos.'))]));

  const s = r.serving;
  $('serving').textContent = s?.g ? `Porción: ${s.householdMeasure ? `${s.householdMeasure} ` : ''}(${fmt(s.g)} g)` : 'Porción: no se encontró.';
  $('table').tBodies[0].replaceChildren(...NUTRIENTS.map((n) => {
    const f = r.fields[n.key] ?? { status: 'missing' };
    const st = STATUS[f.status] ?? STATUS.unverified;
    const printed = f.status === 'missing' ? '' : `${f.per100?.text ?? '—'} | ${f.perServing?.text ?? '—'}`;
    return h('tr', { class: st.cls === 'warn' ? 'bad' : null },
      h('th', { scope: 'row', class: n.indent ? 'indent' : null }, NUTRIENT_LABELS[n.key]),
      h('td', { class: 'num' }, f.status === 'missing' ? '—' : fmt(f.value)),
      h('td', { class: 'state' }, h('span', { class: `badge ${st.cls}`, 'aria-hidden': 'true' }, st.symbol), ' ', st.label, f.note ? h('div', { class: 'code' }, f.note) : null),
      h('td', { class: 'printed' }, printed));
  }));

  const c = r.draft.composition;
  const t = current.transcription;
  const items = [
    ['Ingredientes', c.ingredients ? withBold(c.ingredients) : '—'],
    ['Contiene', allergenNames(c.contains) || '—'],
    ['Puede contener', c.may_contain === null ? '(el proveedor no lo dice)' : allergenNames(c.may_contain) || '—'],
    ['Frases de alérgenos leídas', [t.contains_statement, t.may_contain_statement, ...(t.other_allergen_statements ?? [])]
      .filter((x) => x && (x.text ?? x)).map((x) => `«${x.text ?? x}»${x.legibility && x.legibility !== 'clear' ? ` (${x.legibility === 'doubtful' ? 'dudosa' : 'ilegible'})` : ''}`).join(' · ') || '—'],
    ['Añadido', c.added.map((a) => `${{ sugar: 'azúcar', fat: 'grasa', sodium: 'sal' }[a.nutrient] ?? a.nutrient} (${a.ingredient})`).join('; ') || '—'],
    ['Origen', c.country_of_origin ?? `— ${t.origin?.text ? `(leído: «${t.origin.text}»)` : ''}`],
    ['Conservación', c.storage ?? '—'],
    ['Duración', c.supplier_shelf_life ? `${c.supplier_shelf_life.amount} ${c.supplier_shelf_life.unit === 'months' ? 'meses' : c.supplier_shelf_life.unit === 'days' ? 'días' : c.supplier_shelf_life.unit}` : '—'],
    ['Fechas del envase', [t.production_date ? `elab. ${t.production_date}` : null, t.expiry_date ? `venc. ${t.expiry_date}` : null].filter(Boolean).join(' · ') || '—'],
    ['Proveedor', r.draft.sources[0].from],
    ['Sellos del envase del proveedor', (t.warning_seals ?? []).join(', ') || 'ninguno'],
    ['Nombre en la etiqueta', t.product_name ?? '—'],
  ];
  $('texts').replaceChildren(...items.flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

  $('result-photos').replaceChildren(
    ...current.quality.map((q, i) => h('li', {}, `Foto ${i + 1} (${q.name}): ${q.ok ? 'sirve' : `no sirve: ${q.reasons.map((x) => QUALITY_REASON_TEXT[x]).join(', ')}`} · ${q.original.width}×${q.original.height} · nitidez ${fmt(q.metrics.sharpness)} · luz ${q.metrics.meanLuminance}`)),
    ...current.closeUps.map((cu, i) => h('li', {}, `De cerca ${i + 1} (${FOCUS_NAMES[cu.focus]}): ${cu.replaced ? 'reemplazó esa parte' : 'no la traía'} · ${cu.model} · ${fmt(cu.seconds)} s · nitidez ${fmt(cu.quality.metrics.sharpness)}`)),
  );
  $('share').hidden = !canShareFile();
}

// ---------- Export ----------
const slugOf = (text) => text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function exportName() {
  const slug = slugOf(current.hint ?? 'lectura') || 'lectura';
  const test = current.test ? `_${slugOf(current.test)}` : '';
  return `lectura-${slug}${test}${current.rereadOf ? '-normal' : ''}-${current.createdAt.slice(0, 16).replace(/[:T]/g, '-')}.json`;
}
function exportBlob() {
  const { result: r, ...rest } = current;
  const data = { ...rest, result: r ?? result(), userAgent: navigator.userAgent };
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}
function download() {
  const a = h('a', { href: URL.createObjectURL(exportBlob()), download: exportName() });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function shareFile() {
  return new File([exportBlob()], exportName().replace(/\.json$/, '.txt'), { type: 'text/plain' });
}
function canShareFile() {
  try {
    return Boolean(navigator.canShare && current && navigator.canShare({ files: [shareFile()] }));
  } catch {
    return false;
  }
}
async function share() {
  try {
    await navigator.share({ files: [shareFile()], title: exportName() });
  } catch (e) {
    if (e?.name !== 'AbortError') download();
  }
}

// ---------- History ----------
function historyList() {
  return store.get(HISTORY_STORE, []);
}
const historyKey = (rec) => `${slugOf(rec.hint ?? '')}|${slugOf(rec.test ?? '')}`;
function saveToHistory(rec) {
  const { result: _r, ...plain } = rec;
  let list = historyList().filter((x) => x.id !== rec.id);
  list.unshift(plain);
  const seen = new Map();
  list = list.filter((x) => {
    const n = (seen.get(historyKey(x)) ?? 0) + 1;
    seen.set(historyKey(x), n);
    return n <= HISTORY_PER_KEY;
  });
  while (list.length > HISTORY_MAX) list.pop();
  while (!store.set(HISTORY_STORE, list) && list.length > 1) list.pop();
  renderHistory();
}
function renderHistory() {
  const list = historyList();
  $('history-clear').hidden = !list.length;
  $('history').replaceChildren(...(list.length ? list.map((rec) => {
    let pending = '?';
    try {
      pending = transcriptionToDraft(rec.transcription, { catalog, productName: rec.hint, sourceKind: rec.kind }).summary.pending;
    } catch { /* old or broken record */ }
    return h('li', {},
      h('div', { class: 'what' },
        h('strong', {}, `${rec.hint ?? '(sin nombre)'}${rec.test ? ` · prueba ${rec.test}` : ''}`),
        h('span', {}, `${when(rec.createdAt)} · ${rec.files.length} foto(s)${rec.closeUps.length ? ` + ${rec.closeUps.length} de cerca` : ''} · ${rec.reading.fallback ? 'lector rápido · ' : ''}${rec.rereadOf ? 'relectura normal · ' : ''}${pending} por revisar`)),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: () => openHistory(rec.id) }, 'Abrir'),
        h('button', { class: 'btn small', type: 'button', 'aria-label': `Borrar la lectura de ${rec.hint ?? 'sin nombre'}`, onclick: () => deleteHistory(rec.id) }, 'Borrar')));
  }) : [h('li', {}, h('span', { class: 'hint' }, 'Todavía no hay lecturas.'))]));
}
function openHistory(id) {
  const rec = historyList().find((x) => x.id === id);
  if (!rec) return;
  current = rec;
  $('hint').value = rec.hint ?? '';
  renderResult();
  $('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function deleteHistory(id) {
  if (!confirm('¿Borrar esta lectura del teléfono?')) return;
  store.set(HISTORY_STORE, historyList().filter((x) => x.id !== id));
  if (current?.id === id) { current = null; $('result-section').hidden = true; }
  renderHistory();
}

// ---------- Start ----------
function resetNew() {
  for (const p of photos) if (p.url) URL.revokeObjectURL(p.url);
  photos.length = 0;
  current = null;
  $('hint').value = '';
  $('result-section').hidden = true;
  $('error').hidden = true;
  renderPhotos();
  $('new-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function start() {
  catalog = await (await fetch(new URL('../data/allergens.json', import.meta.url))).json();
  index = catalogIndex(catalog);
  bindKey();
  bindSettings();
  showKey();
  showQuota();
  renderHistory();
  navigator.serviceWorker?.register('sw.js').catch(() => {});
  showNotifySetting();
  $('notify').addEventListener('change', toggleNotify);
  $('notify-ask').addEventListener('click', askPermission);
  $('notify-test').addEventListener('click', testNotify);
  $('queue-clear').addEventListener('click', clearQueue);
  $('batch-pick').addEventListener('click', () => $('batch-input').click());
  $('batch-input').addEventListener('change', (e) => { pickBatch(e.target.files); e.target.value = ''; });
  $('batch-queue').addEventListener('click', queueBatch);
  $('batch-cancel').addEventListener('click', () => { batch = null; $('batch-plan').hidden = true; });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') processQueue(); });
  window.addEventListener('online', () => processQueue());
  setInterval(() => { renderQueue(); processQueue(); }, 60_000);
  await renderQueue();
  processQueue();
  $('take-photo').addEventListener('click', () => $('camera-input').click());
  $('pick-photos').addEventListener('click', () => $('gallery-input').click());
  for (const id of ['camera-input', 'gallery-input']) {
    $(id).addEventListener('change', (e) => {
      addPhotos([...e.target.files]);
      e.target.value = '';
    });
  }
  $('force').addEventListener('change', updateReadButton);
  $('read').addEventListener('click', doRead);
  $('cancel').addEventListener('click', () => abort?.abort());
  $('closeup-any').addEventListener('click', () => openChooser(null));
  $('chooser-camera').addEventListener('click', () => $('closeup-camera').click());
  $('chooser-gallery').addEventListener('click', () => $('closeup-gallery').click());
  for (const id of ['closeup-camera', 'closeup-gallery']) {
    $(id).addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      doCloseUp(f);
    });
  }
  $('download').addEventListener('click', download);
  $('share').addEventListener('click', share);
  $('new-reading').addEventListener('click', resetNew);
  $('history-clear').addEventListener('click', () => {
    if (!confirm('¿Borrar todas las lecturas guardadas en este teléfono?')) return;
    store.set(HISTORY_STORE, []);
    renderHistory();
  });
  document.documentElement.dataset.ready = 'true';
}

start().catch((e) => {
  document.body.prepend(h('div', { class: 'problem-box', role: 'alert' }, `La página no pudo iniciar: ${e.message}`));
});
