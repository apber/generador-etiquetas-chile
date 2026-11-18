// Imprimir etiquetas (ronda 4 y 4b): elegir, peso (y pasas del Mix), revisar, imprimir desde el teléfono (ventana de
// imprimir del sistema, desde el 18-11-2026; antes la app de Epson) o desde el PC (con la impresora de etiquetas), listo
// y ayuda. La hoja la arma el dispositivo con la etiqueta guardada de cada producto.
import { html, useEffect, useState, useRef } from '../../vendor/preact-htm.js';
import { T } from '../../textos.js';
import { Cab, Btn, Fila, Nota, Info, Ico, Opcion, ir, avisar, pl, fecha, hora, gramos } from '../ui.js';
import { Pantalla } from '../marco.js';
import { estado, useAlmacen, guardarSeleccion, guardarProducto, anotarImpresion, agregarParaImprimir, quitarParaImprimir } from '../datos/almacen.js';
import { vendibles, avisos } from '../productos-info.js';
import { planHojas, hojaPdf, hojaPagina, vistaPrevia, etiquetaPdf, indicePeso } from '../etiquetas.js';
import { VistaEtiqueta } from '../vista-etiqueta.js';
import { textoAviso } from '../avisos.js';
import { nextFreeBarcode } from '../../../src/barcodes.js';
import { labelBox } from '../../../src/sheet/plan.js';
import { sheetCss, sheetSections } from '../../../src/sheet/page.js';
import { LABEL_FONTS } from '../../../src/render/label-pdf.js';
import { MM } from '../../../src/template/geometry.js';

export const esTelefono = () => /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);

// ---- Selección (cuántas etiquetas de cada producto, con su peso y variante) ----
const nombre = (id) => estado.products.get(id)?.product_name ?? id;
/** Peso y variante por defecto: los de la última impresión del producto o su primera presentación. */
export function porDefecto(id) {
  const p = estado.products.get(id);
  return { peso: p.last_print?.net_weight_g ?? p.presentations?.[0]?.net_weight_g ?? 50, variante: p.last_print?.variant ?? {} };
}
const sel = () => estado.seleccion;
export const lista = () => Object.entries(sel()).filter(([id, s]) => s.n > 0 && estado.products.has(id))
  .map(([id, s]) => ({ id, n: s.n, peso: s.peso, variante: s.variante ?? {} }))
  .sort((a, b) => nombre(a.id).localeCompare(nombre(b.id), 'es'));
const total = (l) => l.reduce((s, x) => s + x.n, 0);
/** Selección con las cantidades de una impresión anterior o de un trabajo (los productos que ya no están se saltan). */
const seleccionDe = (items) => Object.fromEntries(items.filter((it) => estado.products.has(it.id))
  .map((it) => [it.id, { n: it.n, peso: it.peso, variante: it.variante ?? {} }]));

async function poner(id, n) {
  const s = { ...sel() };
  if (n <= 0) delete s[id]; else s[id] = { ...(s[id] ?? porDefecto(id)), n };
  await guardarSeleccion(s);
}
/** Desde la ficha: «Imprimir etiquetas» pone 1 si no había y lleva a Imprimir. */
export async function agregarAImprimir(id) {
  if (!(sel()[id]?.n > 0)) await poner(id, 1);
  ir('/imprimir');
}

/** Variantes de un Mix: componentes con alternativas. */
function opcionesVariante(p) {
  return (p.recipe?.components ?? []).filter((c) => c.alternatives?.length)
    .map((c) => ({ componente: c.product, opciones: [c.product, ...c.alternatives] }));
}
const textoVariante = (p, variante) => opcionesVariante(p).map((o) => (estado.products.get(variante?.[o.componente] ?? o.componente)?.product_name ?? '').toLowerCase()).filter(Boolean).join(', ');
const detalle = (id, s) => [gramos(s.peso), textoVariante(estado.products.get(id), s.variante)].filter(Boolean).join(' · ');

function useHojas(l) {
  const [h, setH] = useState(null);
  const clave = JSON.stringify([l, estado.version]);
  useEffect(() => {
    let vivo = true;
    if (!l.length) { setH({ hojas: 0, libres: 0 }); return undefined; }
    planHojas(l).then((r) => vivo && setH(r)).catch(() => vivo && setH(null));
    return () => { vivo = false; };
  }, [clave]);
  return h;
}

