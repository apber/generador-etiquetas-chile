// Servidor de desarrollo de la app (npm run app): sirve el repositorio (la app en /app/) y hace lo mismo que el
// servidor de Cloudflare, en este computador: el PDF de cada etiqueta (con Playwright) y, si hay GEMINI_API_KEY,
// las lecturas de fotos. Sin cuentas: solo para probar en local.
//   npm run app                → http://localhost:8787/app/
//   PORT=9000 npm run app
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { renderLabelPdf } from '../src/render/label-pdf.js';
import { appLabelFontsCss } from '../src/node/app-fonts.js';
import { prepararEtiqueta, devolverEtiqueta } from '../worker/etiqueta.js';

const RAIZ = join(fileURLToPath(import.meta.url), '..', '..');
const PORT = Number(process.env.PORT ?? 8787);
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf' };

let navegador = null;
const fontsCss = appLabelFontsCss();
async function pagina() {
  navegador ??= await chromium.launch();
  return navegador.newPage({ viewport: { width: 1000, height: 800 }, deviceScaleFactor: 1 });
}

async function leerCuerpo(req) {
  const partes = [];
  for await (const c of req) partes.push(c);
  return Buffer.concat(partes);
}

const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

async function api(req, res, ruta) {
  if (ruta === '/api/etiqueta' && req.method === 'POST') {
    const cuerpo = JSON.parse(await leerCuerpo(req));
    const { labelData, company, options } = prepararEtiqueta(cuerpo);
    const pg = await pagina();
    try {
      const r = await renderLabelPdf(pg, labelData, company, { ...options, fontsCss });
      return json(res, 200, devolverEtiqueta(r, cuerpo));
    } finally { await pg.close(); }
  }
  if (ruta.startsWith('/api/gemini/') && req.method === 'POST') {
    const clave = process.env.GEMINI_API_KEY;
    if (!clave) return json(res, 503, { error: { message: 'Falta GEMINI_API_KEY en el servidor local.', status: 'UNAVAILABLE' } });
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${ruta.slice('/api/gemini/'.length)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave }, body: await leerCuerpo(req),
    });
    res.writeHead(r.status, { 'Content-Type': 'application/json' });
    return res.end(Buffer.from(await r.arrayBuffer()));
  }
  return json(res, 404, { error: 'no existe' });
}

createServer(async (req, res) => {
  const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  try {
    if (ruta.startsWith('/api/')) return await api(req, res, ruta);
    if (ruta === '/') { res.writeHead(302, { Location: '/app/' }); return res.end(); }
    let archivo = normalize(join(RAIZ, ruta));
    if (!archivo.startsWith(RAIZ) || /[\\/](\.git|node_modules[\\/](?!.*\.mjs$))/.test(archivo.slice(RAIZ.length))) { res.writeHead(403); return res.end(); }
    if ((await stat(archivo).catch(() => null))?.isDirectory()) archivo = join(archivo, 'index.html');
    const datos = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(datos);
  } catch (e) {
    if (e.code === 'ENOENT') { res.writeHead(404); return res.end('No existe'); }
    console.error(e);
    json(res, 500, { error: String(e.message ?? e) });
  }
}).listen(PORT, () => console.log(`App: http://localhost:${PORT}/app/`));
