// Ajustes (provisoria hasta la ronda 5) y Códigos de barras (ronda 4).
import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { T } from '../../textos.js';
import { Cab, Btn, Fila, Nota, Info, Ico, Opcion, ir, avisar, fecha, gramos, pl } from '../ui.js';
import { Pantalla } from '../marco.js';
import { estado, useAlmacen, guardarAjustes, guardarProducto } from '../datos/almacen.js';
import { barcodeUsage } from '../../../src/barcodes.js';
import { ENTORNO, conOneDrive } from '../config.js';
import { sinc, pendientes, sincronizar } from '../datos/onedrive.js';
import { sesionGuardada, salir } from '../datos/sesion.js';
import { esTelefono } from './imprimir.js';

export const VERSION_APP = '0.8.0-beta1';
const nombreDe = (id) => estado.products.get(id)?.product_name ?? id;

export function Ajustes() {
  useAlmacen();
  const c = codigos();
  const [sesion, setSesion] = useState(null);
  const [pend, setPend] = useState(0);
  useEffect(() => { sesionGuardada().then(setSesion); pendientes().then(setPend); }, [estado.version]);
  const ts = String(estado.ajustes.ts ?? 1);
  const estadoSinc = !conOneDrive() ? T.ajustes.sinRespaldo
    : sinc.estado === 'sincronizando' ? T.ajustes.sincronizando
      : sinc.estado === 'error' ? T.ajustes.errorSinc
        : pend ? T.ajustes.pendiente : sinc.ultima ? T.ajustes.alDia(`${fecha(sinc.ultima)}, ${new Date(sinc.ultima).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`) : T.ajustes.pendiente;
  return html`<${Pantalla} sec="ajustes" raiz titulo=${T.ajustes.titulo}>
    <div class="tarjeta lista">
      <${Fila} primera n=${T.ajustes.codigos} d=${T.ajustes.codigosD(c.total, c.asignados.length, c.libres.length)} onClick=${() => ir('/ajustes/codigos')} />
    </div>
    <div class="grupo"><h2 id="t-letra">${T.ajustes.letra}</h2>
      <div class="tarjeta lista" role="radiogroup" aria-labelledby="t-letra">
        ${[['1', T.ajustes.normal], ['1.15', T.ajustes.grande], ['1.3', T.ajustes.muyGrande]].map(([v, n]) => html`<${Opcion} key=${v} nombre="letra"
          valor=${v} elegido=${ts === v} n=${n} onElegir=${(x) => guardarAjustes({ ts: Number(x) })} />`)}</div></div>
    <div class="grupo"><h2>${T.ajustes.impresora}</h2><p>${esTelefono() ? T.ajustes.impresoraTel : T.ajustes.impresoraPc}</p></div>
    <div class="grupo"><h2>${T.ajustes.respaldo}</h2>
      <p>${conOneDrive() ? T.ajustes.respaldoD(ENTORNO.microsoft.carpeta) : T.ajustes.sinRespaldo}</p>
      ${conOneDrive() && html`<p class="chico" role="status">${estadoSinc}</p>`}
      ${sesion?.cuenta && html`<p class="chico">${T.ajustes.cuenta(sesion.cuenta.correo ?? sesion.cuenta.nombre)}</p>`}
      ${conOneDrive() && sesion && html`<${Btn} tipo="secundario" onClick=${() => sincronizar()}>Guardar ahora en OneDrive<//>
        <${Btn} tipo="texto" onClick=${async () => { await salir(); location.reload(); }}>${T.ajustes.salir}<//>`}</div>
    <p class="chico">${T.ajustes.version(VERSION_APP, ENTORNO.nombre)}</p>
  <//>`;
}

// ---- Códigos de barras ----
/** { total, libres: [num], asignados: [{ num, id, peso, fuente, nota }] } */
export function codigos() {
  const lista = estado.company?.barcodes ?? [];
  const uso = barcodeUsage(estado.products);
  const asignados = [];
  const libres = [];
  for (const c of lista) {
    const u = uso.get(c.number);
    if (u) asignados.push({ num: c.number, id: u.productId, peso: u.net_weight_g, fuente: c.source, nota: c.note });
    else if (c.source === 'third_party') {
      // Códigos de la corporación entregados para un producto que todavía no está (o no lleva etiqueta de la app)
      const m = /asignado a:\s*(.+?)\s+(\d+)\s*g\s*$/i.exec(c.note ?? '');
      asignados.push({ num: c.number, id: null, nombre: m?.[1] ?? c.note ?? '', peso: m ? Number(m[2]) : null, fuente: c.source, nota: T.codigos.noEnProductos });
    } else libres.push(c.number);
  }
  for (const [num, u] of uso) if (!lista.some((c) => c.number === num)) asignados.push({ num, id: u.productId, peso: u.net_weight_g, fuente: 'own' });
  asignados.sort((a, b) => (a.id ? nombreDe(a.id) : a.nombre).localeCompare(b.id ? nombreDe(b.id) : b.nombre, 'es'));
  return { total: asignados.length + libres.length, asignados, libres };
}
const impresasCon = (num) => {
  let n = 0, desde = null;
  for (const r of estado.impresiones) for (const it of r.items) if (it.barcode === num) { n += it.n; desde ??= r.fecha; }
  return { n, desde };
};
const fuenteTxt = (f) => (f === 'third_party' ? T.codigos.deOtra : T.codigos.dePropio);

