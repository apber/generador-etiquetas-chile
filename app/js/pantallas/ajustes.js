// Ajustes (provisoria hasta la ronda 5), Códigos de barras (ronda 4) y Colores del aro (18-11-2026).
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
import { logoUrl } from '../marco.js';
import { libres, conAro, impresasDe, nombreColor, letraDe } from '../colores.js';
import { ringLetterColor, ringInk, similarRingColors, ringColorProblems, isHex, LABEL_BACKGROUND } from '../../../src/ring-colors.js';

export const VERSION_APP = '0.8.0-beta4';
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
      <${Fila} n=${T.ajustes.colores} d=${T.ajustes.coloresD(conAro().filter((p) => p.ring_color).length, libres().length)} onClick=${() => ir('/ajustes/colores')} />
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

// ---- Colores del aro (18-11-2026) ----
const Muestra = ({ color, grande }) => (color
  ? html`<span class=${`muestra${grande ? ' grande' : ''}`} style=${`background:${color};color:${ringLetterColor(color)}`} aria-hidden="true">${grande ? 'Aa' : ''}</span>`
  : html`<span class="muestra vacia" aria-hidden="true"></span>`);

export function Colores() {
  useAlmacen();
  const lista = conAro();
  const lib = libres();
  return html`<${Pantalla} sec="ajustes" titulo=${T.colores.titulo} cab=${html`<${Cab} volver="/ajustes" etiquetaVolver="Volver a Ajustes" donde=${T.ajustes.titulo} />`}>
    <p>${T.colores.intro}</p>
    <ul class="tarjeta lista">${lista.map((p, i) => html`<li key=${p.id}><${Fila} primera=${i === 0} n=${p.product_name} marca=${html`<${Muestra} color=${p.ring_color} />`}
      d=${[p.ring_color ? nombreColor(p.ring_color) : T.colores.sinColor, p.status === 'pending' ? T.colores.porCompletar : null].filter(Boolean).join(' · ')}
      onClick=${() => ir(`/ajustes/colores/${p.id}`)} /></li>`)}</ul>
    <details class="tarjeta"><summary><span>${T.colores.libres(lib.length)}</span><${Ico} n="sig" /></summary>
      <div class="dentro"><p class="chico">${lib.length ? T.colores.libresD : T.colores.libresNinguno}</p>
        <ul class="libres">${lib.map((c) => html`<li key=${c}><${Muestra} color=${c} grande /><span>${nombreColor(c)}</span></li>`)}</ul></div></details>
  <//>`;
}

/** Aro de muestra: el color, el nombre del producto en el arco de abajo con su letra y el logo al centro. */
function Aro({ color, nombre }) {
  const n = nombre.toUpperCase();
  const fs = Math.min(10, 165 / Math.max(1, n.length * 0.74));
  const logo = logoUrl();
  const letra = ringLetterColor(color);
  return html`<svg class="aro" viewBox="0 0 120 120" width="120" height="120" role="img" aria-label=${T.colores.previaAlt(nombre, nombreColor(color), letraDe(color))}>
    <defs><path id="arco-aro" d="M 6.5,60 A 53.5,53.5 0 0 0 113.5,60" /><clipPath id="centro-aro"><circle cx="60" cy="60" r="43" /></clipPath></defs>
    <circle cx="60" cy="60" r="60" fill=${color} /><circle cx="60" cy="60" r="43" fill=${LABEL_BACKGROUND} />
    ${logo && html`<image href=${logo} x="17" y="17" width="86" height="86" clip-path="url(#centro-aro)" />`}
    <text font-family="Montserrat, sans-serif" font-weight="800" font-size=${fs.toFixed(2)} fill=${letra} letter-spacing="0.4">
      <textPath href="#arco-aro" startOffset="50%" text-anchor="middle">${n}</textPath></text></svg>`;
}

/** Una opción de color (radio del sistema, como las demás). */
function OpcionColor({ valor, elegido, n, d, onElegir }) {
  return html`<label class="opcion"><input type="radio" name="color" value=${valor} checked=${elegido} onChange=${() => onElegir(valor)} />
    <${Muestra} color=${valor} grande /><span class="tx"><span class="n">${n}</span>${d && html`<span class="d">${d}</span>`}</span></label>`;
}

