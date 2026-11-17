// Productos: lista, ficha, la etiqueta, «Qué lleva la etiqueta», sellos, eliminar y cambiar nombre (ronda 3 y 4b).
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { T } from '../../textos.js';
import { Cab, Btn, Fila, MarcaRevisar, Nota, Info, Interruptor, Ico, ir, avisar, fecha, gramos } from '../ui.js';
import { Pantalla } from '../marco.js';
import { estado, useAlmacen, guardarProducto, eliminarProducto, leerArchivo } from '../datos/almacen.js';
import { vendibles, componentes, avisos, datosBase, tienePendientes, estadosPendientes } from '../productos-info.js';
import { vistaPrevia, partes } from '../etiquetas.js';
import { VistaEtiqueta } from '../vista-etiqueta.js';
import { textoAviso } from '../avisos.js';
import { agregarAImprimir } from './imprimir.js';

const nombre = (id) => estado.products.get(id)?.product_name ?? id;
const hoy = () => new Date().toISOString().slice(0, 10);
const num = (v) => String(v).replace('.', ',');

export function Lista() {
  useAlmacen();
  const lista = vendibles();
  const comp = componentes();
  return html`<${Pantalla} sec="productos" raiz titulo=${T.productos.titulo}
    fijo=${html`<${Btn} onClick=${() => ir('/nuevo')}><span class="fila-ico"><${Ico} n="mas" />${T.productos.agregar}</span><//>`}>
    ${lista.length ? html`<p class="chico">${T.productos.cuenta(lista.length)}</p>
      <ul class="tarjeta lista">${lista.map((p) => html`<li key=${p.id}><${Fila} n=${p.product_name}
        marca=${tienePendientes(p.id) ? html`<${MarcaRevisar} />` : null} onClick=${() => ir(`/productos/${p.id}`)} /></li>`)}</ul>`
    : html`<div class="tarjeta"><h2>${T.productos.vacia}</h2><p>${T.productos.vaciaD}</p></div>`}
    ${comp.length > 0 && html`<details class="tarjeta">
      <summary><span>${T.productos.noSeVenden(comp.length)}</span><${Ico} n="sig" /></summary>
      <div class="dentro"><p class="chico">${T.productos.noSeVendenD}</p>
        ${comp.map((p) => html`<${Fila} key=${p.id} n=${p.product_name} onClick=${() => ir(`/productos/${p.id}`)} />`)}</div></details>`}
  <//>`;
}

/** Carga la vista previa (con su error y su espera). */
function usePrevia(id, pedido) {
  const [v, setV] = useState(null);
  const clave = JSON.stringify([id, pedido, estado.version]);
  useEffect(() => {
    let vivo = true;
    setV(null);
    vistaPrevia(id, pedido).then((r) => vivo && setV(r)).catch((e) => vivo && setV({ error: e }));
    return () => { vivo = false; };
  }, [clave]);
  return v;
}

/** Primer aviso del producto, con su acción. */
function AvisoProducto({ id }) {
  const e = estadosPendientes(id);
  if (e.dudosos.length || e.porConfirmar.length) {
    return html`<${Nota} accion=${T.avisos.revisar} onAccion=${() => ir(`/productos/${id}/datos`)}>${T.avisos.leidos(e.dudosos.length, e.porConfirmar.length)}<//>`;
  }
  const a = avisos(id)[0];
  if (!a) return null;
  const t = textoAviso(a, id);
  return html`<${Nota} accion=${t.accion} onAccion=${() => ir(`/productos/${id}/datos`)}>${t.texto}<//>`;
}

