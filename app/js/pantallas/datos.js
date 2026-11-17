// «Datos del producto» (ronda 2: «Ver los datos leídos», agrupado por estado), los editores de un dato y las fotos.
import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { T } from '../../textos.js';
import { Cab, Btn, Nota, Info, Ico, ir, avisar, fecha } from '../ui.js';
import { Pantalla } from '../marco.js';
import { estado, useAlmacen, guardarProducto, leerArchivo } from '../datos/almacen.js';
import { avisos } from '../productos-info.js';
import { textoAviso } from '../avisos.js';
import { NUTRIENTS } from '../../../src/nutrients.js';
import { NUTRIENT_LABELS } from '../../../src/i18n/es.js';
import { NoEsta } from './productos.js';
import { Fotos as FotosNuevas } from './nuevo.js';

const num = (v) => (v == null ? '—' : String(v).replace('.', ','));
const nombreAlergenos = (ids) => (ids ?? []).map((id) => estado.catalog.allergens.find((a) => a.id === id)?.name.es ?? id).join(', ');
const sinLlaves = (s) => (s ?? '').replace(/[{}]/g, '');

/** Cada dato de la ficha: clave, nombre, valor en texto. */
function datosDe(p) {
  const out = [];
  const c = p.composition ?? {};
  const s = p.nutrition?.serving;
  if (p.type === 'simple') {
    out.push({ k: 'serving', n: T.datos.porcion, v: s ? `${s.household_measure ? `${s.household_measure} ` : ''}(${num(s.g)} g)` : T.datos.nada });
    for (const n of NUTRIENTS) {
      const v = p.nutrition?.per_100g?.[n.key];
      if (!v && n.group !== 'mandatory') continue;
      out.push({ k: n.key, n: NUTRIENT_LABELS[n.key], v: v ? num(v.value) : T.datos.nada });
    }
    out.push({ k: 'ingredients', n: T.datos.ingredientes, v: c.ingredients ? sinLlaves(c.ingredients) : T.datos.nada, largo: true });
    out.push({ k: 'contains', n: T.datos.contiene, v: c.contains == null ? T.datos.nada : nombreAlergenos(c.contains) || 'Nada', largo: true });
    out.push({ k: 'may_contain', n: T.datos.puede, v: c.may_contain == null ? T.datos.nada : nombreAlergenos(c.may_contain) || 'Nada', largo: true });
    out.push({ k: 'country_of_origin', n: T.datos.origen, v: c.country_of_origin ?? T.datos.nada });
    out.push({ k: 'storage', n: T.datos.conservacion, v: c.storage ?? estado.company?.default_storage ?? T.datos.nada, largo: true });
  }
  out.push({ k: 'description', n: T.datos.descripcion, v: (p.description ?? []).join(' / '), largo: true, fijo: true });
  if (p.highlight?.length) out.push({ k: 'highlight', n: T.datos.destacado, v: p.highlight.join(' / '), largo: true, fijo: true });
  return out;
}

/** Campo editable de un aviso (para «Arreglar»). */
const EDITABLE = new Set(['serving', 'ingredients', 'contains', 'may_contain', 'country_of_origin', 'storage', ...NUTRIENTS.map((n) => n.key)]);
const campoDeAviso = (a) => {
  const base = a.code.split(':')[0];
  if (base === 'missing_nutrient') return a.params?.key;
  return { missing_may_contain: 'may_contain', missing_contains: 'contains', missing_origin: 'country_of_origin', missing_ingredients: 'ingredients',
    missing_serving: 'serving' }[base] ?? null;
};

