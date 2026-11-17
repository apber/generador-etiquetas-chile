// Sesión de Microsoft (OneDrive). La app está registrada como cliente público («Aplicaciones móviles y de escritorio»):
// el código de inicio de sesión (con PKCE) lo canjea el servidor, así la sesión dura meses (como app de una sola
// página, Microsoft la corta cada 24 h). Lo mismo servirá para el APK.
import { ENTORNO, conOneDrive } from '../config.js';
import { bd } from './bd.js';

const AUTORIZAR = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize';
export const ALCANCES = 'offline_access openid profile User.Read Files.ReadWrite';
const MARGEN_MS = 5 * 60_000;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const azar = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const redireccion = () => `${location.origin}${location.pathname}`;

/** Sesión guardada: { access, refresh, vence, cuenta: { id, nombre, correo } } o null. */
export const sesionGuardada = () => bd.leer('sesion');

/** Abre la página de Microsoft para entrar (la app se recarga al volver). */
export async function entrar() {
  const verificador = azar(48);
  const reto = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificador)));
  const estadoOAuth = azar(16);
  sessionStorage.setItem('etq-oauth', JSON.stringify({ verificador, estado: estadoOAuth }));
  const p = new URLSearchParams({
    client_id: ENTORNO.microsoft.clientId, response_type: 'code', redirect_uri: redireccion(), response_mode: 'query',
    scope: ALCANCES, code_challenge: reto, code_challenge_method: 'S256', state: estadoOAuth, prompt: 'select_account',
  });
  location.assign(`${AUTORIZAR}?${p}`);
}

async function alServidor(ruta, cuerpo) {
  const r = await fetch(`${ENTORNO.api}${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error ?? `HTTP ${r.status}`); e.code = j.code ?? (r.status === 403 ? 'cuenta_no_permitida' : 'servidor'); throw e; }
  return j;
}

const guardar = async (j, cuenta) => {
  const s = { access: j.access_token, refresh: j.refresh_token, vence: Date.now() + j.expires_in * 1000, cuenta: cuenta ?? j.cuenta };
  await bd.guardar('sesion', s);
  return s;
};

/** Al cargar la app: si se vuelve de Microsoft con un código, se canjea. Devuelve la sesión o null. */
export async function terminarEntrada() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const pend = JSON.parse(sessionStorage.getItem('etq-oauth') ?? 'null');
  sessionStorage.removeItem('etq-oauth');
  history.replaceState(null, '', redireccion() + location.hash);
  if (q.has('error')) { const e = new Error(q.get('error_description') ?? q.get('error')); e.code = 'cancelado'; throw e; }
  if (!pend || pend.estado !== q.get('state')) { const e = new Error('state'); e.code = 'estado'; throw e; }
  const j = await alServidor('/api/sesion/canjear', { code: q.get('code'), verifier: pend.verificador, redirect_uri: redireccion() });
  return guardar(j);
}

let renovando = null;
/** Token de acceso vigente (lo renueva si está por vencer). null sin sesión. */
export async function tokenGraph() {
  if (!conOneDrive()) return null;
  const s = await sesionGuardada();
  if (!s) return null;
  if (Date.now() < s.vence - MARGEN_MS) return s.access;
  if (!navigator.onLine) return s.access;
  renovando ??= alServidor('/api/sesion/renovar', { refresh_token: s.refresh })
    .then((j) => guardar(j, s.cuenta))
    .finally(() => { renovando = null; });
  try { return (await renovando).access; } catch (e) {
    if (e.code === 'invalid_grant') { await bd.borrar('sesion'); return null; }
    throw e;
  }
}

/** Lo que el servidor pide para atender: el mismo token de Microsoft (lo revisa con Microsoft). */
export const tokenParaServidor = tokenGraph;

export async function salir() { await bd.borrar('sesion'); }