export function Ficha({ id }) {
  useAlmacen();
  const p = estado.products.get(id);
  const v = usePrevia(id, {});
  const [fotos, setFotos] = useState(null);
  useEffect(() => { leerArchivo(`fotos/${id}/indice.json`).then((x) => setFotos(x ?? [])); }, [id, estado.version]);
  if (!p) return html`<${NoEsta} />`;
  const inactivo = p.status === 'inactive';
  return html`<${Pantalla} sec="productos" titulo=${p.product_name}
    cab=${html`<${Cab} volver="/productos" etiquetaVolver="Volver a Productos" donde=${T.productos.titulo} />`}
    fijo=${!inactivo && html`<${Btn} onClick=${() => agregarAImprimir(id)}><span class="fila-ico"><${Ico} n="imp" />${T.ficha.imprimir}</span><//>`}>
    <${AvisoProducto} id=${id} />
    ${!inactivo && html`<button type="button" class="previa" aria-label=${T.ficha.verCompleta} onClick=${() => ir(`/productos/${id}/etiqueta`)}>
      ${v?.html ? html`<${VistaEtiqueta} vista=${v} zona="frente" alt=${T.ficha.previaAlt(p.product_name)} />`
      : html`<p class="chico" style="padding:16px">${v?.incompleta || v?.error ? T.ficha.sinDatos : T.comun.cargando}</p>`}</button>
    <${Btn} tipo="secundario" onClick=${() => ir(`/productos/${id}/etiqueta`)}>${T.ficha.verCompleta}<//>`}
    <div class="tarjeta lista">
      <${Fila} primera n=${T.ficha.datos} d=${T.ficha.datosD} onClick=${() => ir(`/productos/${id}/datos`)} />
      ${!inactivo && html`<${Fila} n=${T.ficha.lleva} d=${T.ficha.llevaD} onClick=${() => ir(`/productos/${id}/lleva`)} />`}
      <${Fila} n=${T.ficha.fotos} d=${T.ficha.fotosD(fotos?.length ?? 0, fotos?.[0]?.fecha && fecha(fotos[0].fecha))} onClick=${() => ir(`/productos/${id}/fotos`)} />
      <${Fila} n=${T.ficha.cambiarNombre} onClick=${() => ir(`/productos/${id}/nombre`)} />
    </div>
    <${Btn} tipo="peligro" onClick=${() => ir(`/productos/${id}/eliminar`)}>${T.ficha.eliminar}<//>
  <//>`;
}

export function NoEsta() {
  return html`<${Pantalla} sec="productos" titulo="Este producto ya no está" cab=${html`<${Cab} volver="/productos" donde=${T.productos.titulo} />`}>
    <${Btn} onClick=${() => ir('/productos')}>${T.productos.titulo}<//><//>`;
}

export function Etiqueta({ id }) {
  useAlmacen();
  const p = estado.products.get(id);
  const v = usePrevia(id, {});
  if (!p) return html`<${NoEsta} />`;
  const d = datosBase(id);
  const sinLinea = avisos(id).find((a) => a.code === 'missing_may_contain' || a.code === 'missing_origin');
  return html`<${Pantalla} sec="productos" titulo=${T.etiqueta.titulo}
    cab=${html`<${Cab} volver=${`/productos/${id}`} etiquetaVolver="Volver al producto" donde=${p.product_name} />`}>
    ${sinLinea && html`<${Nota} accion="Confirmar" onAccion=${() => ir(`/productos/${id}/datos`)}>${T.etiqueta.sinLinea(sinLinea.code === 'missing_origin' ? 'Origen' : 'Puede contener')}<//>`}
    ${!v && html`<p class="chico">${T.comun.cargando}</p>`}
    ${(v?.incompleta || v?.error) && html`<${Nota}>${T.ficha.sinDatos}<//>`}
    ${v?.html && html`<div class="grupo"><h2>${T.etiqueta.frente}</h2><div class="previa"><${VistaEtiqueta} vista=${v} zona="frente" alt=${T.ficha.previaAlt(p.product_name)} /></div></div>
      <div class="grupo"><h2>${T.etiqueta.reverso}</h2><div class="previa"><${VistaEtiqueta} vista=${v} zona="reverso" alt=${`Reverso de la etiqueta de ${p.product_name}`} /></div></div>
      <${Btn} tipo="secundario" onClick=${() => ir(`/productos/${id}/grande`)}>${T.etiqueta.enGrande}<//>
      ${d.front && html`<p class="chico">${T.etiqueta.pesoNota(gramos(d.front.netWeight.g))}</p>`}
      ${!v.guardada && html`<p class="chico">${T.etiqueta.noGuardada}</p>`}`}
  <//>`;
}