export function Codigos() {
  useAlmacen();
  const c = codigos();
  return html`<${Pantalla} sec="ajustes" titulo=${T.codigos.titulo} cab=${html`<${Cab} volver="/ajustes" etiquetaVolver="Volver a Ajustes" donde=${T.ajustes.titulo} />`}>
    <p class="chico">${T.codigos.cuenta(c.total, c.asignados.length, c.libres.length)}</p>
    ${c.libres.length > 0 && html`<details class="tarjeta"><summary><span>${T.codigos.libres(c.libres.length)}</span><${Ico} n="sig" /></summary>
      <div class="dentro"><p class="chico">${T.codigos.libresD}</p><ul>${c.libres.map((n) => html`<li key=${n}><${Fila} n=${n} d=${T.codigos.dePropio} onClick=${() => ir(`/ajustes/codigos/${n}`)} /></li>`)}</ul></div></details>`}
    <div class="grupo"><h2>${T.codigos.asignados(c.asignados.length)}</h2>
      <ul class="tarjeta lista">${c.asignados.map((a) => html`<li key=${a.num}><${Fila} n=${a.id ? nombreDe(a.id) : a.nombre}
        d=${[a.num, a.peso && gramos(a.peso), a.nota && a.fuente === 'third_party' && !a.id ? a.nota : null].filter(Boolean).join(' · ')}
        onClick=${() => ir(`/ajustes/codigos/${a.num}`)} /></li>`)}</ul></div>
  <//>`;
}

function buscar(num) {
  const c = codigos();
  const a = c.asignados.find((x) => x.num === num);
  if (a) return { ...a, asignado: true };
  if (c.libres.includes(num)) return { num, asignado: false, fuente: 'own' };
  return null;
}

/** Cambia el código de una presentación (null = sin código). */
async function ponerCodigo(id, peso, num, fuente) {
  const p = estado.products.get(id);
  const presentations = p.presentations.map((pr) => (pr.net_weight_g === peso ? { ...pr, barcode: num, barcode_source: num ? fuente : null } : pr));
  await guardarProducto({ ...p, presentations });
}

export function Codigo({ num }) {
  useAlmacen();
  const c = buscar(num);
  const volver = html`<${Cab} volver="/ajustes/codigos" etiquetaVolver="Volver a Códigos de barras" donde=${T.codigos.titulo} />`;
  if (!c) return html`<${Pantalla} sec="ajustes" titulo=${num} cab=${volver}><p>No está en la lista de códigos.</p><//>`;
  const imp = impresasCon(num);
  return html`<${Pantalla} sec="ajustes" cab=${volver}>
    <h1 class="numero">${num}</h1>
    <dl class="tarjeta ajustes">
      ${c.asignado && html`<div class="ajuste"><dt>${T.codigos.producto}</dt><dd>${c.id ? nombreDe(c.id) : c.nombre}</dd></div>
        ${c.peso && html`<div class="ajuste"><dt>${T.codigos.peso}</dt><dd>${gramos(c.peso)}</dd></div>`}`}
      <div class="ajuste"><dt>${T.codigos.origen}</dt><dd>${fuenteTxt(c.fuente)}</dd></div>
      ${c.asignado && c.id && html`<div class="ajuste"><dt>${T.codigos.impresas}</dt><dd>${T.codigos.impresasV(imp.n, imp.desde && fecha(imp.desde))}</dd></div>`}
    </dl>
    ${c.asignado && !c.id && html`<${Info}>${c.nota}<//>`}
    ${c.asignado && c.id ? html`<${Btn} tipo="secundario" onClick=${() => ir(`/ajustes/codigos/${num}/pasar`)}>${T.codigos.pasar}<//>
      <${Btn} tipo="peligro" onClick=${() => ir(`/ajustes/codigos/${num}/quitar`)}>${T.codigos.quitar}<//>`
    : !c.asignado ? html`<${Btn} onClick=${() => ir(`/ajustes/codigos/${num}/pasar`)}>${T.codigos.asignar}<//>` : null}
  <//>`;
}