export function Datos({ id }) {
  useAlmacen();
  const p = estado.products.get(id);
  if (!p) return html`<${NoEsta} />`;
  const st = p.field_states ?? {};
  const lista = datosDe(p);
  const dudosos = lista.filter((d) => st[d.k] === 'doubtful');
  const porConf = lista.filter((d) => st[d.k] === 'unconfirmed');
  const conf = lista.filter((d) => !d.fijo && st[d.k] !== 'doubtful' && st[d.k] !== 'unconfirmed');
  const av = avisos(id);
  const confirmar = async (k, n) => {
    const antes = p.field_states;
    await guardarProducto({ ...p, field_states: { ...st, [k]: 'confirmed' } });
    avisar(T.datos.confirmado(n), () => guardarProducto({ ...estado.products.get(id), field_states: antes }));
  };
  const aceptar = async (a) => {
    // «El proveedor no lo dice»: queda anotado y deja de pedirse (la etiqueta sigue sin esa línea)
    const ca = [...(p.confirmed_alerts ?? []).filter((x) => x.alert !== a.code), { alert: a.code, decision: 'accepted', date: new Date().toISOString().slice(0, 10), note: 'El proveedor no lo informa (app)' }];
    const antes = p.confirmed_alerts;
    await guardarProducto({ ...p, confirmed_alerts: ca });
    avisar('Quedó anotado.', () => guardarProducto({ ...estado.products.get(id), confirmed_alerts: antes }));
  };
  const Dato = ({ d }) => html`<div class=${`dato${d.largo ? ' largo' : ''}`}><span>${d.n}</span><span class="v">${d.v}</span></div>`;
  return html`<${Pantalla} sec="productos" titulo=${T.datos.titulo}
    cab=${html`<${Cab} volver=${`/productos/${id}`} etiquetaVolver="Volver al producto" donde=${p.product_name} />`}>
    ${av.map((a) => {
      const t = textoAviso(a);
      const campo = campoDeAviso(a);
      return html`<div class="nota" key=${a.code}><${Ico} n="alerta" /><span class="tx">${t.texto}</span>
        <div class="fila-botones" style="flex-basis:100%">
          ${campo && EDITABLE.has(campo) && html`<${Btn} tipo="secundario" chico onClick=${() => ir(`/productos/${id}/editar/${campo}`)}>${T.nuevo.escribir}<//>`}
          ${(a.code === 'missing_may_contain' || a.code === 'missing_origin') && html`<${Btn} tipo="secundario" chico onClick=${() => aceptar(a)}>El proveedor no lo dice<//>`}
          <${Btn} tipo="secundario" chico onClick=${() => ir(`/productos/${id}/fotos`)}>${T.nuevo.sacarCerca}<//></div></div>`;
    })}
    ${dudosos.length > 0 && html`<section class="grupo"><h2><span class="et du"><${Ico} n="excl" />${T.datos.dudoso}</span></h2>
      ${dudosos.map((d) => html`<div class="nota" key=${d.k}><div class="tx" style="flex-basis:100%"><${Dato} d=${d} /></div>
        <${Btn} tipo="secundario" chico onClick=${() => ir(`/productos/${id}/editar/${d.k}`)}>${T.datos.arreglar(d.n.replace(/ \(.*\)$/, '').toLowerCase())}<//></div>`)}</section>`}
    ${porConf.length > 0 && html`<section class="grupo"><h2><span class="et pc"><${Ico} n="preg" />${T.datos.porConfirmar}</span></h2>
      ${porConf.map((d) => html`<div class="tarjeta" key=${d.k}><${Dato} d=${d} />
        <div class="fila-botones"><${Btn} chico onClick=${() => confirmar(d.k, d.v)}>${T.datos.confirmar(d.v.length > 24 ? `${d.v.slice(0, 22)}…` : d.v)}<//>
        ${EDITABLE.has(d.k) && html`<${Btn} tipo="secundario" chico onClick=${() => ir(`/productos/${id}/editar/${d.k}`)}>Cambiar<//>`}</div></div>`)}</section>`}
    <details class="tarjeta" open=${!dudosos.length && !porConf.length}><summary><span>${T.datos.confirmados(conf.length)}</span><${Ico} n="sig" /></summary>
      <div class="dentro">${conf.map((d) => html`<${Dato} key=${d.k} d=${d} />`)}</div></details>
    ${p.sources?.length > 0 && html`<p class="chico">${T.datos.fuente}: ${[...new Set(p.sources.map((s) => s.from))].join(' · ')}</p>`}
  <//>`;
}

