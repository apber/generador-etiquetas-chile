// Preparar el teléfono para imprimir (18-11-2026, opción A) y Ajustes → Impresora.
// La guía aparece la primera vez que se imprime desde un teléfono, antes de la ventana de imprimir; el mismo contenido va
// en el desplegable de «Imprimir desde el teléfono» y se vuelve a abrir desde Ajustes → Impresora. La marca del teléfono
// se reconoce sola (Chrome en Android entrega el modelo) y solo si no se reconoce se pregunta. La marca de la impresora
// sale de app.json (se pregunta una vez si falta y vale para toda la empresa). «Ya está listo» se guarda en el teléfono.
import { html, useEffect, useState, useRef } from '../../vendor/preact-htm.js';
import { T } from '../../textos.js';
import { Cab, Btn, Fila, Info, Opcion, ir, avisar } from '../ui.js';
import { Pantalla } from '../marco.js';
import { estado, useAlmacen, guardarAjustes, guardarApp, reponerApp } from '../datos/almacen.js';
import { MARCAS_IMPRESORA, marcaImpresoraDe, marcaDeModelo, enlacePlayStore } from '../impresora-marcas.js';
import { esTelefono } from './imprimir.js';

const P = T.preparar;

// ---- Marca del teléfono ----
let detectada;   // undefined = sin buscar; null = no se reconoce
async function detectar() {
  if (detectada !== undefined) return detectada;
  let modelo = '';
  try { modelo = (await navigator.userAgentData?.getHighEntropyValues?.(['model']))?.model ?? ''; } catch { /* sin permiso */ }
  detectada = marcaDeModelo(modelo, navigator.userAgent);
  return detectada;
}
/** { marca: 'samsung' | 'xiaomi' | 'otra' | null, sola: reconocida por la app, buscando }. La elegida a mano gana. */
function useMarcaTelefono() {
  const elegida = estado.ajustes.telefono?.marca ?? null;
  const [d, setD] = useState(detectada);
  useEffect(() => { if (!elegida && d === undefined) detectar().then(setD); }, [elegida]);
  if (elegida) return { marca: elegida, sola: false, buscando: false };
  return { marca: d ?? null, sola: Boolean(d), buscando: d === undefined };
}
const guardarTelefono = (cambios) => guardarAjustes({ telefono: { ...(estado.ajustes.telefono ?? {}), ...cambios } });

/** El teléfono quedó preparado para la marca de impresora de ahora (si cambia la marca, hay que prepararlo de nuevo). */
export function telefonoListo() {
  const listo = estado.ajustes.telefono?.listo;
  return Boolean(listo) && listo === (marcaImpresoraDe(estado.app) ?? 'otra');
}

const OPCIONES_IMP = [...Object.entries(MARCAS_IMPRESORA).map(([id, m]) => [id, m.nombre]), ['otra', T.impresora.otra]];

/** Elegir la marca de la impresora (guarda en app.json, con «Deshacer»). */
function ElegirMarcaImpresora({ titulo, d, id = 't-marca-imp' }) {
  const actual = marcaImpresoraDe(estado.app);
  const elegir = async (v) => {
    const antes = await guardarApp({ marcaImpresora: v });
    avisar(actual ? T.impresora.guardado(T.impresora.laMarca) : `${T.impresora.marcaT}: ${v === 'otra' ? T.impresora.otra.toLowerCase() : MARCAS_IMPRESORA[v].nombre}.`,
      () => reponerApp(antes));
  };
  return html`<div class="grupo"><h2 id=${id}>${titulo}</h2>${d && html`<p class="chico">${d}</p>`}
    <div class="tarjeta lista" role="radiogroup" aria-labelledby=${id}>
      ${OPCIONES_IMP.map(([v, n]) => html`<${Opcion} key=${v} nombre=${id} valor=${v} elegido=${actual === v} n=${n} onElegir=${elegir} />`)}
    </div></div>`;
}

