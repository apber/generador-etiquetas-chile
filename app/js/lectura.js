// Lectura de fotos en la app (7f): siempre con los dos lectores (decisión A del 11-11-2026). Lo que coincide queda
// Confirmado; lo que difiere, Dudoso; lo leído por uno solo, Por confirmar. Los datos críticos (alérgenos, filas
// obligatorias de la tabla, origen) que no estén confirmados y todo lo dudoso no salen en la etiqueta (lectura-con-ia, 9 y 10).
// Si el lector normal no está disponible (cuota, servicio ocupado), la lectura queda en espera y sigue sola.

import { useEffect, useState } from '../vendor/preact-htm.js';
import { readWithGemini, ReadingError, DEFAULT_MODEL, FALLBACK_MODEL } from '../../src/reading/gemini.js';
import { transcriptionToDraft } from '../../src/reading/convert.js';
import { compareDrafts } from '../../src/reading/compare.js';
import { nextAttemptAt, RETRY_CODES } from '../../src/reading/retry.js';
import { PROMPT_VERSION } from '../../src/reading/prompt.js';
import { NUTRIENTS } from '../../src/nutrients.js';
import { bd } from './datos/bd.js';
import { estado, guardarProducto, escribir, leerArchivo } from './datos/almacen.js';
import { api } from './api.js';
import { primerLibre } from './colores.js';

export const LECTORES = { normal: { model: DEFAULT_MODEL }, rapido: { model: FALLBACK_MODEL } };
export const CRITICOS = new Set(['contains', 'may_contain', 'country_of_origin', ...NUTRIENTS.filter((n) => n.group === 'mandatory').map((n) => n.key)]);
export const CAMPOS_TEXTO = ['ingredients', 'contains', 'may_contain', 'country_of_origin', 'storage'];

const oyentes = new Map();
const avisar = (id) => (oyentes.get(id) ?? new Set()).forEach((f) => f());
/** Vuelve a dibujar cuando cambia la lectura. */
export function useLectura(id) {
  const [l, setL] = useState(null);
  useEffect(() => {
    let vivo = true;
    const leer = () => bd.leer(`lectura:${id}`).then((x) => vivo && setL(x ?? false));
    if (!oyentes.has(id)) oyentes.set(id, new Set());
    oyentes.get(id).add(leer);
    leer();
    return () => { vivo = false; oyentes.get(id)?.delete(leer); };
  }, [id]);
  return l;
}

async function guardarLectura(l) { await bd.guardar(`lectura:${l.id}`, l); avisar(l.id); }

/**
 * Empieza una lectura. fotos: [{ image: { mimeType, base64, width, height }, archivo (Blob), razones }].
 * productoId: si se leen fotos para un producto que ya existe (foto de cerca u otra foto).
 */
export async function iniciarLectura(fotos, { productoId = null } = {}) {
  const id = `l${Date.now().toString(36)}`;
  const l = {
    id, fecha: new Date().toISOString(), productoId, cancelada: false,
    fotos: fotos.map((f) => ({ image: f.image, razones: f.razones ?? [] })),
    lectores: { normal: { estado: 'pendiente' }, rapido: { estado: 'pendiente' } },
  };
  await guardarLectura(l);
  // Las fotos van con el producto (OneDrive) cuando ya hay producto; mientras, quedan en la lectura
  correr(id);
  return id;
}

/** Al abrir la app: retoma las lecturas en espera. */
export async function seguirLecturas() {
  for (const [, l] of await bd.todos('lectura:')) {
    if (l.cancelada) continue;
    if (Object.values(l.lectores).some((x) => x.estado === 'pendiente' || x.estado === 'leyendo' || x.estado === 'espera')) correr(l.id);
  }
}

const enCurso = new Map();
const abortos = new Map();
export async function cancelarLectura(id) {
  abortos.get(id)?.abort();
  const l = await bd.leer(`lectura:${id}`);
  if (l) await guardarLectura({ ...l, cancelada: true });
}

function correr(id) {
  if (enCurso.has(id)) return enCurso.get(id);
  const p = (async () => {
    const ac = new AbortController();
    abortos.set(id, ac);
    await Promise.all(Object.keys(LECTORES).map((k) => leerCon(id, k, ac.signal)));
  })().finally(() => { enCurso.delete(id); abortos.delete(id); });
  enCurso.set(id, p);
  return p;
}

