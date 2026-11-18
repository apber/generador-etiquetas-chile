import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFolder, DEMO_FOLDER } from '../src/node/load-folder.js';
import {
  appLabelData, companyForLabel, labelKey, brandFingerprint, filterForLabel, labelFiles, LABEL_TEMPLATE_VERSION,
} from '../src/app-label.js';

const store = loadFolder(DEMO_FOLDER);
const assets = { logo: 'logo.jpg', signatureIcon: 'p.png', seals: { energy: 's.svg' }, icons: { whatsapp: 'w.svg' }, nota: 'x' };
const hashes = { 'logo.jpg': 'a', 'p.png': 'b', 's.svg': 'c', 'w.svg': 'd' };

test('the key of a made label is stable and 32 characters long', async () => {
  const d = appLabelData(store, 'mani-tostado');
  const c = companyForLabel(store.company, store.products.get('mani-tostado'));
  const k1 = await labelKey(d, c, brandFingerprint(assets, hashes));
  const k2 = await labelKey(appLabelData(store, 'mani-tostado'), c, brandFingerprint({ ...assets }, { ...hashes }));
  assert.match(k1, /^[0-9a-f]{32}$/);
  assert.equal(k1, k2);
  assert.deepEqual(labelFiles(k1), { meta: `etiquetas/${k1}.json`, pdf: `etiquetas/${k1}.pdf` });
  assert.ok(LABEL_TEMPLATE_VERSION);
});

test('the key changes with what is printed and not with what is not', async () => {
  const id = 'mani-tostado';
  const d = appLabelData(store, id);
  const c = companyForLabel(store.company, store.products.get(id));
  const base = await labelKey(d, c, brandFingerprint(assets, hashes));
  // another weight, another brand image, another packer: another key
  const p = store.products.get(id);
  const otro = appLabelData(store, id, { peso: p.presentations[0].net_weight_g + 10 });
  assert.notEqual(await labelKey(otro, c, brandFingerprint(assets, hashes)), base);
  assert.notEqual(await labelKey(d, c, brandFingerprint(assets, { ...hashes, 'logo.jpg': 'z' })), base);
  assert.notEqual(await labelKey(d, { ...c, packer: { ...c.packer, name: 'Otra' } }, brandFingerprint(assets, hashes)), base);
  // the list of free barcodes, the alerts, notes in assets.json and other files: same key
  assert.equal(await labelKey(d, { ...c, barcodes: [] }, brandFingerprint(assets, hashes)), base);
  assert.equal(await labelKey({ ...d, alerts: [] }, c, brandFingerprint(assets, hashes)), base);
  assert.equal(await labelKey(d, c, brandFingerprint({ ...assets, nota: 'y' }, { ...hashes, 'otro.png': 'q' })), base);
});

test('Síguenos and the highlight follow label_parts; data still to confirm stays off the label', () => {
  const id = 'mani-tostado';
  const p = { ...store.products.get(id), label_parts: { follow_us: false, highlight: false } };
  assert.deepEqual(companyForLabel(store.company, p).follow_us, {});
  const s2 = { ...store, products: new Map([...store.products, [id, p]]) };
  assert.deepEqual(appLabelData(s2, id).front.highlight, []);
  const q = filterForLabel({ ...p, field_states: { sodium_mg: 'unconfirmed', protein_g: 'confirmed' } });
  assert.equal('sodium_mg' in q.nutrition.per_100g, false);
  assert.equal('protein_g' in q.nutrition.per_100g, 'protein_g' in p.nutrition.per_100g);
});
