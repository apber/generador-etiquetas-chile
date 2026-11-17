// Arma la copia publicable de la app en dist/ (Cloudflare Pages: comando de compilación «node scripts/app-entorno.mjs»,
// carpeta de salida «dist»). No compila nada: copia app/, src/, data/ y demo/ y escribe el entorno y el manifiesto con
// las variables de entorno del proyecto de Cloudflare (no quedan en el repositorio):
//   APP_ENTORNO   produccion | dev
//   APP_NOMBRE    nombre de la app en el teléfono (p. ej. el de la marca; con dev se le agrega « DEV»)
//   APP_API       dirección del servidor (Cloudflare Worker)
//   MS_CLIENT_ID  identificador de la app registrada en Microsoft (para OneDrive)
//   APP_CARPETA   carpeta de OneDrive con los datos (p. ej. «Empresa Gestión/Etiquetas»)
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(RAIZ, 'dist');
const e = process.env;
const id = e.APP_ENTORNO === 'produccion' ? 'produccion' : 'dev';
const dev = id === 'dev';
const nombre = `${e.APP_NOMBRE || 'Etiquetas'}${dev ? ' DEV' : ''}`;
const version = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST);
for (const d of ['app', 'src', 'data', 'demo']) cpSync(join(RAIZ, d), join(DIST, d), { recursive: true });
writeFileSync(join(DIST, 'index.html'), '<!doctype html><meta http-equiv="refresh" content="0; url=app/"><a href="app/">Abrir la app</a>\n');

const entorno = {
  id, nombre, version, api: (e.APP_API || '').replace(/\/$/, ''),
  microsoft: e.MS_CLIENT_ID ? { clientId: e.MS_CLIENT_ID, carpeta: e.APP_CARPETA || 'Etiquetas' } : null,
  compilado: new Date().toISOString(), commit: (e.CF_PAGES_COMMIT_SHA || '').slice(0, 7),
};
writeFileSync(join(DIST, 'app', 'entorno.js'), `// Generado por scripts/app-entorno.mjs\nexport default ${JSON.stringify(entorno, null, 2)};\n`);

const ic = dev ? 'icono-dev' : 'icono';
const manifiesto = {
  name: nombre, short_name: nombre, lang: 'es', start_url: './#/imprimir', scope: './', display: 'standalone',
  background_color: '#F8F3E8', theme_color: '#F8F3E8',
  icons: [
    { src: `iconos/${ic}-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `iconos/${ic}-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `iconos/${ic}-m-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
  share_target: undefined,
};
writeFileSync(join(DIST, 'app', 'manifest.webmanifest'), JSON.stringify(manifiesto, null, 2));
// El ícono de la pestaña y el número de versión de la caché (sw.js) cambian con cada publicación
writeFileSync(join(DIST, 'app', 'iconos', 'icono.svg'), readFileSync(join(RAIZ, 'app', 'iconos', `${ic}.svg`)));
const sw = readFileSync(join(RAIZ, 'app', 'sw.js'), 'utf8').replace("'etiquetas-local'", `'etiquetas-${id}-${version}-${entorno.commit || Date.now()}'`);
writeFileSync(join(DIST, 'app', 'sw.js'), sw);
console.log(`dist/ listo: ${nombre} (${id}), servidor ${entorno.api || '—'}, OneDrive ${entorno.microsoft ? 'sí' : 'no'}`);