// ---- Editar un dato ----
const esNutriente = (k) => NUTRIENTS.some((n) => n.key === k);
export function Editar({ id, campo }) {
  const p = estado.products.get(id);
  const c = p?.composition ?? {};
  const inicial = () => {
    if (!p) return '';
    if (esNutriente(campo)) return num(p.nutrition?.per_100g?.[campo]?.value ?? '').replace('—', '');
    if (campo === 'serving') return { g: p.nutrition?.serving?.g ?? '', m: p.nutrition?.serving?.household_measure ?? '' };
    if (campo === 'contains' || campo === 'may_contain') return new Set(c[campo] ?? []);
    if (campo === 'ingredients') return sinLlaves(c.ingredients);
    return c[campo] ?? '';
  };
  const [v, setV] = useState(inicial);
  const [err, setErr] = useState(null);
  if (!p) return html`<${NoEsta} />`;
  const nombreCampo = esNutriente(campo) ? NUTRIENT_LABELS[campo] : { serving: T.datos.porcion, ingredients: T.datos.ingredientes, contains: T.datos.contiene,
    may_contain: T.datos.puede, country_of_origin: T.datos.origen, storage: T.datos.conservacion }[campo];
  const volver = () => ir(`/productos/${id}/datos`);
  const fuenteApp = () => {
    const sources = [...(p.sources ?? [])];
    if (!sources.some((s) => s.id === 'app')) sources.push({ id: 'app', level: 1, kind: 'manual', from: 'Escrito en la app', date: new Date().toISOString().slice(0, 10), files: [] });
    return sources;
  };
  const guardar = async () => {
    const q = structuredClone(p);
    q.field_states = { ...(q.field_states ?? {}), [campo]: 'confirmed' };
    if (esNutriente(campo)) {
      const x = Number(String(v).replace(',', '.'));
      if (!String(v).trim() || !Number.isFinite(x) || x < 0) { setErr('Escribe un número, por ejemplo 12,5.'); return; }
      q.nutrition.per_100g = { ...(q.nutrition.per_100g ?? {}), [campo]: { value: x, source: 'app' } };
    } else if (campo === 'serving') {
      const g = Number(String(v.g).replace(',', '.'));
      if (!Number.isFinite(g) || g <= 0) { setErr('Escribe los gramos de la porción, por ejemplo 30.'); return; }
      q.nutrition.serving = { g, household_measure: v.m.trim() || null, source: 'app' };
    } else if (campo === 'contains' || campo === 'may_contain') {
      q.composition[campo] = [...v];
    } else if (campo === 'ingredients') {
      if (!v.trim()) { setErr('Escribe los ingredientes.'); return; }
      q.composition.ingredients = marcarAlergenos(v.trim(), q.composition.contains ?? []);
    } else {
      q.composition[campo] = String(v).trim() || null;
    }
    q.sources = fuenteApp();
    q.composition.field_sources = { ...(q.composition.field_sources ?? {}), ...(['ingredients', 'contains', 'may_contain', 'country_of_origin', 'storage'].includes(campo) ? { [campo]: 'app' } : {}) };
    if (!Object.keys(q.composition.field_sources).length) delete q.composition.field_sources;
    await guardarProducto(q);
    avisar(`Se guardó ${nombreCampo.replace(/ \(.*\)$/, '').toLowerCase()}.`, () => guardarProducto(p));
    volver();
  };
  return html`<${Pantalla} sec="productos" titulo=${nombreCampo}
    cab=${html`<${Cab} volver=${volver} etiquetaVolver="Volver a Datos del producto" donde=${p.product_name} />`}>
    ${esNutriente(campo) && html`<div class="campo"><label for="v">${nombreCampo} en 100 g</label>
      <input id="v" inputmode="decimal" autocomplete="off" value=${v} onInput=${(e) => { setV(e.target.value); setErr(null); }} /></div>`}
    ${campo === 'serving' && html`<div class="campo"><label for="g">Gramos de la porción</label>
      <input id="g" inputmode="decimal" value=${v.g} onInput=${(e) => { setV({ ...v, g: e.target.value }); setErr(null); }} /></div>
      <div class="campo"><label for="m">Medida casera</label><input id="m" value=${v.m} aria-describedby="m-ayuda" onInput=${(e) => setV({ ...v, m: e.target.value })} />
      <span id="m-ayuda" class="ayuda">Por ejemplo: ¼ taza, 2 cucharadas, 5 unidades.</span></div>`}
    ${(campo === 'contains' || campo === 'may_contain') && html`<p class="chico">Marca los que dice la bolsa del proveedor.</p>
      <div class="tarjeta lista">${estado.catalog.allergens.filter((a) => a.group !== 'gluten_cereals' || campo === 'may_contain').map((a) => html`<label class="opcion" key=${a.id}>
        <input type="checkbox" style="width:28px;height:28px;margin:0 10px" checked=${v.has(a.id)} onChange=${(e) => { const s = new Set(v); if (e.target.checked) s.add(a.id); else s.delete(a.id); setV(s); }} />
        <span class="tx"><span class="n">${a.name.es}</span></span></label>`)}</div>`}
    ${['ingredients', 'storage', 'country_of_origin'].includes(campo) && html`<div class="campo"><label for="t">${nombreCampo}</label>
      <textarea id="t" rows=${campo === 'country_of_origin' ? 1 : 5} onInput=${(e) => { setV(e.target.value); setErr(null); }}>${v}</textarea>
      ${campo === 'ingredients' && html`<span class="ayuda">Como en la bolsa. Los alérgenos de «Contiene» salen en negrita solos.</span>`}</div>`}
    ${err && html`<p class="campo"><span class="error" role="alert">${err}</span></p>`}
    <${Btn} onClick=${guardar}>${T.comun.guardar}<//>
  <//>`;
}

