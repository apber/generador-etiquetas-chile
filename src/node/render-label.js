// Renders labels in Chromium (Playwright) from Node: lays out each label with the real fonts and returns the
// finished label (static HTML, without scripts) and the result (chosen variant and back length).

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { labelPage } from '../template/label.js';
import { demoAssets } from '../template/demo-assets.js';
import { labelFontsCss } from './fonts.js';

/**
 * Brand images from a JSON file: { logo, signatureIcon, seals: { energy, sugars, saturated_fat, sodium },
 * icons: { instagram, whatsapp, facebook } }. Paths are relative to the JSON file; an .svg icon is inlined.
 */
export function loadAssets(file) {
  const base = dirname(resolve(file));
  const a = JSON.parse(readFileSync(file, 'utf8'));
  const url = (p) => (p == null || /^(https?:|data:|\/_blob\/)/.test(p) ? p : pathToFileURL(resolve(base, p)).href);
  const inline = (p) => (p && extname(p) === '.svg' && !/^(https?:|\/_blob\/)/.test(p)
    ? readFileSync(resolve(base, p), 'utf8').replace(/<\?xml[^>]*>\s*/, '').trim() : url(p));
  return {
    logo: url(a.logo),
    signatureIcon: url(a.signatureIcon),
    seals: Object.fromEntries(Object.entries(a.seals ?? {}).map(([k, v]) => [k, url(v)])),
    icons: Object.fromEntries(Object.entries(a.icons ?? {}).map(([k, v]) => [k, inline(v)])),
  };
}

/** Opens a browser for several labels. */
export async function openRenderer() {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const fontsCss = await labelFontsCss();
  const dir = mkdtempSync(join(tmpdir(), 'etiqueta-'));
  let k = 0;
  return {
    /** labelData + company → { result, html (static label), page (the page to lay it out) } */
    async render(labelData, company, options = {}) {
      const page = labelPage(labelData, company, { assets: options.assets ?? demoAssets(), fontsCss, ...options });
      const file = join(dir, `l${k++}.html`);
      writeFileSync(file, page);
      // Always laid out at scale 1: at other scales the browser rounds text positions differently and a block
      // that fits by tenths of a px can land elsewhere. The PNG is drawn afterwards from the finished label.
      const pg = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
      await pg.goto(pathToFileURL(file).href);
      await pg.waitForSelector('body[data-ready="1"]', { timeout: 30000 });
      const result = await pg.evaluate(() => window.__labelResult);
      if (result.error) throw new Error(result.error);
      const html = await pg.evaluate(() => {
        const root = document.querySelector('.label').cloneNode(true);
        [root, ...root.querySelectorAll('*')].forEach((e) => [...e.attributes].forEach((a) => { if (a.name === 'class' || a.name.startsWith('data-')) e.removeAttribute(a.name); }));
        return root.outerHTML;
      });
      await pg.close();
      let png = null;
      if (options.png) {
        const still = join(dir, `l${k++}.html`);
        writeFileSync(still, `<!doctype html><html><head><meta charset="utf-8"><style>${fontsCss} body{margin:0}</style></head><body><div id="l" style="display: inline-block">${html}</div></body></html>`);
        const pp = await browser.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: options.scale ?? 3 });
        await pp.goto(pathToFileURL(still).href);
        await pp.evaluate(() => document.fonts.ready);
        png = await pp.locator('#l').screenshot();
        await pp.close();
      }
      return { result, html, png };
    },
    async close() { await browser.close(); rmSync(dir, { recursive: true, force: true }); },
  };
}