export function Elegir() {
  useAlmacen();
  const prods = vendibles();
  const l = lista();
  const h = useHojas(l);
  const t = total(l);
  const ultima = estado.impresiones[estado.impresiones.length - 1];
  const tel = esTelefono();
  const repetir = async () => {
    const antes = sel();
    await guardarSeleccion(seleccionDe(ultima.items));
    avisar(T.imprimir.repetida, () => guardarSeleccion(antes));
  };
  const resumen = t ? T.imprimir.resumen(pl(t, 'etiqueta', 'etiquetas'), h ? pl(h.hojas, 'hoja', 'hojas') : '…') : T.imprimir.tocaMas;
  return html`<${Pantalla} sec="imprimir" raiz titulo=${T.imprimir.titulo}
    fijo=${prods.length > 0 && html`<${Btn} deshabilitado=${!t} alDeshabilitado=${() => avisar(T.imprimir.eligeUna)} onClick=${() => ir('/imprimir/revisar')}>
      <span>${T.imprimir.revisarImprimir}</span><small>${resumen}</small><//>`}>
    ${!tel && estado.paraImprimir.length > 0 && html`<section class="grupo"><h2>${T.imprimir.paraImprimir(estado.paraImprimir.length)}</h2>
      <div class="tarjeta lista">${estado.paraImprimir.map((tr, i) => html`<${Fila} key=${tr.id} primera=${i === 0} n=${T.imprimir.mandada}
        d=${T.imprimir.mandadaD(`${fecha(tr.fecha)} a las ${hora(tr.fecha)}`, pl(tr.etiquetas, 'etiqueta', 'etiquetas'), `${pl(tr.hojas, 'hoja', 'hojas')} carta`)}
        onClick=${() => usarTrabajo(tr)} />`)}</div></section>`}
    ${ultima && html`<button class="tile" type="button" onClick=${repetir}><span class="ico"><${Ico} n="repetir" /></span><span class="tx">
      <span class="t">${T.imprimir.repetir}</span><span class="d">${T.imprimir.repetirD(fecha(ultima.fecha), ultima.items.map((x) => `${x.n} ${x.nombre}`).join(', ').replace(/, ([^,]*)$/, ' y $1'))}</span></span></button>`}
    ${prods.length ? html`<p class="chico">${T.imprimir.elige}</p>
      <ul class="tarjeta lista">${prods.map((p) => {
        const s = sel()[p.id];
        const n = s?.n ?? 0;
        return html`<li key=${p.id} class=${`item${n ? ' si' : ''}`}><span class="n">${p.product_name}</span>
          <span class="cont" role="group" aria-label=${p.product_name}>
            <button type="button" aria-label=${T.imprimir.menos(p.product_name)} aria-disabled=${n ? undefined : 'true'} onClick=${() => n && poner(p.id, n - 1)}><${Ico} n="menos" /></button>
            <output class=${n ? 'si' : ''} aria-live="polite" aria-label=${T.imprimir.cuantas(n, p.product_name)}>${n}</output>
            <button type="button" aria-label=${T.imprimir.mas(p.product_name)} onClick=${() => poner(p.id, n + 1)}><${Ico} n="mas" /></button></span>
          ${n > 0 && html`<span class="extra"><button type="button" class="chip" aria-label=${T.imprimir.cambiarPeso(p.product_name)}
            onClick=${() => ir(`/imprimir/peso/${p.id}`)}>${detalle(p.id, s)} · <b>${T.imprimir.cambiar}</b></button></span>`}</li>`;
      })}</ul>`
    : html`<div class="tarjeta"><p>${T.imprimir.sinProductos}</p><${Btn} tipo="secundario" onClick=${() => ir('/productos')}>${T.imprimir.irProductos}<//></div>`}
  <//>`;
}

async function usarTrabajo(tr) {
  await guardarSeleccion(seleccionDe(tr.items));
  trabajoActual = tr.id;
  ir('/imprimir/pc');
}
let trabajoActual = null;

