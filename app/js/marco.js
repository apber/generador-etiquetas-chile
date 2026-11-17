// Estructura de cada pantalla: menú al costado (PC, desde 760 px) o pestañas abajo (teléfono), con las tres secciones
// «Imprimir etiquetas · Productos · Ajustes»; acción principal fija abajo; barra «Deshacer» (ronda 4b).
import { html, Ico, ir, Barra } from './ui.js';
import { T } from '../textos.js';
import { estado } from './datos/almacen.js';
import { porRevisar } from './productos-info.js';

const SECCIONES = [['imprimir', T.secciones.imprimir, 'imp', '/imprimir'], ['productos', T.secciones.productos, 'bolsa', '/productos'],
  ['ajustes', T.secciones.ajustes, 'ajustes', '/ajustes']];

function Nav({ sec, lado }) {
  const n = porRevisar().length;
  return SECCIONES.map(([id, nombre, ico, ruta]) => {
    const ins = id === 'productos' && n > 0;
    const insignia = ins && html`<span aria-hidden="true" class="insignia">${n}</span>`;
    return html`<button class="nav" type="button" aria-current=${id === sec ? 'page' : undefined}
      aria-label=${ins ? T.secciones.conRevisar(nombre, n) : undefined} onClick=${() => ir(ruta)}>
      <span class="ico"><${Ico} n=${ico} />${!lado && insignia}</span><span class="t">${nombre}</span>${lado && insignia}</button>`;
  });
}

export function logoUrl() {
  const m = estado.marca;
  return m?.urls?.[m.assets?.logo] ?? null;
}

/**
 * Una pantalla. sec: sección marcada en la navegación; raiz: pantalla principal de la sección (logo y título);
 * cab: cabecera («Volver»); fijo: acción principal fija abajo.
 */
export function Pantalla({ sec, raiz, titulo, cab, fijo, centro, children }) {
  const logo = logoUrl();
  return html`<div class=${`app${raiz ? ' raiz' : ''}`} style=${`--ts:${estado.ajustes.ts ?? 1}`}>
    <nav class="lado" aria-label=${T.secciones.nombreNav}><div class="lado-in">
      ${logo && html`<img class="logo-lado" alt=${T.app.logo} src=${logo} />`}<${Nav} sec=${sec} lado=${true} /></div></nav>
    <div class="zona">
      ${cab}
      <main class=${`cuerpo${centro ? ' centro' : ''}`} id="contenido">
        ${raiz && html`<div class="titulo">${logo && html`<img class="logo-chico" alt=${T.app.logo} src=${logo} />`}<h1>${titulo}</h1></div>`}
        ${!raiz && titulo && html`<h1>${titulo}</h1>`}
        ${children}
      </main>
      <div class="pie"><${Barra} />${fijo && html`<div class="fijo">${fijo}</div>`}
        <nav class="pestanas" aria-label=${T.secciones.nombreNav}><${Nav} sec=${sec} lado=${false} /></nav></div>
    </div>
  </div>`;
}
