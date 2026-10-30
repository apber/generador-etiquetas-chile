// Reads the photos of a supplier label with Gemini and shows the draft record and its alerts (stage 7e).
//
// Usage:
//   GEMINI_API_KEY=… node scripts/read-photos.mjs --model <model> [--hint "Maní con chocolate"]
//       [--kind label_photo|web_capture] [--out dir] [--force] [--expect expected.json --id <id>] photo1 [photo2 …]
//   node scripts/read-photos.mjs --transcription saved.json [--hint …] [--expect … --id …]   (no API call)
//   GEMINI_API_KEY=… node scripts/read-photos.mjs --list-models
//
// The photos are checked first (sharpness, light, size); a photo that fails stops the reading unless --force.
// Each reading is saved in --out (default lecturas/): <name>.transcription.json and <name>.draft.json.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import { loadCatalog } from '../src/node/load-folder.js';
import { openImagePreparer } from '../src/node/prepare-images.js';
import { readWithGemini, listModels, ReadingError } from '../src/reading/gemini.js';
import { transcriptionToDraft } from '../src/reading/convert.js';
import { scoreReading } from '../src/reading/score.js';
import { QUALITY_REASON_TEXT } from '../src/reading/image-quality.js';
import { PROMPT_VERSION } from '../src/reading/prompt.js';

const args = process.argv.slice(2);
const opt = { model: null, hint: null, kind: 'label_photo', out: 'lecturas', force: false, expect: null, id: null, transcription: null, list: false, name: null, json: false };
const photos = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--model') opt.model = args[++i];
  else if (a === '--hint') opt.hint = args[++i];
  else if (a === '--kind') opt.kind = args[++i];
  else if (a === '--out') opt.out = args[++i];
  else if (a === '--force') opt.force = true;
  else if (a === '--expect') opt.expect = args[++i];
  else if (a === '--id') opt.id = args[++i];
  else if (a === '--name') opt.name = args[++i];
  else if (a === '--transcription') opt.transcription = args[++i];
  else if (a === '--list-models') opt.list = true;
  else if (a === '--json') opt.json = true;
  else photos.push(a);
}
const apiKey = process.env.GEMINI_API_KEY;
const catalog = loadCatalog();
const num = (x) => String(x).replace('.', ',');

if (opt.list) {
  console.log((await listModels({ apiKey })).join('\n'));
  process.exit(0);
}

let reading;
let files = photos.map((p) => basename(p));
if (opt.transcription) {
  const saved = JSON.parse(readFileSync(opt.transcription, 'utf8'));
  reading = saved.transcription ? saved : { transcription: saved, model: 'guardada', promptVersion: PROMPT_VERSION };
  files = saved.files ?? files;
} else {
  if (!photos.length) { console.error('Faltan las fotos.'); process.exit(1); }
  const prep = await openImagePreparer();
  const prepared = [];
  try {
    for (const p of photos) prepared.push(await prep.prepare(p));
  } finally {
    await prep.close();
  }
  let stop = false;
  prepared.forEach((r, i) => {
    const m = r.metrics;
    const verdict = r.ok ? 'bien' : r.reasons.map((x) => QUALITY_REASON_TEXT[x]).join(', ');
    console.log(`Foto ${i + 1} (${r.name}): ${verdict} · ${r.original.width}×${r.original.height} → ${r.image.width}×${r.image.height}, ${Math.round(r.image.bytes / 1024)} KB · nitidez ${num(m.sharpness)}, luz ${m.meanLuminance}, ${m.kind === 'screen' ? 'captura' : 'foto'}`);
    if (!r.ok) stop = true;
  });
  if (stop && !opt.force) { console.log('\nAlguna foto no sirve: en la app se pediría otra. Use --force para leer igual.'); process.exit(2); }
  const t0 = Date.now();
  try {
    reading = await readWithGemini(prepared.map((r) => r.image), { apiKey, model: opt.model, productHint: opt.hint });
  } catch (e) {
    if (e instanceof ReadingError) { console.error(`${e.code}: ${e.message}`); console.error(JSON.stringify(e.info?.body ?? e.info, null, 1)?.slice(0, 1500)); process.exit(3); }
    throw e;
  }
  reading.seconds = Math.round((Date.now() - t0) / 100) / 10;
  reading.files = files;
  reading.quality = prepared.map((r) => ({ name: r.name, ok: r.ok, reasons: r.reasons, metrics: r.metrics }));
}