// ---- Peso neto (y pasas del Mix) ----
export function Peso({ id, desde }) {
  useAlmacen();
  const p = estado.products.get(id);
  const s = sel()[id] ?? { ...porDefecto(id), n: 0 };
  const pesos = [...new Set([s.peso, ...(p?.presentations ?? []).map((x) => x.net_weight_g)])];
  const [eleccion, setEleccion] = useState(String(s.peso));
  const [otro, setOtro] = useState('');
  const [variante, setVariante] = useState(s.variante ?? {});
  const [codigo, setCodigo] = useState(null);   // decisión sobre el peso nuevo: 'asignado' | 'sin'
  const campo = useRef(null);
  if (!p) return null;
  const pesoOtro = Number(otro.replace(',', '.'));
  const otroOk = Number.isFinite(pesoOtro) && pesoOtro >= 1 && pesoOtro <= 5000;
  const peso = eleccion === 'otro' ? (otroOk ? pesoOtro : null) : Number(eleccion);
  const nuevo = peso != null && indicePeso(p, peso) < 0;
  const vars = opcionesVariante(p);
  const volver = () => ir(desde === 'revisar' ? '/imprimir/revisar' : '/imprimir');
  const libre = nextFreeBarcode(estado.company ?? {}, estado.products);
  const viejo = p.presentations?.find((x) => x.barcode)?.net_weight_g;

  const crearPresentacion = async (barcode) => {
    const pr = { net_weight_g: peso, container: p.presentations?.[0]?.container ?? 'small_pouch', barcode, barcode_source: barcode ? 'own' : null };
    const antes = p.presentations;
    await guardarProducto({ ...p, presentations: [...(p.presentations ?? []), pr] });
    setCodigo(barcode ? 'asignado' : 'sin');
    avisar(barcode ? T.peso.asignado(barcode) : T.peso.sinCodigo(gramos(peso)), async () => {
      await guardarProducto({ ...estado.products.get(id), presentations: antes });
      setCodigo(null);
    });
  };
  const usar = async () => {
    if (peso == null) { campo.current?.focus(); return; }
    if (nuevo) { avisar(T.peso.nuevo(gramos(peso))); return; }
    await guardarSeleccion({ ...sel(), [id]: { n: Math.max(1, s.n), peso, variante } });
    await guardarProducto({ ...estado.products.get(id), last_print: { net_weight_g: peso, variant: variante } });
    volver();
  };
  const textoUsar = peso == null ? T.peso.usar(T.peso.otro.toLowerCase())
    : vars.length ? T.peso.usarMix(gramos(peso), textoVariante(p, variante).replace(/^pasas /, '')) : T.peso.usar(gramos(peso));
  return html`<${Pantalla} sec="imprimir" titulo=${p.product_name}
    cab=${html`<${Cab} volver=${volver} donde=${desde === 'revisar' ? T.revisar.titulo : T.imprimir.titulo} />`}>
    <div class="grupo"><h2 id="t-peso">${T.peso.titulo}</h2>
      <div class="tarjeta lista" role="radiogroup" aria-labelledby="t-peso">
        ${pesos.map((g, i) => html`<${Opcion} key=${g} nombre="peso" valor=${String(g)} elegido=${eleccion === String(g)} n=${gramos(g)}
          d=${i === 0 && p.last_print ? T.peso.ultima : null} onElegir=${(v) => { setEleccion(v); setCodigo(null); }} />`)}
        <${Opcion} nombre="peso" valor="otro" elegido=${eleccion === 'otro'} n=${T.peso.otro} onElegir=${(v) => { setEleccion(v); setCodigo(null); setTimeout(() => campo.current?.focus(), 0); }} />
      </div>
      ${eleccion === 'otro' && html`<div class="campo"><label for="otro-peso">${T.peso.gramos}</label>
        <input id="otro-peso" ref=${campo} inputmode="numeric" autocomplete="off" value=${otro} aria-describedby="otro-ayuda"
          onInput=${(e) => { setOtro(e.target.value); setCodigo(null); }} />
        <span id="otro-ayuda" class="ayuda">${otro && !otroOk ? html`<span class="error">${T.peso.gramosMal}</span>` : T.peso.gramosAyuda}</span></div>`}
    </div>
    ${nuevo && !codigo && html`<div class="nota" role="group"><${Ico} n="alerta" /><span class="tx">${T.peso.nuevo(gramos(peso), viejo && gramos(viejo))}</span>
      <div class="fila-botones" style="flex-basis:100%">
        ${libre ? html`<${Btn} tipo="secundario" chico onClick=${() => crearPresentacion(libre)}>${T.peso.asignar(libre)}<//>`
          : html`<p>${T.peso.noQuedan}</p>`}
        <${Btn} tipo="secundario" chico onClick=${() => crearPresentacion(null)}>${T.peso.dejarSin}<//></div></div>`}
    ${codigo === 'sin' && html`<div class="info"><${Ico} n="info" /><div><p>${T.peso.sinCodigo(gramos(peso))}</p>
      <button type="button" class="btn texto" onClick=${() => ir('/ajustes/codigos')}>${T.peso.verCodigos}</button></div></div>`}
    ${vars.map((v) => html`<div class="grupo" key=${v.componente}><h2 id=${`t-${v.componente}`}>${T.peso.pasasT}</h2>
      <div class="tarjeta lista" role="radiogroup" aria-labelledby=${`t-${v.componente}`}>
        ${v.opciones.map((o, i) => {
          const op = estado.products.get(o);
          const elegido = (variante[v.componente] ?? v.componente) === o;
          return html`<${Opcion} key=${o} nombre=${v.componente} valor=${o} elegido=${elegido} n=${op?.product_name ?? o}
            d=${!op ? T.peso.sinFicha : op.status === 'pending' ? T.peso.porCompletar : i === 0 ? T.peso.deSiempre : null}
            onElegir=${(val) => { const x = estado.products.get(val); if (!x || x.status === 'pending') { avisar(`${x ? T.peso.porCompletar : T.peso.sinFicha}.`); return; } setVariante(val === v.componente ? {} : { ...variante, [v.componente]: val }); }} />`;
        })}</div></div>`)}
    ${vars.length > 0 && html`<${Info}>${T.peso.anotadas}<//>`}
    ${!vars.length && html`<p class="chico">${T.peso.proxima}</p>`}
    <${Btn} onClick=${usar}>${textoUsar}<//>
  <//>`;
}

