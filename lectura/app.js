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

export const PAGE_VERSION = '0.6.1-pruebas';

const KEY_STORE = 'lectura.geminiKey';
const HISTORY_STORE = 'lectura.history';
const COUNT_STORE = 'lectura.count';
const SETTINGS_STORE = 'lectura.settings';
const HISTORY_MAX = 20;

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
async function callGemini(images, extra = {}) {
  const s = settings();
  abort = new AbortController();
  const t0 = performance.now();
  let stage = 'Leyendo…';
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
    const r = s.model === 'auto'
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
  if (e?.name === 'AbortError' || /abort/i.test(String(e?.info?.cause ?? ''))) {
    box.replaceChildren(closeButton(), h('p', {}, 'Lectura cancelada.'));
    return;
  }
  const msg = e instanceof ReadingError ? e.message : `Error inesperado: ${e?.message ?? e}`;
  const info = e instanceof ReadingError ? JSON.stringify(e.info?.body ?? e.info ?? {}, null, 1).slice(0, 2000) : String(e?.stack ?? '');
  box.replaceChildren(...[closeButton(), h('p', {}, h('strong', {}, msg)), info ? h('details', {}, h('summary', {}, 'Detalle técnico'), h('pre', {}, info)) : null].filter(Boolean));
}

function newRecord(reading, prepared, files) {
  return {
    app: 'lectura-pruebas',
    pageVersion: PAGE_VERSION,
    id: `r${Date.now()}`,
    createdAt: new Date().toISOString(),
    hint: $('hint').value.trim() || null,
    kind: kindOf(prepared),
    files,
    quality: prepared.map((p, i) => ({ name: files[i], ok: p.ok, reasons: p.reasons, metrics: p.metrics, original: p.original, sent: { width: p.image.width, height: p.image.height, bytes: p.image.bytes } })),
    reading: { transcription: reading.transcription, model: reading.model, usage: reading.usage, seconds: reading.seconds, promptVersion: reading.promptVersion, fallback: reading.fallback, fallbackReason: reading.fallbackReason ?? null, finishReason: reading.finishReason ?? null },
    closeUps: [],
    transcription: reading.transcription,
  };
}

async function doRead() {
  const ready = photos.filter((p) => p.prepared);
  if (!ready.length) return;
  const files = ready.map((p, i) => p.file.name || `foto-${i + 1}.jpg`);
  try {
    const reading = await callGemini(ready.map((p) => p.prepared.image));
    current = newRecord(reading, ready.map((p) => p.prepared), files);
    saveToHistory(current);
    renderResult();
    $('result-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    showError(e);
  }
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
  retake: { label: 'Otra foto', symbol: '!', cls: 'blocking' },
  review: { label: 'Revisar', symbol: '!', cls: 'blocking' },
  fallback: { label: 'Completar', symbol: '!', cls: 'blocking' },
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
  ].filter(Boolean).join(' · ');

  const info = r.alerts.filter((a) => a.action === 'none').length;
  $('summary').replaceChildren(...[
    notice ? h('p', { class: 'pill ok', role: 'status' }, h('span', { 'aria-hidden': 'true' }, '✓'), notice) : null,
    r.summary.blocking
      ? h('span', { class: 'pill warn' }, h('span', { 'aria-hidden': 'true' }, '!'), `${r.summary.blocking} ${r.summary.blocking === 1 ? 'frena' : 'frenan'} el guardado`)
      : h('span', { class: 'pill ok' }, h('span', { 'aria-hidden': 'true' }, '✓'), 'Nada frena el guardado'),
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
        h('span', { class: `badge ${act.cls === 'blocking' ? 'warn' : act.cls === 'confirm' ? 'ok' : 'info'}`, 'aria-hidden': 'true' }, act.symbol),
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
function exportName() {
  const slug = (current.hint ?? 'lectura').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lectura';
  return `lectura-${slug}-${current.createdAt.slice(0, 16).replace(/[:T]/g, '-')}.json`;
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
function saveToHistory(rec) {
  const { result: _r, ...plain } = rec;
  const list = historyList().filter((x) => x.id !== rec.id);
  list.unshift(plain);
  while (list.length > HISTORY_MAX) list.pop();
  while (!store.set(HISTORY_STORE, list) && list.length > 1) list.pop();
  renderHistory();
}
function renderHistory() {
  const list = historyList();
  $('history-clear').hidden = !list.length;
  $('history').replaceChildren(...(list.length ? list.map((rec) => {
    let blocking = '?';
    try {
      blocking = transcriptionToDraft(rec.transcription, { catalog, productName: rec.hint, sourceKind: rec.kind }).summary.blocking;
    } catch { /* old or broken record */ }
    return h('li', {},
      h('div', { class: 'what' },
        h('strong', {}, rec.hint ?? '(sin nombre)'),
        h('span', {}, `${new Date(rec.createdAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} · ${rec.files.length} foto(s)${rec.closeUps.length ? ` + ${rec.closeUps.length} de cerca` : ''} · ${blocking} frenan`)),
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
