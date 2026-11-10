// Scores saved readings (files downloaded from the test page, or <name>.transcription.json) against the expected
// data, without reading the photos again (stage 7e, arreglo 12). Use it after changing the instructions or the model.
//
// Usage:
//   node scripts/score-readings.mjs --expect esperado.json [--alias producto=id …] [--id id] [--detail] carpeta|archivo …
//
// The product of each file comes from its name (lectura-<producto>[_<prueba>][-rapido]-<fecha>.json) unless --id is given;
// --alias maps a product name to an id of the expected file. Prints one line per reading and the totals per reader.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { loadCatalog } from '../src/node/load-folder.js';
import { transcriptionToDraft } from '../src/reading/convert.js';
import { scoreReading } from '../src/reading/score.js';
import { FALLBACK_MODEL } from '../src/reading/gemini.js';

const args = process.argv.slice(2);
const opt = { expect: null, alias: {}, id: null, detail: false };
const inputs = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--expect') opt.expect = args[++i];
  else if (a === '--alias') { const [k, v] = args[++i].split('='); opt.alias[k] = v; }
  else if (a === '--id') opt.id = args[++i];
  else if (a === '--detail') opt.detail = true;
  else inputs.push(a);
}
if (!opt.expect || !inputs.length) {
  console.error('Uso: node scripts/score-readings.mjs --expect esperado.json [--alias producto=id] [--id id] [--detail] carpeta|archivo …');
  process.exit(1);
}

const catalog = loadCatalog();
const expected = JSON.parse(readFileSync(opt.expect, 'utf8'));
const files = inputs.flatMap((p) => (statSync(p).isDirectory()
  ? readdirSync(p).filter((f) => f.endsWith('.json')).sort().map((f) => join(p, f))
  : [p]));

/** Product id from the file name of a downloaded reading. */
function productOf(name) {
  return name.replace(/\.json$/, '').replace(/^lectura-/, '').replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}$/, '')
    .replace(/-(rapido|normal)$/, '').replace(/_.*$/, '');
}

const totals = {};
const KEYS = ['right', 'wrong_flagged', 'wrong_silent', 'missing'];
for (const file of files) {
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const rec = saved.transcription ? saved : { transcription: saved, reading: {} };
  const reading = rec.reading ?? rec;
  const product = opt.id ?? productOf(basename(file));
  const id = opt.alias[product] ?? product;
  const want = expected[id]?.expected ?? expected[id];
  const fast = rec.reader === 'fast' || Boolean(reading.fallback) || String(reading.model ?? '').replace(/^models\//, '') === FALLBACK_MODEL;
  const result = transcriptionToDraft(rec.transcription, {
    catalog, productName: rec.hint ?? product, sourceKind: rec.kind, model: reading.model,
    promptVersion: reading.promptVersion, fallback: reading.fallback, fallbackReason: reading.fallbackReason ?? undefined,
  });
  const label = basename(file).replace(/^lectura-/, '').replace(/\.json$/, '');
  if (!want) { console.log(`${label}: sin datos esperados para «${id}»`); continue; }
  const s = scoreReading(want, result);
  const reader = `${fast ? 'rápido' : 'normal'} (instrucciones v${reading.promptVersion ?? '?'})`;
  totals[reader] ??= Object.fromEntries([...KEYS, 'readings', 'silent_texts'].map((k) => [k, 0]));
  for (const k of KEYS) totals[reader][k] += s.nutrients[k];
  totals[reader].readings += 1;
  totals[reader].silent_texts += s.silent_texts.length;
  const n = s.nutrients;
  console.log(`${label.padEnd(50)} bien ${String(n.right).padStart(2)} · mal con aviso ${String(n.wrong_flagged).padStart(2)} · MAL SIN AVISO ${String(n.wrong_silent).padStart(2)} · sin leer ${String(n.missing).padStart(2)}${s.silent_texts.length ? ` · textos sin aviso: ${s.silent_texts.join(', ')}` : ''}`);
  if (opt.detail) {
    for (const r of n.rows.filter((x) => x.outcome === 'wrong_silent')) console.log(`    ${r.key}: ${r.got} (esperado ${r.want}, ${r.status})`);
  }
}
console.log('');
for (const [reader, t] of Object.entries(totals)) {
  console.log(`${reader}: ${t.readings} lecturas · bien ${t.right} · mal con aviso ${t.wrong_flagged} · MAL SIN AVISO ${t.wrong_silent} · sin leer ${t.missing} · textos sin aviso ${t.silent_texts}`);
}