// ---- Revisar ----
/** Prepara (o trae del dispositivo) el PDF de cada etiqueta elegida. */
function usePreparar(l) {
  const [r, setR] = useState({ listo: false, problemas: [] });
  const clave = JSON.stringify([l, estado.version]);
  useEffect(() => {
    let vivo = true;
    setR({ listo: false, problemas: [] });
    (async () => {
      const problemas = [];
      for (const it of l) {
        if (!vivo) return;   // la lista o los datos cambiaron: sigue la vuelta nueva
        try { await etiquetaPdf(it.id, it); } catch (e) { problemas.push({ id: it.id, code: e.code ?? 'servidor' }); }
      }
      if (vivo) setR({ listo: true, problemas });
    })();
    return () => { vivo = false; };
  }, [clave]);
  return r;
}

/** Miniatura de una hoja: las etiquetas en su lugar sobre la página carta. */
function Miniatura({ pagina, vistas, plan }) {
  const W = plan.paper.width, H = plan.paper.height;
  return html`<span class="pag" aria-hidden="true">${pagina.items.map((it) => {
    const v = vistas[it.index];
    if (!v?.html) return null;
    const b = labelBox(v.result.cut, v.result.freeEnd);
    return html`<div key=${it.index} style=${`position:absolute;left:${((it.xMm + b.leftPx / MM) / W) * 100}%;top:${(it.yMm / H) * 100}%;width:${(b.widthMm / W) * 100}%`}>
      <${VistaEtiqueta} vista=${v} zona="tira" alt="" /></div>`;
  })}</span>`;
}

