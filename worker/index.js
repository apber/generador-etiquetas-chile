// Servidor de la app (Cloudflare Worker). Hace tres cosas, solo para las cuentas de Microsoft permitidas:
//   /api/sesion/canjear y /api/sesion/renovar  inicio de sesión de Microsoft (cliente público con PKCE: la sesión dura meses)
//   /api/gemini/models/<modelo>:generateContent  lectura de fotos con la clave de Gemini guardada como secreto
//   /api/etiqueta                               PDF de una etiqueta (Browser Rendering: el mismo código y letras que en Node)
// Configuración (variables y secretos del Worker, nunca en el repositorio):
//   MS_CLIENT_ID     identificador de la app registrada en Microsoft
//   CUENTAS          correos o identificadores de las cuentas permitidas, separados por coma
//   ORIGENES         direcciones de la app que pueden llamar (p. ej. https://xxx.pages.dev), separadas por coma
//   GEMINI_API_KEY   (secreto) clave de Gemini de este entorno
//   BROWSER          (enlace) Browser Rendering
import puppeteer from '@cloudflare/puppeteer';
import { renderLabelPdf } from '../src/render/label-pdf.js';
import { labelFontsCssFrom } from '../src/render/fonts-css.js';
import { DEFAULT_MODEL, FALLBACK_MODEL } from '../src/reading/gemini.js';
import { prepararEtiqueta, devolverEtiqueta, PedidoMalo } from './etiqueta.js';
import montserrat from '../app/fonts/montserrat.woff2';
import robotoCondensed from '../app/fonts/roboto-condensed.woff2';
import arimo from '../app/fonts/arimo.woff2';

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';
const ALCANCES = 'offline_access openid profile User.Read Files.ReadWrite';
const MODELOS = new Set([DEFAULT_MODEL, FALLBACK_MODEL]);

const b64 = (buf) => {
  const u = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
let fontsCss = null;
const letras = () => (fontsCss ??= labelFontsCssFrom({ montserrat: b64(montserrat), robotoCondensed: b64(robotoCondensed), arimo: b64(arimo) }));

const lista = (s) => (s ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

function cors(req, env) {
  const o = req.headers.get('Origin');
  const ok = o && lista(env.ORIGENES).includes(o.toLowerCase());
  return ok ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : {};
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...h } });

// ---- Cuentas ----
const vistos = new Map();   // huella del token → { cuenta, hasta }
async function huella(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return b64(d);
}
async function cuentaDe(token) {
  const r = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const m = await r.json();
  return { id: m.id, nombre: m.displayName, correo: (m.mail || m.userPrincipalName || '').toLowerCase() };
}
const permitida = (c, env) => Boolean(c) && lista(env.CUENTAS).some((x) => x === c.correo || x === String(c.id).toLowerCase());

async function exigirCuenta(req, env) {
  const t = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  const k = await huella(t);
  const v = vistos.get(k);
  if (v && v.hasta > Date.now()) return v.cuenta;
  const c = await cuentaDe(t);
  if (!permitida(c, env)) return null;
  vistos.set(k, { cuenta: c, hasta: Date.now() + 10 * 60_000 });
  if (vistos.size > 200) vistos.delete(vistos.keys().next().value);
  return c;
}

async function tokens(params, env) {
  const r = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env.MS_CLIENT_ID, scope: ALCANCES, ...params }) });
  const j = await r.json();
  if (!r.ok) return { error: j.error ?? 'error', status: r.status };
  return j;
}

async function sesion(req, env, h, accion) {
  const b = await req.json().catch(() => ({}));
  const j = accion === 'canjear'
    ? await tokens({ grant_type: 'authorization_code', code: b.code ?? '', code_verifier: b.verifier ?? '', redirect_uri: b.redirect_uri ?? '' }, env)
    : await tokens({ grant_type: 'refresh_token', refresh_token: b.refresh_token ?? '' }, env);
  if (j.error) return json({ code: j.error === 'invalid_grant' ? 'invalid_grant' : 'microsoft', error: j.error }, 400, h);
  const c = await cuentaDe(j.access_token);
  if (!permitida(c, env)) return json({ code: 'cuenta_no_permitida', error: 'Cuenta no permitida' }, 403, h);
  return json({ access_token: j.access_token, refresh_token: j.refresh_token, expires_in: j.expires_in, cuenta: c }, 200, h);
}

async function gemini(req, env, h, ruta) {
  const m = /^models\/([\w.-]+):generateContent$/.exec(ruta);
  if (!m || !MODELOS.has(m[1])) return json({ error: { message: 'Modelo no permitido', status: 'INVALID_ARGUMENT' } }, 400, h);
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/${ruta}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY }, body: req.body,
  });
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json', ...h } });
}

async function etiqueta(req, env, h) {
  const cuerpo = await req.json();
  let pedido;
  try { pedido = prepararEtiqueta(cuerpo); } catch (e) { if (e instanceof PedidoMalo) return json({ error: e.message }, 400, h); throw e; }
  let browser;
  try {
    browser = await puppeteer.launch(env.BROWSER);
  } catch (e) {
    return json({ error: 'Sin navegador disponible', detalle: String(e.message ?? e) }, /429|limit/i.test(String(e)) ? 429 : 503, h);
  }
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
    const r = await renderLabelPdf(page, pedido.labelData, pedido.company, { ...pedido.options, fontsCss: letras() });
    return json(devolverEtiqueta(r, cuerpo), 200, h);
  } finally {
    await browser.close();
  }
}

export default {
  async fetch(req, env) {
    const h = cors(req, env);
    const ruta = new URL(req.url).pathname;
    if (req.method === 'OPTIONS') return new Response(null, { status: h['Access-Control-Allow-Origin'] ? 204 : 403, headers: h });
    if (req.method !== 'POST') return json({ error: 'Solo POST' }, 405, h);
    try {
      if (ruta === '/api/sesion/canjear') return await sesion(req, env, h, 'canjear');
      if (ruta === '/api/sesion/renovar') return await sesion(req, env, h, 'renovar');
      if (!(await exigirCuenta(req, env))) return json({ error: 'Sin permiso' }, 401, h);
      if (ruta.startsWith('/api/gemini/')) return await gemini(req, env, h, ruta.slice('/api/gemini/'.length));
      if (ruta === '/api/etiqueta') return await etiqueta(req, env, h);
      return json({ error: 'No existe' }, 404, h);
    } catch (e) {
      return json({ error: 'Error del servidor', detalle: String(e.message ?? e) }, 500, h);
    }
  },
};
