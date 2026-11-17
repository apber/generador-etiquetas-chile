// Producto nuevo (ronda 2 y 4b): fotos de la bolsa → lectura (los dos lectores) → resultado simple, una cosa a la vez.
import { html, useEffect, useState, useRef } from '../../vendor/preact-htm.js';
import { T } from '../../textos.js';
import { Cab, Btn, Nota, Info, Ico, ir, avisar } from '../ui.js';
import { Pantalla } from '../marco.js';
import { estado, useAlmacen } from '../datos/almacen.js';
import { prepareImage } from '../../../src/reading/image-browser.js';
import { iniciarLectura, useLectura, cancelarLectura, avisosLectura } from '../lectura.js';
import { avisos } from '../productos-info.js';
import { textoAviso } from '../avisos.js';
import { esTelefono } from './imprimir.js';

// Las fotos elegidas sobreviven al ir y volver de la cámara (la página puede recargarse en algunos teléfonos)
let fotosNuevo = [];
const RAZON = { small: T.calidad.small, blurry: T.calidad.blurry, dark: T.calidad.dark, overexposed: T.calidad.bright };

export function Fotos({ productoId = null }) {
  const [fotos, setFotos] = useState(fotosNuevo);
  const [encima, setEncima] = useState(false);
  const camara = useRef(null), galeria = useRef(null);
  const tel = esTelefono();
  useEffect(() => { fotosNuevo = fotos; }, [fotos]);
  const agregar = async (files) => {
    const nuevas = [...files].filter((f) => /^image\//.test(f.type));
    if (!nuevas.length) return;
    const pend = nuevas.map((f) => ({ k: Math.random(), url: URL.createObjectURL(f), revisando: true }));
    setFotos((x) => [...x, ...pend]);
    for (const [i, f] of nuevas.entries()) {
      let r;
      try { r = await prepareImage(f); } catch { r = { ok: false, reasons: ['small'], image: null }; }
      setFotos((x) => x.map((y) => (y.k === pend[i].k ? { ...y, revisando: false, ok: r.ok, razones: r.reasons, image: r.image } : y)));
    }
  };
  const quitar = (k) => setFotos((x) => x.filter((y) => y.k !== k));
  const listas = fotos.filter((f) => !f.revisando && f.image);
  const leer = async () => {
    if (!listas.length) return;
    const id = await iniciarLectura(listas.map((f) => ({ image: f.image, razones: f.razones })), { productoId });
    fotosNuevo = [];
    ir(`/nuevo/lectura/${id}`, { reemplazar: true });
  };
  const soltar = (e) => { e.preventDefault(); setEncima(false); agregar(e.dataTransfer.files); };
  return html`<${Pantalla} sec="productos" titulo=${T.nuevo.titulo}
    cab=${html`<${Cab} volver=${productoId ? `/productos/${productoId}` : '/productos'} etiquetaVolver="Volver a Productos" donde=${T.nuevo.donde} />`}>
    <p>${T.nuevo.d}</p>
    ${fotos.length > 0 && html`<ul class="fotos">${fotos.map((f, i) => html`<li key=${f.k}>
      <img class="mini" src=${f.url} alt="" />
      <span class="tx"><b>${T.nuevo.foto(i + 1)}</b>
        ${f.revisando ? html`<span class="estado">${T.nuevo.revisando}</span>`
        : f.ok ? html`<span class="estado"><${Ico} n="check" />${T.nuevo.seVeBien}</span>`
          : html`<span class="estado mal"><${Ico} n="alerta" />${(f.razones ?? []).map((r) => RAZON[r] ?? r).join(' ')}</span>`}</span>
      <${Btn} tipo="secundario" chico aria-label=${T.nuevo.quitarAria(i + 1)} onClick=${() => quitar(f.k)}>${T.nuevo.quitar}<//></li>`)}</ul>`}
    <input ref=${camara} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => { agregar(e.target.files); e.target.value = ''; }} />
    <input ref=${galeria} type="file" accept="image/*" multiple hidden onChange=${(e) => { agregar(e.target.files); e.target.value = ''; }} />
    ${tel ? html`<div class="fila-botones">
        <${Btn} tipo="secundario" ico="camara" onClick=${() => camara.current.click()}>${fotos.length ? T.nuevo.sacarOtra : T.nuevo.sacar}<//>
        <${Btn} tipo="secundario" onClick=${() => galeria.current.click()}>${T.nuevo.galeria}<//></div>`
      : html`<div class=${`soltar${encima ? ' encima' : ''}`} onDragOver=${(e) => { e.preventDefault(); setEncima(true); }} onDragLeave=${() => setEncima(false)} onDrop=${soltar}>
        <p>${T.nuevo.soltar}</p><${Btn} tipo="secundario" ico="archivo" onClick=${() => galeria.current.click()}>${T.nuevo.elegirArchivos}<//></div>`}
    ${listas.length > 0 && html`<${Btn} onClick=${leer}>${listas.every((f) => f.ok) ? T.nuevo.leer(listas.length) : T.nuevo.leerIgual}<//>`}
  <//>`;
}