/** Pasos para preparar el teléfono, según la marca del teléfono y la de la impresora. */
function Pasos({ tel }) {
  const imp = MARCAS_IMPRESORA[marcaImpresoraDe(estado.app)] ?? null;
  const c = imp?.complemento ?? P.complemento;
  const nombreC = imp ? `«${c}»` : c;
  const pasos = [
    imp ? [P.instalarT(c), P.instalarD, enlacePlayStore(imp.paquete)] : [P.instalarOtraT, P.instalarOtraD, null],
    [P.activarT, P.activarD(imp ? c : 'el complemento de tu impresora', tel)],
    [P.bateriaT, P.bateriaD(imp ? c : 'el complemento', tel)],
  ];
  if (tel === 'xiaomi') pasos.push([P.autoT, P.autoD(imp ? c : 'el complemento')]);
  return html`<ol class="pasos">${pasos.map(([t, d, enlace], i) => html`<li key=${i}>
      <span class="num" aria-hidden="true">${i + 1}</span>
      <div class="tx"><h3>${t}</h3><p>${d}</p>
        ${enlace && html`<a class="btn secundario chico" href=${enlace} target="_blank" rel="noopener">${P.playStore}</a>`}</div></li>`)}</ol>
    ${tel !== 'xiaomi' && tel !== 'samsung' && html`<p class="chico">${P.autoOtraD(nombreC)}</p>`}
    <p class="chico">${P.primeraVez(nombreC)}</p>`;
}

/** La guía completa: marca del teléfono (reconocida o preguntada), marca de la impresora si falta, y los pasos. */
export function GuiaTelefono({ id = 'guia' }) {
  useAlmacen();
  const { marca, buscando } = useMarcaTelefono();
  const [cambiando, setCambiando] = useState(false);
  if (buscando) return html`<p class="chico" role="status">${T.comun.cargando}</p>`;
  const sinImp = marcaImpresoraDe(estado.app) == null;
  const preguntarTel = !marca || cambiando;
  return html`
    ${preguntarTel ? html`<div class="grupo"><h2 id=${`${id}-tel`}>${P.preguntaTel}</h2>
      <div class="tarjeta lista" role="radiogroup" aria-labelledby=${`${id}-tel`}>
        ${[['samsung', 'Samsung'], ['xiaomi', 'Xiaomi', P.xiaomiD], ['otra', P.otraTel]].map(([v, n, d]) => html`<${Opcion} key=${v}
          nombre=${`${id}-tel`} valor=${v} elegido=${marca === v} n=${n} d=${d}
          onElegir=${(x) => { guardarTelefono({ marca: x }); setCambiando(false); }} />`)}</div></div>`
    : html`<div class="elegidas"><p class="chico">${P.pasosPara(P.tel[marca])}</p>
      <${Btn} tipo="texto" onClick=${() => setCambiando(true)}>${P.cambiarTel}<//></div>`}
    ${sinImp && marca && !cambiando && html`<${ElegirMarcaImpresora} titulo=${P.preguntaImp} d=${P.preguntaImpD} id=${`${id}-imp`} />`}
    ${marca && !cambiando && !sinImp && html`<${Pasos} tel=${marca} />`}`;
}

/**
 * Pantalla «Preparar este teléfono para imprimir». desde: 'imprimir' (la primera vez, antes de la ventana de imprimir:
 * al terminar sigue a «Imprimir desde el teléfono»), 'ajustes' o 'ayuda' (vuelve a donde estaba).
 */
export function Preparar({ desde = 'ajustes' }) {
  useAlmacen();
  const { marca } = useMarcaTelefono();
  const listoPara = () => marcaImpresoraDe(estado.app) ?? 'otra';
  const volver = { imprimir: '/imprimir/revisar', ayuda: '/imprimir/ayuda', ajustes: '/ajustes/impresora' }[desde] ?? '/ajustes/impresora';
  const donde = { imprimir: T.revisar.titulo, ayuda: T.ayuda.titulo, ajustes: T.impresora.titulo }[desde] ?? T.impresora.titulo;
  const listo = async () => {
    await guardarTelefono({ listo: listoPara() });
    avisar(P.listoAviso);
    if (desde === 'imprimir') ir('/imprimir/telefono', { reemplazar: true });
    else ir(volver);
    setTimeout(() => { window.scrollTo(0, 0); document.querySelector('#contenido h1')?.focus({ preventScroll: true }); }, 0);
  };
  const puede = Boolean(marca) && marcaImpresoraDe(estado.app) != null;
  return html`<${Pantalla} sec=${desde === 'ajustes' ? 'ajustes' : 'imprimir'} titulo=${P.titulo}
    cab=${html`<${Cab} volver=${volver} donde=${donde} />`}>
    <p>${P.intro}</p>
    <${GuiaTelefono} id="guia" />
    <${Btn} deshabilitado=${!puede} alDeshabilitado=${() => avisar(!marca ? P.preguntaTel : P.preguntaImp)} onClick=${listo}>${P.listo}<//>
  <//>`;
}