export function Revisar() {
  useAlmacen();
  const l = lista();
  const h = useHojas(l);
  const prep = usePreparar(l);
  const [vistas, setVistas] = useState([]);
  const tel = esTelefono();
  useEffect(() => {
    let vivo = true;
    (async () => {
      const out = [];
      for (const it of l) { const v = await vistaPrevia(it.id, it).catch(() => null); for (let k = 0; k < it.n; k++) out.push(v); }
      if (vivo) setVistas(out);
    })();
    return () => { vivo = false; };
  }, [JSON.stringify([l, estado.version])]);
  const conAviso = l.map((it) => ({ it, a: avisos(it.id).find((x) => x.code === 'missing_may_contain' || x.code === 'missing_origin') })).filter((x) => x.a);
  const t = total(l);
  const faltan = prep.problemas;
  const listoPdf = prep.listo && !faltan.length;
  const imprimir = () => ir(tel ? '/imprimir/telefono' : '/imprimir/pc');
  return html`<${Pantalla} sec="imprimir" titulo=${T.revisar.titulo}
    cab=${html`<${Cab} volver="/imprimir" etiquetaVolver="Volver a elegir los productos" donde=${T.imprimir.titulo} />`}>
    ${conAviso.map(({ it, a }) => html`<${Nota} key=${it.id} accion=${T.avisos.confirmar} onAccion=${() => ir(`/productos/${it.id}/datos`)}>
      ${`${nombre(it.id)} sale sin la línea «${a.code === 'missing_origin' ? 'Origen' : 'Puede contener'}» hasta que la confirmes.`}<//>`)}
    ${!l.length ? html`<p class="chico">${T.revisar.nada}</p>` : html`<ul class="tarjeta lista">${l.map((it, i) => html`<li key=${it.id}>
      <${Fila} primera=${i === 0} n=${nombre(it.id)} d=${T.revisar.linea(pl(it.n, 'etiqueta', 'etiquetas'), gramos(it.peso), textoVariante(estado.products.get(it.id), it.variante))}
        onClick=${() => ir(`/imprimir/peso/${it.id}/revisar`)} /></li>`)}</ul>`}
    ${faltan.map((f) => html`<${Nota} key=${f.id}>${f.code === 'sin_conexion' ? T.revisar.faltaInternet(nombre(f.id))
      : f.code === 'incompleta' ? T.revisar.incompleta(nombre(f.id)) : f.code === 'limite' ? T.revisar.limite : T.revisar.errorServidor}<//>`)}
    ${h?.plan && html`<div class="grupo"><h2>${T.revisar.asi}</h2>
      <div class="hojas">${h.plan.pages.map((pg, i) => html`<div class="hoja" key=${i}>
        <${Miniatura} pagina=${pg} vistas=${vistas} plan=${h.plan} /><span>${T.revisar.hoja(i + 1, pl(pg.items.length, 'etiqueta', 'etiquetas'))}</span></div>`)}</div>
      <p class="chico">${h.libres ? T.revisar.caben(h.hojas, h.libres) : T.revisar.llenas}</p></div>`}
    ${!prep.listo && l.length > 0 && html`<p class="chico" role="status">${T.revisar.preparando}</p>`}
    <${Btn} ico="imp" deshabilitado=${!listoPdf || !t} onClick=${imprimir}>${T.revisar.imprimir(h ? pl(h.hojas, 'hoja', 'hojas') : '')}<//>
    <${Btn} tipo="secundario" ico=${tel ? 'compartir' : 'guardar'} deshabilitado=${!listoPdf || !t} onClick=${() => (tel ? compartirPdf() : guardarPdf())}>
      ${tel ? T.revisar.compartir : T.revisar.guardarPdf}<//>
  <//>`;
}