/** Espera y resultado de una lectura. */
export function Lectura({ id }) {
  useAlmacen();
  const l = useLectura(id);
  if (l === null) return null;
  if (l === false) { ir('/productos', { reemplazar: true }); return null; }
  const N = l.lectores.normal, R = l.lectores.rapido;
  const alguno = N.estado === 'listo' || R.estado === 'listo';
  const p = l.productoId && estado.products.get(l.productoId);
  if (l.cancelada) { ir('/productos', { reemplazar: true }); return null; }
  if (!alguno || !p) {
    const ambosMal = [N, R].every((x) => x.estado === 'error' || x.estado === 'espera');
    const enEspera = ambosMal && [N, R].some((x) => x.estado === 'espera');
    return html`<${Pantalla} sec="productos" cab=${html`<${Cab} donde=${T.nuevo.donde} />`} centro>
      ${!ambosMal && html`<span class="girando" aria-hidden="true" style="margin-top:24px"></span><p class="espera-tx" style="margin-top:24px">${T.nuevo.todavia}</p>`}
      <h1>${enEspera ? T.nuevo.enEspera : ambosMal ? T.nuevo.error : T.nuevo.leyendo}</h1>
      <p role="status">${enEspera ? T.nuevo.enEsperaD : ambosMal ? (N.mensaje ?? R.mensaje ?? '') : T.nuevo.leyendoD}</p>
      <${Btn} tipo="secundario" class="btn secundario empuja" onClick=${() => ir('/productos')}>${T.nuevo.volverProductos}<//>
      <${Btn} tipo="texto" onClick=${async () => { await cancelarLectura(id); ir('/nuevo', { reemplazar: true }); }}>${T.nuevo.cancelarLectura}<//>
    <//>`;
  }
  // Resultado: lo que pide algo, una cosa a la vez
  const faltan = [...avisosLectura(l).map((a) => ({ texto: a.message, de: 'lectura' })),
    ...avisos(p.id).map((a) => ({ texto: textoAviso(a).texto, de: 'producto' }))];
  const dudosos = Object.entries(p.field_states ?? {}).filter(([, s]) => s === 'doubtful').length;
  const n = faltan.length + (dudosos && !faltan.length ? 1 : 0);
  return html`<${Pantalla} sec="productos" cab=${html`<${Cab} volver="/productos" etiquetaVolver="Volver a Productos" donde=${T.nuevo.donde} />`}>
    <div class="gran-ico">${n ? html`<${Ico} n="alerta" />` : html`<${Ico} n="check" />`}</div>
    <h1>${n ? T.nuevo.faltaT(n) : T.nuevo.listoT}</h1>
    <p>${n ? T.nuevo.faltaD : T.nuevo.listoD}</p>
    <h2>${p.product_name}</h2>
    ${N.estado !== 'listo' && html`<${Info}>${N.estado === 'espera' ? 'Una segunda lectura, para confirmar los datos, quedó en espera y sigue sola.' : 'Una segunda lectura, para confirmar los datos, sigue en curso.'} Mientras tanto, los datos quedan «Por confirmar».<//>`}
    ${faltan[0] && html`<${Nota} accion=${T.datos.titulo === '' ? '' : 'Revisar'} onAccion=${() => ir(`/productos/${p.id}/datos`)}>${faltan[0].texto}<//>`}
    <${Btn} onClick=${() => ir(`/productos/${p.id}/etiqueta`)}>${T.nuevo.verEtiqueta}<//>
    <${Btn} tipo="secundario" onClick=${() => ir(`/productos/${p.id}/datos`)}>${T.nuevo.verDatos}<//>
    <${Btn} tipo="secundario" onClick=${() => ir(`/productos/${p.id}/nombre`)}>${T.ficha.cambiarNombre}<//>
    <${Btn} tipo="texto" onClick=${() => ir('/nuevo')}>${T.nuevo.otro}<//>
  <//>`;
}