export function Grande({ id }) {
  const p = estado.products.get(id);
  const v = usePrevia(id, {});
  if (!p) return html`<${NoEsta} />`;
  return html`<${Pantalla} sec="productos" titulo=${T.etiqueta.reverso}
    cab=${html`<${Cab} volver=${`/productos/${id}/etiqueta`} donde=${p.product_name} />`}>
    ${v?.html ? html`<div class="grupo"><h2>${T.etiqueta.mitad1}</h2><div class="previa"><${VistaEtiqueta} vista=${v} zona="mitad1" alt=${T.etiqueta.mitad1} /></div></div>
      <div class="grupo"><h2>${T.etiqueta.mitad2}</h2><div class="previa"><${VistaEtiqueta} vista=${v} zona="mitad2" alt=${T.etiqueta.mitad2} /></div></div>`
    : html`<p class="chico">${T.comun.cargando}</p>`}<//>`;
}

// ---- Qué lleva la etiqueta ----
const SELLO_TXT = {
  energy: (v) => `tiene ${num(v)} kcal en 100 g`, sugars: (v) => `tiene ${num(v)} g de azúcares en 100 g`,
  saturated_fat: (v) => `tiene ${num(v)} g de grasas saturadas en 100 g`, sodium: (v) => `tiene ${num(v)} mg de sodio en 100 g`,
};
export const motivoSello = (ev) => SELLO_TXT[ev.id](ev.declared ?? ev.raw);
const quitadoEl = (p, s) => p.confirmed_alerts?.find((a) => a.alert === `remove_seal:${s}` && a.decision === 'remove_seal');

export function Lleva({ id }) {
  useAlmacen();
  const p = estado.products.get(id);
  if (!p) return html`<${NoEsta} />`;
  const d = datosBase(id);
  const due = d.seals?.evaluation?.filter((e) => e.due) ?? [];
  const pt = partes(p);
  const quitados = due.filter((e) => quitadoEl(p, e.id));
  const cambiar = async (clave, va) => {
    const antes = p.label_parts;
    await guardarProducto({ ...p, label_parts: { ...pt, [clave]: va } });
    const n = clave === 'highlight' ? T.lleva.destacado : T.lleva.siguenos;
    avisar(va ? T.lleva.vuelve(n) : T.lleva.saleSin(n), () => guardarProducto({ ...estado.products.get(id), label_parts: antes }));
  };
  const hl = (p.highlight ?? []).join(' ');
  return html`<${Pantalla} sec="productos" titulo=${T.lleva.titulo}
    cab=${html`<${Cab} volver=${`/productos/${id}`} etiquetaVolver="Volver al producto" donde=${p.product_name} />`}>
    <p>${T.lleva.siempre}</p>
    ${quitados.length > 0 && html`<${Nota}>${T.lleva.quitaste(quitados.length)}<//>`}
    <h2>${T.lleva.sellosT}</h2>
    ${due.length ? html`<p class="chico">${T.lleva.sellosD}</p>
      <div class="tarjeta lista">${due.map((e, i) => {
        const q = quitadoEl(p, e.id);
        return html`<${Interruptor} key=${e.id} primera=${i === 0} n=${SELLO_NOMBRE[e.id]} va=${!q}
          d=${q ? T.lleva.quitado(fecha(q.date)) : T.lleva.motivo(motivoSello(e))}
          onClick=${() => ir(`/productos/${id}/sello/${e.id}`)} />`;
      })}</div>` : html`<p class="chico">${T.lleva.sinSellos}</p>`}
    <h2>${T.lleva.otrasT}</h2>
    <p class="chico">${T.lleva.otrasD}</p>
    <div class="tarjeta lista">
      ${hl && html`<${Interruptor} primera n=${T.lleva.destacado} d=${`«${hl}»`} va=${pt.highlight} onClick=${() => cambiar('highlight', !pt.highlight)} />`}
      <${Interruptor} primera=${!hl} n=${T.lleva.siguenos} d=${T.lleva.siguenosD} va=${pt.follow_us} onClick=${() => cambiar('follow_us', !pt.follow_us)} />
    </div>
  <//>`;
}
const SELLO_NOMBRE = { energy: 'ALTO EN CALORÍAS', sugars: 'ALTO EN AZÚCARES', saturated_fat: 'ALTO EN GRASAS SATURADAS', sodium: 'ALTO EN SODIO' };

