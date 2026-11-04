// Test page for the photo reading on the phone (lectura/): loads in Chromium with Gemini mocked.
// All label data here is invented (demo brand). Skipped when Chromium is not installed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

let chromium = null;
try {
  ({ chromium } = await import('playwright'));
  const b = await chromium.launch();
  await b.close();
} catch { chromium = null; }

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };

function serve() {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    try {
      const file = join(root, path.endsWith('/') || path === '' ? join(path, 'index.html') : path);
      if (!file.startsWith(root)) throw new Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const cell = (text, legibility = 'clear') => ({ text, value: Number(text.replace(',', '.')), legibility });
const row = (label, unit, a, b) => ({ label, unit, per_100: cell(a), per_serving: cell(b) });

function transcription(overrides = {}) {
  return {
    images: [{ index: 1, shows: ['nutrition_table', 'ingredients'], problems: [] }],
    product_name: 'ALMENDRAS CUBIERTAS CHOCOLATE DE LECHE',
    nutrition_table: {
      title: 'INFORMACIÓN NUTRICIONAL',
      serving_text: { text: 'Porción: 1/4 taza (30 g)', legibility: 'clear' },
      serving_g: 30,
      household_measure: '1/4 taza',
      servings_per_package_text: 'Porciones por envase: aprox. 166',
      per_100_header: '100 g',
      per_serving_header: '1 porción',
      other_column_headers: [],
      rows: [
        row('Energía', 'kcal', '560', '168'),
        row('Proteínas', 'g', '12,0', '3,6'),
        row('Grasa Total', 'g', '38,0', '11,4'),
        row('Grasa Saturada', 'g', '15,0', '4,5'),
        row('Grasas Monounsaturadas', 'g', '17,0', '5,1'),
        row('Grasa Poliinsaturada', 'g', '4,0', '1,2'),
        row('Grasa Trans', 'g', '0', '0'),
        row('Colesterol', 'mg', '5', '1,5'),
        row('H. de C. disponibles', 'g', '40,0', '12,0'),
        row('Azúcares totales', 'g', '35,0', '10,5'),
        row('Fibra dietética', 'g', '5,0', '1,5'),
        row('Sodio', 'mg', '40', '12'),
      ],
      notes_below_table: [],
    },
    ingredients: { text: 'Cobertura de chocolate de leche (azúcar, manteca de cacao, LECHE entera en polvo, LECITINA DE SOYA), ALMENDRAS, goma laca, aceite vegetal.', legibility: 'clear' },
    contains_statement: null,
    may_contain_statement: null,
    other_allergen_statements: [{ text: 'Elaborado en líneas que también procesan maní, soya, sés?mo', legibility: 'doubtful' }],
    origin: { text: 'Origen: Chile', country: 'Chile', explicit: true },
    storage: { text: 'Conservar en lugar fresco y seco', legibility: 'clear' },
    usage_instructions: null,
    shelf_life_text: null,
    production_date: '25/08/26',
    expiry_date: '25/08/27',
    supplier: { name: 'Proveedor Demo SpA', role: 'Envasado por', address: null, health_permit: null, website: null },
    package_size_text: '5 kg',
    front_claims: [],
    warning_seals: [],
    remarks: null,
    ...overrides,
  };
}

const closeUp = {
  images: [{ index: 1, shows: ['allergens'], problems: [] }],
  product_name: null, nutrition_table: null, ingredients: null,
  contains_statement: null, may_contain_statement: null,
  other_allergen_statements: [{ text: 'Elaborado en líneas que también procesan maní, soya, sésamo, leche, otros frutos secos', legibility: 'clear' }],
  origin: null, storage: null, usage_instructions: null, shelf_life_text: null, production_date: null, expiry_date: null,
  supplier: null, package_size_text: null, front_claims: [], warning_seals: [], remarks: null,
};

const answer = (t) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(t) }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 500 }, modelVersion: 'gemini-3.6-flash' });

test('test page: photo check, reading, alerts, close-up of the allergen sentence, history', { skip: !chromium && 'Chromium not installed (npx playwright install chromium)' }, async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    // A sharp, bright test "photo" (text on white), 900 × 1200 px.
    const maker = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await maker.setContent(`<body style="margin:0;background:#fff;font:28px Arial;padding:40px">${'INFORMACIÓN NUTRICIONAL Energía 560 168 Proteínas 12,0 3,6 '.repeat(40)}</body>`);
    const photo = await maker.screenshot({ type: 'jpeg', quality: 90 });
    await maker.close();

    const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
    await context.addInitScript(() => localStorage.setItem('lectura.geminiKey', JSON.stringify('TEST-KEY-1234')));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    const calls = [];
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const req = route.request();
      const body = req.postDataJSON();
      calls.push({ url: req.url(), key: req.headers()['x-goog-api-key'], parts: body.contents[0].parts.length });
      const isCloseUp = /acercamiento/.test(body.contents[0].parts[0].text);
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(answer(isCloseUp ? closeUp : transcription())) });
    });

    await page.goto(`${base}/lectura/`);
    await page.waitForSelector('html[data-ready="true"]');
    assert.equal(await page.isVisible('#key-set'), true, 'the saved key is recognized');

    await page.fill('#hint', 'Almendras con chocolate');
    await page.setInputFiles('#gallery-input', { name: 'tabla.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForSelector('#photos .verdict:has-text("Sirve")');
    await page.click('#read');
    await page.waitForSelector('#result-section:not([hidden])');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].key, 'TEST-KEY-1234');
    assert.match(calls[0].url, /gemini-3\.6-flash:generateContent/);
    assert.equal(calls[0].parts, 2, 'instructions + one photo');

    const firstValue = await page.textContent('#table tbody tr:first-child td.num');
    assert.equal(firstValue, '560');
    const mono = await page.textContent('#table tbody tr:nth-child(5)');
    assert.match(mono, /17/);
    assert.match(mono, /Confirmado/);
    assert.match(await page.textContent('#alerts'), /allergen_statement_doubtful/);
    assert.match(await page.textContent('#texts'), /almendras/);

    // Close-up of the allergen sentence: replaces only that sentence.
    await page.click('#alerts button:has-text("Foto de cerca de las frases de alérgenos")');
    await page.waitForSelector('#chooser[open]');
    await page.setInputFiles('#closeup-gallery', { name: 'alergenos.jpg', mimeType: 'image/jpeg', buffer: photo });
    await page.waitForSelector('#summary :text("reemplazó")');
    assert.equal(calls.length, 2);
    assert.doesNotMatch(await page.textContent('#alerts'), /allergen_statement_doubtful/);
    assert.match(await page.textContent('#texts'), /sésamo/);
    assert.equal(await page.textContent('#table tbody tr:first-child td.num'), '560', 'the table is kept');

    // Saved in this browser, without the photos.
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('lectura.history')));
    assert.equal(history.length, 1);
    assert.equal(history[0].closeUps.length, 1);
    assert.doesNotMatch(JSON.stringify(history), /base64|TEST-KEY/);

    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    assert.match(download.suggestedFilename(), /^lectura-almendras-con-chocolate-.*\.json$/);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
