// Llamadas al servidor (Cloudflare Worker; en local, el servidor de desarrollo). Va con la sesión de Microsoft para que
// el servidor atienda solo a las cuentas permitidas.
import { ENTORNO } from './config.js';
import { tokenParaServidor } from './datos/sesion.js';

export class ErrorServidor extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

const base = () => {
  if (ENTORNO.api == null) throw new ErrorServidor('sin_servidor', 'Esta versión de prueba no tiene servidor.');
  return ENTORNO.api;
};

async function cabeceras() {
  const h = { 'Content-Type': 'application/json' };
  const t = await tokenParaServidor();
  if (t) h.Authorization = `Bearer ${t}`;
  return h;
}

async function pedir(ruta, cuerpo, { signal } = {}) {
  if (!navigator.onLine) throw new ErrorServidor('sin_conexion', 'Sin conexión a internet.');
  let r;
  try {
    r = await fetch(`${base()}${ruta}`, { method: 'POST', headers: await cabeceras(), body: JSON.stringify(cuerpo), signal });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ErrorServidor('sin_conexion', 'No se pudo conectar con el servidor.');
  }
  if (r.status === 401 || r.status === 403) throw new ErrorServidor('sin_permiso', 'El servidor no reconoce la cuenta.', r.status);
  if (r.status === 429) throw new ErrorServidor('limite', 'Se alcanzó el límite de hoy.', r.status);
  if (!r.ok) throw new ErrorServidor('servidor', `El servidor respondió ${r.status}.`, r.status);
  return r;
}

const deBase64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)).buffer;

export const api = {
  /** PDF de una etiqueta: { pdf (ArrayBuffer), html, result }. */
  async etiqueta(cuerpo) {
    const j = await (await pedir('/api/etiqueta', cuerpo)).json();
    return { pdf: deBase64(j.pdf), html: j.html, result: j.result };
  },
  /** fetch para src/reading/gemini.js: la misma llamada a Gemini, pero por el servidor (que tiene la clave). */
  geminiFetch: async (url, init) => {
    const u = new URL(url);
    const ruta = u.pathname.replace(/^\/v1beta\//, '');
    // La clave la pone el servidor: la cabecera de clave no sale del dispositivo
    const { 'x-goog-api-key': _, ...resto } = init?.headers ?? {};
    return fetch(`${base()}/api/gemini/${ruta}`, { ...init, headers: { ...resto, ...(await cabeceras()) } });
  },
};