export function Pasar({ num }) {
  useAlmacen();
  const c = buscar(num);
  const prods = [...estado.products.values()].filter((p) => p.status !== 'inactive').sort((a, b) => a.product_name.localeCompare(b.product_name, 'es'));
  const uso = barcodeUsage(estado.products);
  const codigoDe = (p) => p.presentations?.find((x) => x.barcode)?.barcode;
  return html`<${Pantalla} sec="ajustes" titulo=${T.codigos.aQue} cab=${html`<${Cab} volver=${`/ajustes/codigos/${num}`} donde=${num} />`}>
    <ul class="tarjeta lista">${prods.filter((p) => p.id !== c?.id).map((p) => {
      const cod = codigoDe(p);
      return html`<li key=${p.id}><${Fila} n=${p.product_name} d=${cod ? T.codigos.tiene(cod, gramos(uso.get(cod).net_weight_g)) : T.codigos.sinCodigo}
        onClick=${() => ir(`/ajustes/codigos/${num}/pasar/${p.id}`)} /></li>`;
    })}</ul><//>`;
}

export function Pasar2({ num, id }) {
  useAlmacen();
  const c = buscar(num);
  const p = estado.products.get(id);
  const [peso, setPeso] = useState(p?.presentations?.[0]?.net_weight_g);
  if (!c || !p) return null;
  const pr = p.presentations.find((x) => x.net_weight_g === peso);
  const imp = c.asignado && c.id ? impresasCon(num) : { n: 0 };
  const pasar = async () => {
    const antes = c.id ? structuredClone(estado.products.get(c.id)) : null;
    const antesP = structuredClone(p);
    if (c.id) await ponerCodigo(c.id, c.peso, null);
    await ponerCodigo(id, peso, num, c.fuente);
    ir(`/ajustes/codigos/${num}`, { reemplazar: true });
    avisar(T.codigos.pasado(num, p.product_name), async () => { await guardarProducto(antesP); if (antes) await guardarProducto(antes); });
  };
  return html`<${Pantalla} sec="ajustes" titulo=${p.product_name} cab=${html`<${Cab} volver=${`/ajustes/codigos/${num}/pasar`} donde=${num} />`}>
    <div class="grupo"><h2 id="t-pp">${T.codigos.paraPeso}</h2>
      <div class="tarjeta lista" role="radiogroup" aria-labelledby="t-pp">${p.presentations.map((x) => html`<${Opcion} key=${x.net_weight_g} nombre="pp"
        valor=${String(x.net_weight_g)} elegido=${x.net_weight_g === peso} n=${gramos(x.net_weight_g)}
        d=${x.barcode ? T.codigos.quedaLibre(x.barcode) : null} onElegir=${(v) => setPeso(Number(v))} />`)}</div></div>
    ${imp.n > 0 && html`<${Nota}>${T.codigos.avisoImpresas(imp.n, nombreDe(c.id), p.product_name)}<//>`}
    ${c.fuente === 'third_party' && html`<${Info}>${T.codigos.corpNota}<//>`}
    <${Btn} onClick=${pasar} deshabilitado=${!pr}>${T.codigos.pasarBtn}<//>
  <//>`;
}

export function Quitar({ num }) {
  const c = buscar(num);
  if (!c?.id) return null;
  const imp = impresasCon(num);
  const quitar = async () => {
    const antes = structuredClone(estado.products.get(c.id));
    await ponerCodigo(c.id, c.peso, null);
    ir('/ajustes/codigos', { reemplazar: true });
    avisar(T.codigos.quitado(num), () => guardarProducto(antes));
  };
  return html`<${Pantalla} sec="ajustes" titulo=${T.codigos.quitarT(nombreDe(c.id), gramos(c.peso))} cab=${html`<${Cab} volver=${`/ajustes/codigos/${num}`} donde=${num} />`}>
    <p>${T.codigos.quitarD(num)}</p>
    ${imp.n > 0 && html`<${Nota}>${T.codigos.quitarImpresas(imp.n)}${c.fuente === 'third_party' ? ` ${T.codigos.corpNota}` : ''}<//>`}
    <${Btn} onClick=${() => ir(`/ajustes/codigos/${num}`)}>${T.codigos.dejarBtn}<//>
    <${Btn} tipo="peligro" onClick=${quitar}>${T.codigos.quitarBtn}<//>
  <//>`;
}