async function leerCon(id, lector, signal) {
  for (;;) {
    let l = await bd.leer(`lectura:${id}`);
    if (!l || l.cancelada) return;
    const st = l.lectores[lector];
    if (st.estado === 'listo' || st.estado === 'error') return;
    if (st.estado === 'espera' && st.siguiente && Date.now() < st.siguiente) {
      await esperar(Math.min(st.siguiente - Date.now(), 60_000), signal).catch(() => null);
      if (signal.aborted) return;
      continue;
    }
    l.lectores[lector] = { ...st, estado: 'leyendo', desde: Date.now() };
    await guardarLectura(l);
    try {
      const r = await readWithGemini(l.fotos.map((f) => f.image), {
        apiKey: 'servidor', fetchImpl: api.geminiFetch, model: LECTORES[lector].model, signal, retries: 1,
        ...(lector === 'rapido' ? { thinkingLevel: undefined } : {}),
      });
      l = await bd.leer(`lectura:${id}`);
      if (!l || l.cancelada) return;
      l.lectores[lector] = { estado: 'listo', transcription: r.transcription, model: r.model, promptVersion: r.promptVersion ?? PROMPT_VERSION, usage: r.usage, fin: Date.now() };
      await guardarLectura(l);
      await aplicar(id);
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
      l = await bd.leer(`lectura:${id}`);
      if (!l) return;
      const reintentar = e instanceof ReadingError && RETRY_CODES.includes(e.code);
      l.lectores[lector] = reintentar
        ? { estado: 'espera', motivo: e.code, siguiente: nextAttemptAt(e.code, Date.now(), e.info?.body ?? null) }
        : { estado: 'error', motivo: e.code ?? 'error', mensaje: String(e.message ?? e) };
      await guardarLectura(l);
      if (!reintentar) { await aplicar(id); return; }
      // El lector rápido sin cuota no espera al día siguiente: el normal basta
      if (lector === 'rapido' && e.code === 'quota') { l.lectores.rapido = { estado: 'error', motivo: 'quota' }; await guardarLectura(l); return; }
    }
  }
}

const esperar = (ms, signal) => new Promise((ok, mal) => {
  const t = setTimeout(ok, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); mal(new DOMException('', 'AbortError')); }, { once: true });
});

