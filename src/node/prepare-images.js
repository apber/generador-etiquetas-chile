// Prepares photos from Node with the SAME browser code the app uses (src/reading/image-browser.js):
// serves the repository on localhost, opens it in Chromium (Playwright) and runs prepareImage.

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html' };
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.heic': 'image/heic' };

export async function openImagePreparer() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '/index.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><meta charset="utf-8"><title>prep</title>');
    }
    try {
      res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      res.end(readFileSync(join(repoRoot, path)));
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`);
  return {
    /** file path → output of prepareImage (+ name) */
    async prepare(file, options = {}) {
      const mime = MIME[extname(file).toLowerCase()] ?? 'application/octet-stream';
      const b64 = readFileSync(file).toString('base64');
      const out = await page.evaluate(async ({ b64, mime, options }) => {
        const { prepareImage } = await import('/src/reading/image-browser.js');
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return prepareImage(new Blob([bytes], { type: mime }), options);
      }, { b64, mime, options });
      return { name: file.split(/[/\\]/).pop(), ...out };
    },
    async close() {
      await browser.close();
      server.close();
    },
  };
}