const result = transcriptionToDraft(reading.transcription, {
  catalog, productName: opt.hint, sourceKind: opt.kind, files, model: reading.model, promptVersion: reading.promptVersion,
});

const name = opt.name ?? (opt.transcription ? basename(opt.transcription).replace(/\.transcription\.json$|\.json$/, '') : `${basename(photos[0], extname(photos[0]))}.${(opt.model ?? 'm').replace(/[^a-z0-9.-]/gi, '_')}`);
mkdirSync(opt.out, { recursive: true });
if (!opt.transcription) {
  writeFileSync(join(opt.out, `${name}.transcription.json`), JSON.stringify(reading, null, 2));
  writeFileSync(join(opt.out, `${name}.draft.json`), JSON.stringify(result, null, 2));
}

if (opt.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  const u = reading.usage;
  console.log(`\nModelo ${reading.model}${reading.seconds ? ` · ${num(reading.seconds)} s` : ''}${u ? ` · tokens ${u.promptTokenCount ?? '?'} + ${u.candidatesTokenCount ?? '?'}${u.thoughtsTokenCount ? ` (+${u.thoughtsTokenCount} razonando)` : ''}` : ''}`);
  console.log('\nTabla por 100 g:');
  for (const [k, f] of Object.entries(result.fields)) {
    if (f.status === 'missing') { console.log(`  ${k.padEnd(28)} —`); continue; }
    console.log(`  ${k.padEnd(28)} ${String(f.value ?? '?').padStart(7)}  ${f.status}${f.note ? ` (${f.note})` : ''}   [${f.per100?.text ?? '—'} | ${f.perServing?.text ?? '—'}]`);
  }
  const s = result.draft.nutrition.serving;
  const c = result.draft.composition;
  console.log(`\nPorción: ${s ? `${s.household_measure} (${num(s.g)} g)` : '—'}`);
  console.log(`Ingredientes: ${c.ingredients ?? '—'}`);
  console.log(`Contiene: ${c.contains?.join(', ') || '—'} · Puede contener: ${c.may_contain?.join(', ') ?? '(no dice)'}`);
  console.log(`Añadido: ${c.added.map((a) => `${a.nutrient} (${a.ingredient})`).join('; ') || '—'}`);
  console.log(`Origen: ${c.country_of_origin ?? '—'} · Conservación: ${c.storage ?? '—'} · Duración: ${c.supplier_shelf_life ? `${c.supplier_shelf_life.amount} ${c.supplier_shelf_life.unit}` : '—'}`);
  console.log(`Proveedor: ${result.draft.sources[0].from}`);
  console.log(`\nAlertas (${result.summary.blocking} frenan, ${result.summary.confirm} por confirmar):`);
  for (const a of result.alerts) console.log(`  [${a.action}] ${a.code}: ${a.message || a.detail}`);
}

if (opt.expect) {
  const all = JSON.parse(readFileSync(opt.expect, 'utf8'));
  const exp = all[opt.id]?.expected ?? all[opt.id];
  if (!exp) { console.error(`\nNo hay datos esperados para «${opt.id}».`); process.exit(1); }
  const sc = scoreReading(exp, result);
  const n = sc.nutrients;
  console.log(`\nComparación con lo esperado (${opt.id}): ${n.right} bien · ${n.wrong_flagged} mal con alerta · ${n.wrong_silent} MAL SIN ALERTA · ${n.missing} faltan`);
  for (const r of n.rows.filter((x) => x.outcome !== 'right')) console.log(`  ${r.key}: esperado ${r.want ?? '—'}, leído ${r.got ?? '—'} (${r.status}) → ${r.outcome}`);
  for (const t of sc.texts) {
    const ok = t.similarity !== undefined ? `${Math.round(t.similarity * 100)} %` : t.ok ? 'bien' : 'distinto';
    console.log(`  ${t.field}: ${ok}${t.order === false ? ' (orden distinto)' : ''}${t.ok === false || (t.similarity ?? 1) < 1 ? `\n    esperado: ${JSON.stringify(t.want)}\n    leído:    ${JSON.stringify(t.got)}` : ''}`);
  }
  writeFileSync(join(opt.out, `${name}.score.json`), JSON.stringify(sc, null, 2));
}