/** Pone {…} en los alérgenos de «Contiene» que aparecen en el texto (para la negrita). */
export function marcarAlergenos(texto, ids) {
  let t = texto.replace(/[{}]/g, '');
  const nombres = ids.flatMap((id) => {
    const a = estado.catalog.allergens.find((x) => x.id === id);
    return [a?.name.es, ...(estado.catalog.reading_aliases?.[id] ?? [])].filter(Boolean);
  }).sort((a, b) => b.length - a.length);
  for (const n of nombres) {
    const re = new RegExp(`(^|[^\\p{L}{])(${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}}])`, 'giu');
    t = t.replace(re, '$1{$2}');
  }
  return t;
}

// ---- Fotos del proveedor ----
export function Fotos({ id }) {
  useAlmacen();
  const p = estado.products.get(id);
  const [lista, setLista] = useState(null);
  const [nuevas, setNuevas] = useState(false);
  useEffect(() => {
    let urls = [];
    (async () => {
      const ind = (await leerArchivo(`fotos/${id}/indice.json`)) ?? [];
      const out = [];
      for (const f of ind) {
        const b = await leerArchivo(`fotos/${id}/${f.archivo}`);
        const url = b instanceof Blob ? URL.createObjectURL(b) : null;
        if (url) urls.push(url);
        out.push({ ...f, url });
      }
      setLista(out);
    })();
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [id, estado.version]);
  if (!p) return html`<${NoEsta} />`;
  if (nuevas) return html`<${FotosNuevas} productoId=${id} />`;
  return html`<${Pantalla} sec="productos" titulo=${T.ficha.fotos}
    cab=${html`<${Cab} volver=${`/productos/${id}`} etiquetaVolver="Volver al producto" donde=${p.product_name} />`}>
    ${lista && !lista.length && html`<p>${T.ficha.fotosD(0)}</p>`}
    <div class="hojas">${(lista ?? []).map((f) => html`<figure class="hoja" key=${f.archivo}>
      ${f.url ? html`<a href=${f.url} target="_blank" rel="noopener"><img class="mini" style="width:100%;height:auto" src=${f.url} alt=${`Foto del ${fecha(f.fecha)}`} /></a>` : html`<span class="chico">Se baja de OneDrive…</span>`}
      <figcaption class="chico">${fecha(f.fecha)}</figcaption></figure>`)}</div>
    <${Info}>Si la bolsa cambió o algo no se leyó bien, saca fotos nuevas: se vuelven a leer y los datos se actualizan.<//>
    <${Btn} ico="camara" onClick=${() => setNuevas(true)}>Sacar fotos nuevas<//>
  <//>`;
}