// ---- De las lecturas al producto ----
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'producto';
const sinTildes = (x) => String(x ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
/** El producto «Por completar» con ese nombre (sin contar tildes ni mayúsculas), si hay uno. */
function porCompletarLlamado(nombre) {
  if (!nombre) return null;
  return [...estado.products.values()].find((p) => p.status === 'pending' && p.type === 'simple' && sinTildes(p.product_name) === sinTildes(nombre)) ?? null;
}

function idLibre(nombre) {
  const base = slug(nombre);
  let id = base;
  for (let i = 2; estado.products.has(id); i++) id = `${base}-${i}`;
  return id;
}
/** Descripción del frente: el nombre en mayúsculas, en hasta 3 líneas. */
export function descripcionDe(nombre) {
  const palabras = nombre.toUpperCase().split(/\s+/).filter(Boolean);
  const lineas = [];
  for (const w of palabras) {
    const u = lineas[lineas.length - 1];
    if (u && (u + ' ' + w).length <= 18) lineas[lineas.length - 1] = `${u} ${w}`; else lineas.push(w);
  }
  if (lineas.length <= 3) return lineas;
  return [lineas.slice(0, -2).join(' '), ...lineas.slice(-2)];
}

const ESTADO = { ok: 'confirmed', derived: 'confirmed', unverified: 'unconfirmed', doubtful: 'doubtful', mismatch: 'doubtful' };
const resultadoDe = (lx, l, nombre) => transcriptionToDraft(lx.transcription, {
  catalog: estado.catalog, productName: nombre, sourceKind: 'label_photo', model: lx.model, promptVersion: lx.promptVersion,
  date: l.fecha.slice(0, 10), sourceId: 'f1', files: l.fotos.map((_, i) => `${i + 1}.jpg`),
});

/** Estado de cada dato según lo que dijo cada lector. */
export function estados(rN, rR) {
  const out = {};
  const base = rN ?? rR;
  const dos = Boolean(rN && rR);
  const difieren = new Set(dos ? compareDrafts(rN, rR).map((d) => (d.field === 'serving_g' ? 'serving' : d.field)) : []);
  for (const n of NUTRIENTS) {
    const f = base.fields?.[n.key];
    if (!f || f.status === 'missing') continue;
    let s = ESTADO[f.status] ?? 'unconfirmed';
    if (dos) s = difieren.has(n.key) ? 'doubtful' : (s === 'doubtful' ? 'doubtful' : 'confirmed');
    else if (!rN) s = s === 'doubtful' ? 'doubtful' : 'unconfirmed';
    out[n.key] = s;
  }
  const c = base.draft.composition;
  for (const k of ['ingredients', 'contains', 'may_contain', 'country_of_origin']) {
    if (c[k] == null) continue;
    out[k] = dos ? (difieren.has(k) ? 'doubtful' : 'confirmed') : 'unconfirmed';
  }
  if (base.draft.nutrition.serving) out.serving = dos ? (difieren.has('serving') ? 'doubtful' : 'confirmed') : 'unconfirmed';
  if (c.storage) out.storage = dos ? 'confirmed' : 'unconfirmed';
  // Lo que un aviso de la lectura pide revisar (otra foto, revisar) queda dudoso
  for (const a of base.alerts) {
    if (!a.pending) continue;
    for (const k of a.data?.fields ?? a.data?.keys ?? []) if (out[k]) out[k] = 'doubtful';
  }
  return out;
}

async function aplicar(id) {
  const l = await bd.leer(`lectura:${id}`);
  const N = l.lectores.normal.estado === 'listo' ? l.lectores.normal : null;
  const R = l.lectores.rapido.estado === 'listo' ? l.lectores.rapido : null;
  if (!N && !R) return;
  const t = (N ?? R).transcription;
  const leido = t.product_name?.trim() || null;
  // Un producto nuevo con el nombre de uno «Por completar» lo completa (toma su color y su presentación; 18-11-2026)
  const anterior = l.productoId ? estado.products.get(l.productoId) : porCompletarLlamado(leido);
  const nombre = anterior?.product_name ?? (leido || 'Producto nuevo');
  const rN = N && resultadoDe(N, l, nombre);
  const rR = R && resultadoDe(R, l, nombre);
  const base = rN ?? rR;
  const st = estados(rN, rR);
  // Lo que la usuaria ya confirmó o escribió en esta ficha se respeta
  const previos = anterior?.field_states ?? {};
  const pid = anterior?.id ?? idLibre(nombre);
  const p = {
    format_version: 1, id: pid, type: 'simple', status: 'active',
    product_name: nombre, description: anterior?.description ?? descripcionDe(nombre),
    ...(anterior?.highlight ? { highlight: anterior.highlight } : {}),
    ring_color: anterior?.ring_color ?? primerLibre(),
    presentations: anterior?.presentations ?? [{ net_weight_g: 50, container: 'small_pouch', barcode: null, barcode_source: null }],
    composition: { ...base.draft.composition },
    nutrition: { ...base.draft.nutrition, serving: base.draft.nutrition.serving ?? anterior?.nutrition?.serving ?? { g: 30, household_measure: '¼ taza', source: 'f1' } },
    sources: base.draft.sources,
    field_states: st,
    reading: { id, date: l.fecha.slice(0, 10), pending: !N },
    ...(anterior?.confirmed_alerts ? { confirmed_alerts: anterior.confirmed_alerts } : {}),
    ...(anterior?.label_parts ? { label_parts: anterior.label_parts } : {}),
    ...(anterior?.last_print ? { last_print: anterior.last_print } : {}),
  };
  if (anterior && anterior.reading?.id === id) {
    for (const [k, s] of Object.entries(previos)) {
      if (s !== 'confirmed' || st[k] === 'confirmed') continue;
      // confirmado por la usuaria con el valor de la lectura rápida: se mantiene su valor
      p.field_states[k] = 'confirmed';
      if (k in (anterior.nutrition?.per_100g ?? {})) p.nutrition.per_100g[k] = anterior.nutrition.per_100g[k];
      else if (k === 'serving') p.nutrition.serving = anterior.nutrition.serving;
      else if (k in (anterior.composition ?? {})) p.composition[k] = anterior.composition[k];
    }
  }
  if (!p.nutrition.serving.household_measure) p.nutrition.serving.household_measure = null;
  await guardarProducto(p);
  // Fotos y lecturas, junto al producto (quedan en OneDrive para revisión)
  if (!anterior || anterior.reading?.id !== id) {
    const indice = (await leerArchivo(`fotos/${pid}/indice.json`)) ?? [];
    for (const [i, f] of l.fotos.entries()) {
      const archivo = `${id}-${i + 1}.jpg`;
      await escribir(`fotos/${pid}/${archivo}`, base64ABlob(f.image.base64, f.image.mimeType));
      indice.push({ archivo, fecha: l.fecha, lectura: id });
    }
    await escribir(`fotos/${pid}/indice.json`, indice);
  }
  await escribir(`lecturas/${pid}/${id}.json`, {
    id, fecha: l.fecha, producto: pid, instrucciones: PROMPT_VERSION,
    lectores: Object.fromEntries(Object.entries(l.lectores).map(([k, v]) => [k, { estado: v.estado, model: v.model, transcription: v.transcription ?? null, motivo: v.motivo }])),
  });
  if (l.productoId !== pid) await guardarLectura({ ...l, productoId: pid });
}

const base64ABlob = (b64, tipo) => new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: tipo });

/** Avisos de la lectura que piden algo, del lector normal (o del rápido si es lo único que hay). */
export function avisosLectura(l) {
  const N = l.lectores.normal.estado === 'listo' ? l.lectores.normal : null;
  const R = l.lectores.rapido.estado === 'listo' ? l.lectores.rapido : null;
  if (!N && !R) return [];
  const p = estado.products.get(l.productoId);
  return resultadoDe(N ?? R, l, p?.product_name).alerts.filter((a) => a.pending);
}
