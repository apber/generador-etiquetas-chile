// Componentes de la interfaz (base visual E). Preact + htm, sin compilación.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { T } from '../textos.js';

export { html };

/** Ícono del sprite (index.html). */
export const Ico = ({ n }) => html`<svg class="i" aria-hidden="true"><use href=${`#i-${n}`}></use></svg>`;

/** Lleva a una dirección de la app (#/…). */
export function ir(ruta, { reemplazar = false } = {}) {
  const h = `#${ruta}`;
  if (reemplazar) location.replace(h); else location.hash = h;
}

/** Cabecera con «Volver». */
export function Cab({ volver, etiquetaVolver, donde }) {
  return html`<header class="cab">
    ${volver != null && html`<button class="btn-cab" type="button" aria-label=${etiquetaVolver ?? T.comun.volver}
      onClick=${() => (typeof volver === 'function' ? volver() : ir(volver))}><${Ico} n="atras" />${T.comun.volver}</button>`}
    ${donde && html`<span class="donde">${donde}</span>`}
  </header>`;
}

/** Botón. tipo: primario | secundario | peligro | texto. */
export function Btn({ tipo = 'primario', ico, children, onClick, deshabilitado, chico, ...resto }) {
  return html`<button type="button" class=${`btn ${tipo}${chico ? ' chico' : ''}`} aria-disabled=${deshabilitado ? 'true' : undefined}
    onClick=${(e) => { if (deshabilitado) { resto.alDeshabilitado?.(e); return; } onClick?.(e); }} ...${resto}>
    ${ico && html`<${Ico} n=${ico} />`}${children}</button>`;
}

/** Fila de una lista que lleva a otra pantalla. */
export function Fila({ n, d, marca, onClick, primera }) {
  return html`<button type="button" class=${`fila${primera ? ' primera' : ''}`} onClick=${onClick}>
    <span class="tx"><span class="n">${n}</span>${marca}${d && html`<span class="d">${d}</span>`}</span><${Ico} n="sig" /></button>`;
}

export const MarcaRevisar = () => html`<span class="et du"><${Ico} n="excl" />${T.productos.porRevisar}</span>`;

/** Aviso naranja con una acción. */
export function Nota({ children, accion, onAccion }) {
  return html`<div class="nota"><${Ico} n="alerta" /><span class="tx">${children}</span>
    ${accion && html`<button class="pastilla" type="button" onClick=${onAccion}>${accion}</button>`}</div>`;
}

export const Info = ({ children }) => html`<div class="info"><${Ico} n="info" /><p>${children}</p></div>`;

/** Interruptor Va / No va. */
export function Interruptor({ n, d, va, onClick, primera }) {
  return html`<button type="button" role="switch" aria-checked=${va ? 'true' : 'false'} class=${`fila${primera ? ' primera' : ''}`} onClick=${onClick}>
    <span class="tx"><span class="n">${n}</span>${d && html`<span class="d">${d}</span>`}</span>
    <span class="inter"><i aria-hidden="true"></i><span>${va ? T.lleva.va : T.lleva.noVa}</span></span></button>`;
}

/** Opción de una sola elección (radio del sistema). */
export function Opcion({ nombre, valor, elegido, n, d, onElegir }) {
  return html`<label class="opcion"><input type="radio" name=${nombre} value=${valor} checked=${elegido} onChange=${() => onElegir(valor)} />
    <span class="tx"><span class="n">${n}</span>${d && html`<span class="d">${d}</span>`}</span></label>`;
}

// ---- Barra «Deshacer» (una para toda la app) ----
// El mensaje vive fuera del componente: si la pantalla cambia (p. ej. tras eliminar), sigue a la vista en la nueva.
let barraActual = null;
const verBarra = new Set();
const ponerBarra = (b) => { barraActual = b; verBarra.forEach((f) => f(b)); };
/** Muestra un mensaje abajo, con «Deshacer» si se da una función. */
export const avisar = (texto, deshacer = null) => ponerBarra({ texto, deshacer, k: Date.now() });

export function Barra() {
  const [b, setB] = useState(barraActual);
  const encima = useRef(0);
  const reloj = useRef(null);
  useEffect(() => { verBarra.add(setB); return () => verBarra.delete(setB); }, []);
  const cerrarLuego = () => { clearTimeout(reloj.current); reloj.current = setTimeout(() => { if (!encima.current) ponerBarra(null); }, 6000); };
  useEffect(() => { if (b) { encima.current = 0; cerrarLuego(); } return () => clearTimeout(reloj.current); }, [b?.k]);
  if (!b) return html`<div role="status" class="solo-lector"></div>`;
  const marca = (bit, si) => () => { encima.current = si ? encima.current | bit : encima.current & ~bit; if (si) clearTimeout(reloj.current); else if (!encima.current) cerrarLuego(); };
  return html`<div class="barra" role="status" onMouseEnter=${marca(1, true)} onMouseLeave=${marca(1, false)} onFocusIn=${marca(2, true)} onFocusOut=${marca(2, false)}>
    <span>${b.texto}</span>
    ${b.deshacer && html`<button type="button" onClick=${() => { b.deshacer(); ponerBarra(null); }}>${T.comun.deshacer}</button>`}</div>`;
}

/** Plural simple: pl(3, 'etiqueta', 'etiquetas') → «3 etiquetas». */
export const pl = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «12 de noviembre» (con el año si no es el actual). */
export function fecha(iso) {
  const d = new Date(iso);
  const s = `${d.getDate()} de ${MESES[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear() ? s : `${s} de ${d.getFullYear()}`;
}
export const hora = (iso) => new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
export const gramos = (g) => `${String(g).replace('.', ',')} g`;