// ---- Sacar el PDF ----
let ultimoPdf = null;
async function pdfActual() {
  const l = lista();
  const { blob, plan } = await hojaPdf(l);
  ultimoPdf = { blob, hojas: plan.pages.length, etiquetas: total(l), items: l };
  return ultimoPdf;
}
const nombreArchivo = () => `Etiquetas ${new Date().toISOString().slice(0, 10)}.pdf`;
async function compartirPdf() {
  const { blob } = await pdfActual();
  const f = new File([blob], nombreArchivo(), { type: 'application/pdf' });
  if (navigator.canShare?.({ files: [f] })) { try { await navigator.share({ files: [f], title: nombreArchivo() }); } catch { /* cancelado */ } return true; }
  descargar(blob);
  return false;
}
function descargar(blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nombreArchivo();
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
async function guardarPdf() { descargar((await pdfActual()).blob); }

async function anotar(dispositivo) {
  const x = ultimoPdf;
  if (!x) return;
  await anotarImpresion({
    fecha: new Date().toISOString(), dispositivo, etiquetas: x.etiquetas, hojas: x.hojas,
    items: x.items.map((it) => {
      const p = estado.products.get(it.id);
      const pr = p.presentations?.[indicePeso(p, it.peso)];
      return { id: it.id, nombre: p.product_name, n: it.n, peso: it.peso, variante: it.variante, barcode: pr?.barcode ?? null };
    }),
  });
}

export function Telefono() {
  const [ocupado, setOcupado] = useState(false);
  const abrir = async () => {
    setOcupado(true);
    try {
      const l = lista();
      const hojas = await imprimirPagina(l);
      ultimoPdf = { blob: null, hojas, etiquetas: total(l), items: l };   // para anotar (no hace falta el PDF)
      await anotar('telefono');
      await guardarSeleccion({});   // la lista vuelve a cero; «Repetir la última impresión» la trae (18-11-2026)
      ir('/imprimir/listo');
    } catch {
      avisar(T.telefono.error);
    } finally { setOcupado(false); }
  };
  const alPc = async () => {
    const l = lista();
    const h = await planHojas(l);
    await agregarParaImprimir({ id: `t${Date.now()}`, fecha: new Date().toISOString(), items: l, etiquetas: total(l), hojas: h.hojas });
    avisar(T.telefono.mandadoPc);
  };
  return html`<${Pantalla} sec="imprimir" titulo=${T.telefono.titulo}
    cab=${html`<${Cab} volver="/imprimir/revisar" etiquetaVolver="Volver a Revisa antes de imprimir" donde=${T.revisar.titulo} />`}>
    <p>${T.telefono.papel}</p>
    <p>${T.telefono.elige}</p>
    <dl class="tarjeta ajustes">${T.telefono.ajustes.map(([k, v, n]) => html`<div class="ajuste" key=${k}><dt>${k}</dt><dd>${v}</dd>
      ${n && html`<p class="chico" style="flex-basis:100%">${n}</p>`}</div>`)}</dl>
    <p class="chico">${T.telefono.nota}</p>
    <${Btn} ico="imp" deshabilitado=${ocupado} onClick=${abrir}>${T.telefono.abrir}<//>
    <${Btn} tipo="texto" onClick=${alPc}>${T.telefono.alPc}<//>
  <//>`;
}

/**
 * Teléfono: abre la ventana de imprimir del sistema con las hojas como página (18-11-2026; con el complemento de Epson
 * deja elegir la calidad, que la app de Epson no daba con papel normal). Las hojas van en una sombra (shadow DOM) para
 * que los estilos de la app (p. ej. box-sizing) no cambien las etiquetas, y quedan fuera de la vista hasta la próxima
 * impresión: Android vuelve a pedir las páginas si se cambia algo en la ventana. Devuelve cuántas hojas son.
 */
let hojaAnterior = [];
async function imprimirPagina(l) {
  const { plan, etiquetas } = await hojaPagina(l);
  hojaAnterior.forEach((e) => e.remove());
  const host = document.createElement('div');
  host.className = 'imprimir-hoja';
  host.setAttribute('aria-hidden', 'true');
  const sombra = host.attachShadow({ mode: 'open' });
  sombra.innerHTML = `<style>:host{all:initial;display:block}${sheetCss(plan)}</style>${sheetSections(plan, etiquetas)}`;
  const pagina = document.createElement('style');   // @page solo vale en el documento, no dentro de la sombra
  pagina.textContent = `@media print{@page{size:${plan.paper.width}mm ${plan.paper.height}mm;margin:0}`
    + 'html,body{height:auto !important;background:#FFFFFF !important}}';
  document.head.appendChild(pagina);
  document.body.appendChild(host);
  hojaAnterior = [host, pagina];
  await Promise.all(LABEL_FONTS.map((f) => document.fonts.load(f).catch(() => null)));
  await Promise.all([...sombra.querySelectorAll('img')].map((i) => i.decode().catch(() => null)));
  await document.fonts.ready;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  window.print();
  return plan.pages.length;
}

export function Pc() {
  const [ocupado, setOcupado] = useState(false);
  const abrir = async () => {
    setOcupado(true);
    try {
      const { blob } = await pdfActual();
      await imprimirEnVentana(blob);
      await anotar('pc');
      if (trabajoActual) { await quitarParaImprimir(trabajoActual); trabajoActual = null; }
      await guardarSeleccion({});   // la lista vuelve a cero; «Repetir la última impresión» la trae (18-11-2026)
      ir('/imprimir/listo');
    } finally { setOcupado(false); }
  };
  return html`<${Pantalla} sec="imprimir" titulo=${T.pc.titulo}
    cab=${html`<${Cab} volver="/imprimir/revisar" etiquetaVolver="Volver a Revisa antes de imprimir" donde=${T.revisar.titulo} />`}>
    <p>${T.pc.papel}</p>
    <p>${T.pc.elige}</p>
    <dl class="tarjeta ajustes"><div class="ajuste"><dt>${T.pc.impresora}</dt><dd>${T.pc.impresoraV}</dd></div></dl>
    <p class="chico">${T.pc.nota}</p>
    <details class="tarjeta"><summary><span>${T.pc.ajustesT}</span><${Ico} n="sig" /></summary>
      <dl class="ajustes dentro">${T.pc.ajustes.map(([k, v, n]) => html`<div class="ajuste"><dt>${k}</dt><dd>${v}</dd>
        ${n && html`<p class="chico" style="flex-basis:100%">${n}</p>`}</div>`)}</dl>
    </details>
    <${Btn} ico="imp" deshabilitado=${ocupado} onClick=${abrir}>${T.pc.abrir}<//>
    <${Btn} tipo="texto" onClick=${guardarPdf}>${T.pc.guardar}<//>
  <//>`;
}

/**
 * Abre la ventana de imprimir del navegador con el PDF (en un marco oculto). El marco y su dirección quedan hasta la
 * próxima impresión: la ventana de imprimir de Chrome sigue leyendo el PDF mientras está abierta, y no avisa cuando se
 * cierra (18-11-2026: al quitar el marco al segundo, la vista previa decía «Error al obtener la vista previa»).
 */
let marcoAnterior = null;
function imprimirEnVentana(blob) {
  return new Promise((ok) => {
    if (marcoAnterior) { marcoAnterior.f.remove(); URL.revokeObjectURL(marcoAnterior.url); marcoAnterior = null; }
    const url = URL.createObjectURL(blob);
    const f = document.createElement('iframe');
    f.className = 'imprimir-pdf';
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    f.src = url;
    marcoAnterior = { f, url };
    f.onload = () => {
      setTimeout(() => {
        try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, '_blank'); }
        ok();
      }, 500);
    };
    document.body.appendChild(f);
  });
}