export function Sello({ id, sello }) {
  useAlmacen();
  const p = estado.products.get(id);
  if (!p) return html`<${NoEsta} />`;
  const ev = datosBase(id).seals?.evaluation?.find((e) => e.id === sello);
  if (!ev) return html`<${NoEsta} />`;
  const q = quitadoEl(p, sello);
  const nombreS = SELLO_NOMBRE[sello];
  const volver = () => ir(`/productos/${id}/lleva`);
  const quitar = async () => {
    const ca = [...(p.confirmed_alerts ?? []).filter((a) => a.alert !== `remove_seal:${sello}`),
      { alert: `remove_seal:${sello}`, decision: 'remove_seal', date: hoy(), note: 'Quitado por la usuaria en la app' }];
    await guardarProducto({ ...p, confirmed_alerts: ca });
    volver();
  };
  const poner = async () => {
    await guardarProducto({ ...p, confirmed_alerts: (p.confirmed_alerts ?? []).filter((a) => a.alert !== `remove_seal:${sello}`) });
    avisar(T.lleva.vuelve(nombreS));
    volver();
  };
  return html`<${Pantalla} sec="productos" titulo=${nombreS}
    cab=${html`<${Cab} volver=${volver} etiquetaVolver="Volver a Qué lleva la etiqueta" donde=${p.product_name} />`}>
    ${q && html`<${Nota}>${T.sello.quitadoD(fecha(q.date))}<//>`}
    <div class="grupo"><h2>${T.sello.porQue}</h2><p>${T.sello.porQueD(nombreS, motivoSello(ev))}</p></div>
    <div class="grupo"><h2>${T.sello.siQuitas}</h2><p>${T.sello.siQuitasD}</p></div>
    ${q ? html`<${Btn} onClick=${poner}>${T.sello.volver}<//>`
      : html`<${Btn} onClick=${volver}>${T.sello.dejar}<//><${Btn} tipo="peligro" onClick=${quitar}>${T.sello.quitar}<//>`}
  <//>`;
}

export function Eliminar({ id }) {
  const p = estado.products.get(id);
  if (!p) return html`<${NoEsta} />`;
  const si = async () => {
    const copia = structuredClone(p);
    await eliminarProducto(id);
    ir('/productos', { reemplazar: true });
    avisar(T.eliminar.hecho(copia.product_name), () => guardarProducto(copia));
  };
  return html`<${Pantalla} sec="productos" titulo=${T.eliminar.titulo(p.product_name)}
    cab=${html`<${Cab} volver=${`/productos/${id}`} etiquetaVolver="Volver al producto" donde=${p.product_name} />`}>
    <p>${T.eliminar.d(true)}</p><p class="chico">${T.eliminar.impresas}</p>
    <${Btn} onClick=${() => ir(`/productos/${id}`)}>${T.eliminar.no}<//>
    <${Btn} tipo="peligro" onClick=${si}>${T.eliminar.si}<//>
  <//>`;
}

export function Nombre({ id }) {
  const p = estado.products.get(id);
  const [v, setV] = useState(p?.product_name ?? '');
  const [err, setErr] = useState(false);
  if (!p) return html`<${NoEsta} />`;
  const guardar = async () => {
    const n = v.replace(/\s+/g, ' ').trim();
    if (!n) { setErr(true); return; }
    await guardarProducto({ ...p, product_name: n });
    avisar(T.nombre.hecho);
    ir(`/productos/${id}`);
  };
  return html`<${Pantalla} sec="productos" titulo=${T.nombre.titulo}
    cab=${html`<${Cab} volver=${`/productos/${id}`} etiquetaVolver="Volver al producto" donde=${p.product_name} />`}>
    <div class="campo"><label for="nombre">${T.nombre.campo}</label>
      <textarea id="nombre" rows="2" aria-describedby="nombre-ayuda" onInput=${(e) => { setV(e.target.value); setErr(false); }}>${v}</textarea>
      <span id="nombre-ayuda" class="ayuda">${T.nombre.ayuda}</span>
      ${err && html`<span class="error" role="alert">${T.nombre.vacio}</span>`}</div>
    <${Btn} onClick=${guardar}>${T.nombre.guardar}<//>
  <//>`;
}

export { nombre };