export function Color({ id, desde }) {
  useAlmacen();
  const p = estado.products.get(id);
  const actual = isHex(p?.ring_color) ? p.ring_color.toUpperCase() : null;
  const [elegido, setElegido] = useState(actual);
  const [otro, setOtro] = useState(null);
  const volver = desde === 'ficha' ? `/productos/${id}` : '/ajustes/colores';
  const cab = html`<${Cab} volver=${volver} etiquetaVolver=${desde === 'ficha' ? 'Volver al producto' : 'Volver a Colores del aro'} donde=${desde === 'ficha' ? p?.product_name : T.colores.titulo} />`;
  if (!p) return html`<${Pantalla} sec="ajustes" titulo="Este producto ya no está" cab=${cab} />`;
  const lib = libres(id).filter((c) => c !== actual);
  const vista = lib.slice(0, 3), mas = lib.slice(3);
  const enMas = elegido && (mas.includes(elegido) || elegido === otro);
  const cambia = elegido && elegido !== actual;
  const otros = conAro().filter((x) => x.id !== id).map((x) => ({ id: x.id, name: x.product_name, color: x.ring_color }));
  const parecidos = cambia ? similarRingColors(elegido, p.product_name, otros).slice(0, 2) : [];
  const problemas = cambia ? ringColorProblems(elegido) : [];
  const imp = impresasDe(id);
  const opc = (c, n) => html`<${OpcionColor} key=${c} valor=${c} elegido=${elegido === c} n=${n ?? nombreColor(c)} d=${T.colores.letra(letraDe(c))} onElegir=${setElegido} />`;
  const usar = async () => {
    const antes = structuredClone(p);
    await guardarProducto({ ...p, ring_color: elegido });
    ir(volver, { reemplazar: true });
    avisar(T.colores.cambiado(p.product_name, nombreColor(elegido)), () => guardarProducto(antes));
  };
  const muestra = elegido ?? actual;
  return html`<${Pantalla} sec=${desde === 'ficha' ? 'productos' : 'ajustes'} titulo=${p.product_name} cab=${cab}
    fijo=${html`<${Btn} onClick=${usar} deshabilitado=${!cambia}>${T.colores.usar}<//>`}>
    <div class="grupo"><h2>${T.colores.asiSeVe}</h2>
      ${muestra ? html`<div class="aro-previa"><${Aro} color=${muestra} nombre=${p.product_name} />
        <div class="aro-texto"><p class="desc-muestra" style=${`color:${ringInk(muestra)}`}>${(p.description ?? [p.product_name.toUpperCase()]).join(' ')}</p>
        <p class="chico">${ringInk(muestra) === muestra ? T.colores.textoColor : T.colores.textoCafe}</p></div></div>`
      : html`<p>${T.colores.sinColor}</p>`}</div>
    ${parecidos.length > 0 && html`<${Nota}>${T.colores.parecido(parecidos.map((x) => x.name).join(' y '))}<//>`}
    ${problemas.includes('like_background') && html`<${Nota}>${T.colores.comoFondo}<//>`}
    ${problemas.includes('low_letter_contrast') && html`<${Nota}>${T.colores.letraMala}<//>`}
    ${cambia && imp.n > 0 && html`<${Info}>${T.colores.impresas(imp.n, imp.ultima && fecha(imp.ultima))}<//>`}
    <div class="grupo"><h2 id="t-color">${T.colores.elige}</h2>
      <div class="tarjeta lista" role="radiogroup" aria-labelledby="t-color">
        ${actual && opc(actual, `${T.colores.actual}: ${nombreColor(actual).toLowerCase()}`)}
        ${vista.map((c) => opc(c))}
      </div>
      <details class="tarjeta" open=${enMas}><summary><span>${mas.length ? `${T.colores.masColores(mas.length)} · ${T.colores.otro}` : T.colores.otro}</span><${Ico} n="sig" /></summary>
        <div class="dentro lista" role="radiogroup" aria-label=${T.colores.otro}>
          ${mas.map((c) => opc(c))}
          <label class="opcion"><input type="radio" name="color" value="otro" checked=${Boolean(otro) && elegido === otro}
            onChange=${() => { const c = otro ?? actual ?? '#6E421C'; setOtro(c); setElegido(c); }} />
            ${otro ? html`<${Muestra} color=${otro} grande />` : html`<span class="muestra grande vacia" aria-hidden="true"></span>`}
            <span class="tx"><span class="n">${T.colores.otro}</span><span class="d">${otro ? `${nombreColor(otro)} · ${T.colores.letra(letraDe(otro))}` : T.colores.otroD}</span></span></label>
          ${otro !== null && html`<label class="campo-color"><span>${T.colores.otroBtn}</span>
            <input type="color" value=${otro.toLowerCase()} aria-label=${T.colores.otroCampo}
              onInput=${(e) => { const c = e.target.value.toUpperCase(); setOtro(c); setElegido(c); }} /></label>`}
        </div></details></div>
  <//>`;
}