export function Listo() {
  useAlmacen();
  const r = estado.impresiones[estado.impresiones.length - 1];
  const tel = esTelefono();
  const otras = async () => { await guardarSeleccion({}); ir('/imprimir'); };
  const deNuevo = async () => { if (r) await guardarSeleccion(seleccionDe(r.items)); ir(tel ? '/imprimir/telefono' : '/imprimir/pc'); };
  return html`<${Pantalla} sec="imprimir">
    <div class="gran-ico"><${Ico} n="check" /></div>
    <h1>${T.listo.titulo}</h1>
    ${r && html`<p>${tel ? T.listo.tel(r.hojas) : T.listo.pc(r.hojas)}</p>
      <p class="chico">${T.listo.anotado(pl(r.etiquetas, 'etiqueta', 'etiquetas'), fecha(r.fecha))}</p>`}
    <${Btn} onClick=${otras}>${T.listo.otras}<//>
    <${Btn} tipo="secundario" ico="imp" onClick=${deNuevo}>${T.listo.deNuevo}<//>
    <${Btn} tipo="texto" onClick=${() => ir('/imprimir/ayuda')}>${T.listo.salieronMal}<//>
  <//>`;
}

export function Ayuda() {
  const A = T.ayuda;
  return html`<${Pantalla} sec="imprimir" titulo=${A.titulo} cab=${html`<${Cab} volver="/imprimir/listo" donde=${T.listo.titulo} />`}>
    ${[...(esTelefono() ? [[A.noApareceT, A.noApareceD]] : []), [A.chicasT, A.chicasD], [A.oscurasT, esTelefono() ? A.oscurasTelD : A.oscurasD], [A.corridasT, A.corridasD]].map(([t, d]) => html`<div class="tarjeta" key=${t}><h2>${t}</h2><p>${d}</p></div>`)}
  <//>`;
}
