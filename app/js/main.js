// App de etiquetas: arranque y direcciones (#/…). La app abre en Imprimir (ronda 4b).
import { html, render, useEffect, useState } from '../vendor/preact-htm.js';
import { T } from '../textos.js';
import { estado, cargar, useAlmacen, importar, suscribir } from './datos/almacen.js';
import { ENTORNO, conOneDrive } from './config.js';
import { entrar, terminarEntrada, sesionGuardada } from './datos/sesion.js';
import { iniciarSincronizacion, sincronizar, sincronizarLuego } from './datos/onedrive.js';
import { Btn, ir } from './ui.js';
import { seguirLecturas } from './lectura.js';
import * as Imp from './pantallas/imprimir.js';
import * as Prod from './pantallas/productos.js';
import * as Aj from './pantallas/ajustes.js';
import * as Nuevo from './pantallas/nuevo.js';
import * as Datos from './pantallas/datos.js';

const ruta = () => (location.hash.replace(/^#/, '') || '/imprimir').split('?')[0];

function pantalla(r) {
  const s = r.split('/').filter(Boolean).map(decodeURIComponent);
  const [a, b, c, d, e] = s;
  if (a === 'imprimir') {
    if (!b) return html`<${Imp.Elegir} />`;
    if (b === 'revisar') return html`<${Imp.Revisar} />`;
    if (b === 'peso') return html`<${Imp.Peso} key=${c} id=${c} desde=${d} />`;
    if (b === 'telefono') return html`<${Imp.Telefono} />`;
    if (b === 'pc') return html`<${Imp.Pc} />`;
    if (b === 'listo') return html`<${Imp.Listo} />`;
    if (b === 'ayuda') return html`<${Imp.Ayuda} />`;
  }
  if (a === 'productos') {
    if (!b) return html`<${Prod.Lista} />`;
    if (!c) return html`<${Prod.Ficha} id=${b} />`;
    const pant = { etiqueta: Prod.Etiqueta, grande: Prod.Grande, lleva: Prod.Lleva, eliminar: Prod.Eliminar, nombre: Prod.Nombre,
      datos: Datos.Datos, fotos: Datos.Fotos }[c];
    if (c === 'sello') return html`<${Prod.Sello} id=${b} sello=${d} />`;
    if (c === 'editar') return html`<${Datos.Editar} key=${d} id=${b} campo=${d} />`;
    if (pant) return html`<${pant} key=${b} id=${b} />`;
  }
  if (a === 'nuevo') {
    if (!b) return html`<${Nuevo.Fotos} />`;
    if (b === 'lectura') return html`<${Nuevo.Lectura} key=${c} id=${c} />`;
  }
  if (a === 'ajustes') {
    if (!b) return html`<${Aj.Ajustes} />`;
    if (b === 'codigos') {
      if (!c) return html`<${Aj.Codigos} />`;
      if (d === 'pasar' && e) return html`<${Aj.Pasar2} num=${c} id=${e} />`;
      if (d === 'pasar') return html`<${Aj.Pasar} num=${c} />`;
      if (d === 'quitar') return html`<${Aj.Quitar} num=${c} />`;
      return html`<${Aj.Codigo} num=${c} />`;
    }
  }
  return html`<${Imp.Elegir} />`;
}

/** Primera vez: entrar con Microsoft (o, en la versión de prueba, cargar la marca inventada). */
function Bienvenida({ error, trayendo }) {
  const [ocupado, setOcupado] = useState(false);
  const demo = async () => {
    setOcupado(true);
    const base = new URL('../../demo/', import.meta.url);
    const archivos = [{ ruta: 'company.json', contenido: await (await fetch(new URL('company.json', base))).text() }];
    for (const n of ['almendras-chocolate', 'mani-tostado', 'mezcla-demo', 'pasas-con-aceite', 'pistachos-salados', 'salsa-demo']) {
      archivos.push({ ruta: `products/${n}.json`, contenido: await (await fetch(new URL(`products/${n}.json`, base))).text() });
    }
    await importar(archivos);
  };
  return html`<div class="app" style=${`--ts:${estado.ajustes.ts ?? 1}`}><div class="zona"><main class="cuerpo centro">
    <h1 style="margin-top:32px">${T.inicio.titulo}</h1>
    ${trayendo ? html`<span class="girando" aria-hidden="true"></span><p class="espera-tx">${T.nuevo.todavia}</p><p role="status">${T.inicio.trayendo}</p>`
    : conOneDrive() ? html`<p>${T.inicio.entrarD}</p>
      ${error && html`<div class="nota" role="alert"><span class="tx">${error}</span></div>`}
      ${trayendo === false && html`<p>${T.inicio.vacia} ${T.inicio.vaciaD}</p>`}
      <${Btn} onClick=${() => entrar()}>${T.inicio.entrar}<//>`
    : html`<p>${T.inicio.demo}</p><${Btn} deshabilitado=${ocupado} onClick=${demo}>${T.inicio.cargarDemo}<//>`}
  </main></div></div>`;
}

function App() {
  useAlmacen();
  const [r, setR] = useState(ruta());
  const [inicio, setInicio] = useState({ error: null, trayendo: null });
  useEffect(() => {
    const f = () => { setR(ruta()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);
  useEffect(() => {
    // Al cambiar de pantalla, el foco va al título (lectores de pantalla y teclado)
    const h = document.querySelector('#contenido h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }, [r]);
  useEffect(() => {
    (async () => {
      if (!conOneDrive()) return;
      try {
        const nueva = await terminarEntrada();
        if (nueva || (await sesionGuardada())) {
          if (!estado.company) setInicio({ error: null, trayendo: true });
          await sincronizar();
          setInicio({ error: null, trayendo: estado.company ? null : false });
          iniciarSincronizacion();
        }
      } catch (e) {
        const msg = e.code === 'cuenta_no_permitida' ? T.inicio.cuentaNoPermitida : e.code === 'cancelado' ? T.inicio.cancelado : T.inicio.errorEntrar;
        setInicio({ error: msg, trayendo: null });
      }
    })();
  }, []);
  if (!estado.listo) return html`<p class="solo-lector" role="status">${T.comun.cargando}</p>`;
  if (!estado.company) return html`<${Bienvenida} ...${inicio} />`;
  return pantalla(r);
}

async function arrancar() {
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  await cargar();
  suscribir(() => { if (conOneDrive()) sincronizarLuego(); });
  render(html`<${App} />`, document.getElementById('app'));
  seguirLecturas();   // lecturas en espera (cuota, servicio ocupado): siguen solas
  document.title = ENTORNO.nombre;
}
arrancar();

// Para las pruebas automáticas (Playwright): cargar datos sin pasar por OneDrive
window.__etiquetas = { importar, estado, ir };
