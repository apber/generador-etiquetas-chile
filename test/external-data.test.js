// Checks a real company's data against its own expected results, kept outside the repository.
// Runs only when LABEL_DATA_DIR points to a folder with company.json, products/ and expected.json:
//   LABEL_DATA_DIR=/path/to/folder npm test
//
// expected.json: { "products": { "<id>": { "variant"?, "netWeightG"?, "seals"?, "slogan"?,
//   "servings"?, "rows"?: { "<nutrient>": ["<per 100 g>", "<per serving>"] }, "ingredients"?,
//   "contains"?, "mayContain"?, "packer"?, "origin"?, "alertsInclude"?: [codes], "review"?: [codes] } } }

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadFolder } from '../src/node/load-folder.js';
import { buildLabelData } from '../src/label-data.js';

const dir = process.env.LABEL_DATA_DIR;

if (!dir) {
  test('external company data (set LABEL_DATA_DIR to run)', { skip: true }, () => {});
} else {
  const store = loadFolder(dir);
  const expected = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
  for (const [key, e] of Object.entries(expected.products)) {
    test(`external data: ${key}`, () => {
      const d = buildLabelData(store, { productId: e.productId ?? key, variant: e.variant, netWeightG: e.netWeightG });
      const check = (name, actual, wanted) => wanted !== undefined && assert.deepEqual(actual, wanted, name);
      check('seals', d.front?.seals, e.seals);
      check('slogan', d.front?.slogan, e.slogan);
      check('servings', d.nutrition?.servingsPerPackage?.text, e.servings);
      for (const [k, [per100, perServing]] of Object.entries(e.rows ?? {})) {
        const r = d.nutrition.rows.find((x) => x.key === k);
        assert.deepEqual([r?.per100g?.text, r?.perServing?.text], [per100, perServing], k);
      }
      check('ingredients', d.ingredients?.plain, e.ingredients);
      check('contains', d.contains?.text, e.contains);
      check('mayContain', d.mayContain?.text, e.mayContain);
      check('packer', d.packer && `${d.packer.title} ${d.packer.text}`, e.packer);
      check('origin', d.origin?.text, e.origin);
      for (const code of e.alertsInclude ?? []) assert.ok(d.alerts.some((a) => a.code === code), `alert ${code}`);
      check('review', d.blocking.review, e.review);
    });
  }
}
