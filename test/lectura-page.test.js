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
    page.on('dialog', (d) => d.accept()); // «¿Leerla igual?» if the close-up photo does not pass the check
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
    // The photo check runs in the page; its numbers depend on how this browser draws the test image, so a
    // "no sirve" verdict is not a failure here: the test only needs the reading to start.
    await page.waitForFunction(() => document.querySelector('#photos .metrics'));
    const verdict = await page.textContent('#photos .photo');
    if (await page.isVisible('#force')) await page.check('#force');
    await page.waitForSelector('#read:not([disabled])', { timeout: 5000 }).catch(() => {
      throw new Error(`The read button stays disabled. Photo: ${verdict}`);
    });
    await page.click('#read');
    await page.waitForSelector('#result-section:not([hidden])');

    assert.equal(calls.length, 1);
    assert.equal(calls[0].key, 'TEST-KEY-1234');
    assert.match(calls[0].url, /gemini-3\.6-flash:generateContent/);
    assert.equal(calls[0].parts, 2, 'instructions + one photo');

    assert.match(await page.textContent('#result-meta'), /capturas de página|fotos/);
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

test('test page: without readers the reading waits and reads itself later; a fast reading is read again and compared', { skip: !chromium && 'Chromium not installed (npx playwright install chromium)' }, async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const maker = await browser.newPage({ viewport: { width: 900, height: 1200 } });
    await maker.setContent(`<body style="margin:0;background:#fff;font:28px Arial;padding:40px">${'INFORMACIÓN NUTRICIONAL Energía 560 168 Proteínas 12,0 3,6 '.repeat(40)}</body>`);
    const photo = await maker.screenshot({ type: 'jpeg', quality: 90 });
    await maker.close();

    const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
    await context.addInitScript(() => localStorage.setItem('lectura.geminiKey', JSON.stringify('TEST-KEY-1234')));
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('dialog', (d) => d.accept());
    let mode = 'no-quota';
    let sodium = '40';
    const models = [];
    await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
      const model = /models\/([^:]+):/.exec(route.request().url())[1];
      models.push(model);
      const headers = { 'access-control-allow-origin': '*' };
      if (mode === 'no-quota' || (mode === 'lite-only' && model === 'gemini-3.6-flash')) {
        await route.fulfill({ status: 429, contentType: 'application/json', headers, body: JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED' } }) });
        return;
      }
      const t = transcription();
      t.nutrition_table.rows = t.nutrition_table.rows.map((r) => (r.label === 'Sodio' ? row('Sodio', 'mg', sodium, String(Number(sodium) * 0.3).replace('.', ',')) : r));
      await route.fulfill({ status: 200, contentType: 'application/json', headers, body: JSON.stringify({ ...answer(t), modelVersion: model }) });
    });

    await page.goto(`${base}/lectura/`);
    await page.waitForSelector('html[data-ready="true"]');
    const read = async () => {
      await page.fill('#hint', 'Maní demo');
      await page.setInputFiles('#gallery-input', { name: 'tabla.jpg', mimeType: 'image/jpeg', buffer: photo });
      await page.waitForFunction(() => document.querySelector('#photos .metrics'));
      if (await page.isVisible('#force')) await page.check('#force');
      await page.waitForSelector('#read:not([disabled])', { timeout: 5000 });
      await page.click('#read');
    };
    const history = () => page.evaluate(() => JSON.parse(localStorage.getItem('lectura.history') ?? '[]'));

    // 1. No reader available: the photos wait (in IndexedDB) and nothing is saved yet.
    await read();
    await page.waitForSelector('#queue-section:not([hidden])');
    assert.match(await page.textContent('#queue'), /Maní demo/);
    assert.match(await page.textContent('#queue'), /sin leer/);
    assert.match(await page.textContent('#queue'), /Próximo intento/);
    assert.equal((await history()).length, 0);

    // 2. The normal reader is back: the waiting reading is read with it and saved.
    mode = 'ok';
    const before = models.length;
    await page.click('#queue button:has-text("Intentar ahora")');
    await page.waitForSelector('#queue-section[hidden]', { state: 'attached' });
    assert.deepEqual(models.slice(before), ['gemini-3.6-flash'], 'only the normal reader, no fallback');
    let h = await history();
    assert.equal(h.length, 1);
    assert.equal(h[0].waited.reason, 'quota');
    assert.match(await page.textContent('#error'), /Lectura lista: Maní demo/);
    await page.click('#error button:has-text("Abrir")');
    await page.waitForSelector('#result-section:not([hidden])');
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#download')]);
    assert.match(download.suggestedFilename(), /^lectura-mani-demo-.*\.json$/);
    const data = JSON.parse(await (await import('node:fs/promises')).readFile(await download.path(), 'utf8'));
    assert.equal(typeof data.forced, 'boolean');
    assert.ok(Array.isArray(data.quality) && data.quality[0].metrics, 'the photo check goes in the file');

    // 3. Only the fast reader answers: the reading is shown now and waits to be read again.
    mode = 'lite-only';
    await page.click('#new-reading');
    await read();
    await page.waitForSelector('#result-section:not([hidden])');
    assert.match(await page.textContent('#summary'), /lector rápido/);
    await page.waitForSelector('#queue-section:not([hidden])');
    assert.match(await page.textContent('#queue'), /ya leída con el lector rápido/);

    // 4. The normal reader reads it again and both are compared (the sodium differs).
    mode = 'ok';
    sodium = '400';
    await page.click('#queue button:has-text("Intentar ahora")');
    await page.waitForSelector('#queue-section[hidden]', { state: 'attached' });
    h = await history();
    assert.equal(h.length, 3);
    assert.equal(h[0].rereadOf, h[1].id);
    assert.deepEqual(h[0].comparison.differences.map((d) => d.field), ['sodium_mg']);
    assert.match(await page.textContent('#error'), /1 diferencia/);
    await page.click('#error button:has-text("Abrir")');
    assert.match(await page.textContent('#summary'), /Relectura con el lector normal: 1 diferencia\(s\).*Sodio/);
    assert.doesNotMatch(JSON.stringify(h), /base64|TEST-KEY/);

    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('test page: a batch of photos of several products, each reading named by the files, read one after another', { skip: !chromium && 'Chromium not installed (npx playwright install chromium)' }, async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
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
      const body = route.request().postDataJSON();
      const model = /models\/([^:]+):/.exec(route.request().url())[1];
      calls.push({ model, prompt: body.contents[0].parts[0].text, images: body.contents[0].parts.length - 1 });
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ...answer(transcription()), modelVersion: model }) });
    });
    await page.goto(`${base}/lectura/`);
    await page.waitForSelector('html[data-ready="true"]');

    const file = (name) => ({ name, mimeType: 'image/jpeg', buffer: photo });
    await page.setInputFiles('#batch-input', [file('prod-a_R_tabla.jpg'), file('prod-a_M_tabla.jpg'), file('prod-a_todas_ingredientes.jpg'), file('prod-b_B_1.jpg'), file('_sin-producto.jpg')]);
    await page.waitForSelector('#batch-plan:not([hidden])');
    const plan = await page.textContent('#batch-groups');
    assert.match(plan, /prod-a · prueba M/);
    assert.match(plan, /prod-a · prueba R/);
    assert.match(plan, /prod-b · prueba B/);
    assert.match(plan, /2 foto\(s\) \(1 compartida\)/);
    assert.match(await page.textContent('#batch-unknown'), /_sin-producto\.jpg/);
    assert.equal(await page.textContent('#batch-queue'), 'Poner 3 lecturas en la cola');

    await page.click('#batch-queue');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lectura.history') ?? '[]').length === 3, null, { timeout: 30000 });
    await page.waitForSelector('#queue-section[hidden]', { state: 'attached' });
    assert.deepEqual(calls.map((c) => c.model), ['gemini-3.6-flash', 'gemini-3.6-flash', 'gemini-3.6-flash']);
    assert.deepEqual(calls.map((c) => c.images), [2, 2, 1], 'the shared photo goes in both readings of prod-a');
    assert.match(calls[0].prompt, /prod a/);
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('lectura.history')));
    assert.deepEqual(history.map((r) => `${r.hint}_${r.test}`).sort(), ['prod-a_M', 'prod-a_R', 'prod-b_B']);
    const m = history.find((r) => r.test === 'M');
    assert.deepEqual(m.files, ['prod-a_M_tabla.jpg', 'prod-a_todas_ingredientes.jpg']);
    assert.equal(typeof m.forced, 'boolean');
    assert.equal(m.batch, true);

    // The same photo read again in a batch with the fast reader (to compare it with the normal one).
    await page.setInputFiles('#batch-input', [file('prod-a_M_tabla.jpg')]);
    await page.waitForSelector('#batch-plan:not([hidden])');
    await page.selectOption('#batch-reader', 'fast');
    await page.click('#batch-queue');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lectura.history') ?? '[]').length === 4, null, { timeout: 30000 });
    assert.equal(calls.at(-1).model, 'gemini-3.5-flash-lite');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('lectura.history')));
    assert.equal(after.filter((r) => r.test === 'M').length, 2, 'the fast reading does not replace the normal one');
    assert.match(await page.textContent('#history'), /lector rápido/);

    // Download one reading without opening it, and several in one .zip.
    const [one] = await Promise.all([page.waitForEvent('download'), page.click('#history li:first-child button:has-text("Descargar")')]);
    assert.match(one.suggestedFilename(), /^lectura-prod-a_m-rapido-\d{4}-\d\d-\d\d-\d\d-\d\d\.json$/);
    const saved = JSON.parse(await readFile(await one.path(), 'utf8'));
    assert.equal(saved.reading.model, 'gemini-3.5-flash-lite');
    assert.equal(saved.reader, 'fast');
    assert.ok(saved.result?.fields, 'the result is computed for a reading that was not opened');
    assert.equal(await page.isDisabled('#history-zip'), true);
    await page.click('#history-all');
    assert.equal(await page.textContent('#history-zip'), 'Descargar seleccionadas (4)');
    await page.uncheck('#history li:nth-child(2) input.pick');
    const [zip] = await Promise.all([page.waitForEvent('download'), page.click('#history-zip')]);
    assert.match(zip.suggestedFilename(), /^lecturas-3-.*\.zip$/);
    const bytes = await readFile(await zip.path());
    assert.equal(bytes.readUInt32LE(0), 0x04034B50, 'zip file');
    const names = [...bytes.toString('latin1').matchAll(/lectura-[a-z0-9_-]+\.json/g)].map((x) => x[0]);
    assert.equal(new Set(names).size, 3);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('test page: the notification setting keeps the choice and explains a missing permission', { skip: !chromium && 'Chromium not installed (npx playwright install chromium)' }, async () => {
  const server = await serve();
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 400, height: 860 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`http://127.0.0.1:${server.address().port}/lectura/`);
    await page.waitForSelector('html[data-ready="true"]');
    assert.match(await page.textContent('.top .sub'), /Página de pruebas versión \d+\.\d+\.\d+ · instrucciones v\d+/);
    await page.click('#settings-title');
    await page.check('#notify'); // headless: the permission is not granted
    assert.equal(await page.isChecked('#notify'), true, 'the checkbox does not uncheck itself');
    assert.match(await page.textContent('#notify-status'), /permi/i);
    await page.reload();
    await page.waitForSelector('html[data-ready="true"]');
    assert.equal(await page.isChecked('#notify'), true, 'the choice is remembered');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