// ---- Ajustes → Impresora ----
export function Impresora() {
  useAlmacen();
  const tel = esTelefono();
  return html`<${Pantalla} sec="ajustes" titulo=${T.impresora.titulo}
    cab=${html`<${Cab} volver="/ajustes" etiquetaVolver="Volver a Ajustes" donde=${T.ajustes.titulo} />`}>
    <p class="chico">${T.impresora.intro}</p>
    <${ElegirMarcaImpresora} titulo=${T.impresora.marcaT} d=${T.impresora.marcaD} />
    <div class="tarjeta lista">
      <${Fila} primera n=${T.impresora.nombre} d=${estado.app.impresora || T.impresora.sinNombre} onClick=${() => ir('/ajustes/impresora/nombre')} />
      <${Fila} n=${T.impresora.papel} d=${estado.app.papel || T.impresora.sinPapel} onClick=${() => ir('/ajustes/impresora/papel')} />
    </div>
    ${tel && html`<div class="grupo"><h2>${T.impresora.telefono}</h2><div class="tarjeta lista">
      <${Fila} primera n=${P.titulo} d=${telefonoListo() ? T.impresora.preparado : T.impresora.sinPreparar} onClick=${() => ir('/imprimir/preparar/ajustes')} /></div></div>`}
    <${Info}>${T.impresora.prueba}<//>
  <//>`;
}

/** Cambiar el nombre de la impresora del computador o el papel (texto). */
export function EditarImpresora({ campo }) {
  useAlmacen();
  const clave = campo === 'papel' ? 'papel' : 'impresora';
  const [v, setV] = useState(estado.app[clave] ?? '');
  const [err, setErr] = useState(null);
  const ref = useRef(null);
  const volver = () => ir('/ajustes/impresora');
  const guardar = async () => {
    const x = v.trim();
    if (clave === 'impresora' && !x) { setErr(T.impresora.vacio); ref.current?.focus(); return; }
    if (x === (estado.app[clave] ?? '')) { volver(); return; }
    const antes = await guardarApp({ [clave]: x || null });
    avisar(clave === 'impresora' ? T.impresora.guardado(T.impresora.elNombre) : T.impresora.guardadoPapel, () => reponerApp(antes));
    volver();
  };
  const nombre = clave === 'papel' ? T.impresora.papel : T.impresora.nombre;
  return html`<${Pantalla} sec="ajustes" titulo=${nombre}
    cab=${html`<${Cab} volver=${volver} etiquetaVolver="Volver a Impresora" donde=${T.impresora.titulo} />`}>
    <div class="campo"><label for="v">${nombre}</label>
      <input id="v" ref=${ref} autocomplete="off" value=${v} placeholder=${clave === 'papel' ? T.impresora.papelEj : T.impresora.nombreEj}
        aria-describedby="v-ayuda" aria-invalid=${err ? 'true' : undefined}
        onInput=${(e) => { setV(e.target.value); setErr(null); }} onKeyDown=${(e) => { if (e.key === 'Enter') guardar(); }} />
      <span id="v-ayuda" class="ayuda">${err ? html`<span class="error" role="alert">${err}</span>` : (clave === 'papel' ? T.impresora.papelD : T.impresora.nombreD)}</span></div>
    <${Btn} onClick=${guardar}>${T.impresora.guardar(clave === 'papel' ? T.impresora.elPapel : T.impresora.elNombre)}<//>
  <//>`;
}

