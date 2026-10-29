// Back of the label (one continuous piece, union B): ingredients panel with the signature and the barcode
// floating on its right, the nutrition table (table F) at the right edge, and the social block (QR + SÍGUENOS +
// handles) under the table or at the end of the panel. Distribution 13N with the adjustments up to v2.39.
//
// The template builds several variants of the back (name in one line or on top of the panel; social block under
// the table or in the panel; space QR → text of the two-line block from 5 to 2.5 px). The browser lays out each
// one with the real fonts (layout.js) and keeps the shortest; on a tie, the first in VARIANTS order.
// Port of the measuring engine v11 (alternative "13N-aj-g").

import { BACK, MM } from './geometry.js';
import { esc, icon } from './html.js';
import { ean13Svg } from './ean13-svg.js';
import { qrSvg } from './qr-svg.js';

const TXT = "font-family: 'Roboto Condensed', Arial, sans-serif; font-size: 6.2px; line-height: 1.17; color: #2B1A10";
const MONT_TITLE = 'font-family: Montserrat, sans-serif; font-weight: 800; font-size: 7px; letter-spacing: 0.5px';

export const TABLE_LABELS = {
  energy_kcal: 'Energía (kcal)', protein_g: 'Proteínas (g)', total_fat_g: 'Grasas totales (g)',
  saturated_fat_g: 'Grasas saturadas (g)', monounsaturated_fat_g: 'Grasas monoinsaturadas (g)',
  polyunsaturated_fat_g: 'Grasas poliinsaturadas (g)', trans_fat_g: 'Grasas trans (g)', cholesterol_mg: 'Colesterol (mg)',
  available_carbohydrates_g: 'H. de C. disponibles (g)', total_sugars_g: 'Azúcares totales (g)',
  dietary_fiber_g: 'Fibra dietética (g)', sodium_mg: 'Sodio (mg)',
};
const BOLD = new Set(['energy_kcal', 'protein_g', 'total_fat_g', 'cholesterol_mg', 'available_carbohydrates_g', 'dietary_fiber_g', 'sodium_mg']);
const INDENT = new Set(['saturated_fat_g', 'monounsaturated_fat_g', 'polyunsaturated_fat_g', 'trans_fat_g', 'total_sugars_g']);
// Line under each row: 0.75 px between groups, 0.4 px inside a group (table F)
const BORDER = { energy_kcal: 0.75, protein_g: 0.75, total_fat_g: 0.4, saturated_fat_g: 0.4, monounsaturated_fat_g: 0.4,
  polyunsaturated_fat_g: 0.4, trans_fat_g: 0.75, cholesterol_mg: 0.75, available_carbohydrates_g: 0.4, total_sugars_g: 0.75,
  dietary_fiber_g: 0.75, sodium_mg: 0.75 };

/** Variants measured for each product, in tie-break order (engine v11, "13N-aj-g"). */
export const VARIANTS = (() => {
  const out = [];
  for (let i = 0; i <= 10; i++) {
    const wideGap = 5 - 0.25 * i;
    for (const name of ['line', 'top']) {
      for (const redes of ['table', 'panel']) out.push({ id: `${name}${redes === 'panel' ? '+ri' : ''}@${wideGap}`, name, redes, wideGap });
    }
  }
  // engine order: line, line+ri, top, top+ri for each gap
  return out.sort((a, b) => b.wideGap - a.wideGap || ['line', 'line+ri', 'top', 'top+ri'].indexOf(a.id.split('@')[0]) - ['line', 'line+ri', 'top', 'top+ri'].indexOf(b.id.split('@')[0]));
})();

const f2 = (v) => v.toFixed(2);
const endDot = (t) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/** Everything the back needs, as HTML fragments, from the label data (label-data.js) and the company record. */
export function backContent(d, company, opts = {}) {
  const missing = opts.missingText ?? '[por confirmar]';
  const segs = d.ingredients?.segments;
  const ing = segs ? endDot(segs.map((s) => (s.bold ? `<b>${esc(s.text)}</b>` : esc(s.text))).join('')) : missing;
  const res = d.healthPermit;
  const m = res.match(/^(.*?)(N° \S+)\s*(– .*)$/);
  const resHtml = m ? `${esc(m[1])}<span style="white-space: nowrap">${esc(m[2])}</span> <span style="white-space: nowrap">${esc(m[3])}</span>` : esc(res);
  const fu = company.follow_us ?? {};
  const assets = opts.assets ?? {};
  const handles = [
    fu.instagram && { kind: 'instagram', html: `<b>${esc(fu.instagram)}</b>` },
    fu.whatsapp && { kind: 'whatsapp', html: esc(fu.whatsapp) },
    fu.facebook && { kind: 'facebook', html: esc(fu.facebook) },
  ].filter(Boolean).map((h) => ({ ...h, icon: assets.icons?.[h.kind] }));
  return {
    name: esc(d.front.productName.toUpperCase()),
    ring: d.front.ringColor,
    brand: esc((company.brand ?? '').toUpperCase()),
    ing,
    origin: { title: esc(d.origin.title), text: esc(endDot(d.origin.text ?? missing)) },
    contains: d.contains.text ? esc(endDot(d.contains.text)) : null,
    mayContain: d.mayContain.text ? esc(endDot(d.mayContain.text)) : null,
    storage: d.storage ? esc(d.storage) : null,
    extra: [d.usageInstructions, d.extraText].filter(Boolean).map(esc),
    packer: { title: esc(d.packer.title), text: esc(d.packer.text) },
    res: resHtml,
    table: d.nutrition,
    barcode: d.barcode,
    barcodeScale: opts.barcodeScale ?? 0.8,
    qr: fu.qr_url ? qrSvg(fu.qr_url, BACK.qrSize, `Código QR a ${fu.qr_label ?? 'las redes de la marca'}`) : '',
    handles,
    signatureIcon: assets.signatureIcon ?? null,
  };
}

function table(c) {
  const n = c.table;
  const cols = n.columns ?? { per100g: '100 g', perServing: 'Porción' };
  const pad = '0.4px';
  const rows = n.rows.map((r, i) => {
    const bw = i === n.rows.length - 1 ? 0 : BORDER[r.key] ?? 0.75;
    return `<tr style="border-bottom: ${bw}px solid #000000"><td style="${BOLD.has(r.key) ? 'font-weight: 700; ' : ''}padding: ${pad} 2px ${pad} ${INDENT.has(r.key) ? 7 : 2}px">${TABLE_LABELS[r.key] ?? r.key}</td>`
      + `<td style="text-align: right; padding: ${pad} 2px">${esc(r.per100g?.text ?? '—')}</td>`
      + `<td style="text-align: right; padding: ${pad} 2px">${esc(r.perServing?.text ?? '—')}</td></tr>`;
  }).join('');
  const hd = 'padding: 0 2px';
  const note = n.note ? `<tr><td colspan="3" style="${hd}; font-weight: 700">${esc(n.note)}</td></tr>` : '';
  const top = 'border-top: 0.75px solid #000000; ';
  return '<div class="tbl" style="width: auto; border: 0.75px solid #000000; background: #FFFFFF; color: #000000; font-family: Arial, Helvetica, sans-serif; font-size: 6.6px; line-height: 1.2; white-space: nowrap">'
    + '<table style="width: 100%; border-collapse: collapse; font-size: 6.6px; line-height: 1.2"><tbody>'
    + `<tr><td colspan="3" style="padding: 1.5px 2px 0 2px; font-weight: 700; font-size: 7px">INFORMACIÓN NUTRICIONAL</td></tr>${note}`
    + `<tr><td colspan="3" style="${hd}">${esc(n.servingsPerPackage?.label ?? '')}</td></tr>`
    + `<tr style="border-bottom: 0.75px solid #000000"><td style="white-space: nowrap; padding: 0 3.5px 1px 2px">${esc(n.serving?.text ?? '')}</td>`
    + `<td style="border-left: 0.75px solid #000000; ${top}white-space: nowrap; text-align: right; padding: 0.5px 1px 1px 2px; font-weight: 700">${esc(cols.per100g)}</td>`
    + `<td style="${top}white-space: nowrap; text-align: right; padding: 0.5px 2px 1px 2px; font-weight: 700">${esc(cols.perServing)}</td></tr>`
    + `${rows}</tbody></table></div>`;
}

function barcodeBlock(c) {
  const b = BACK.barcodeBase;
  const w = (b.w * c.barcodeScale) / b.scale, h = (b.h * c.barcodeScale) / b.scale;
  const svg = c.barcode
    ? ean13Svg(c.barcode, { width: f2(h), height: f2(w) })
    : `<svg viewBox="0 0 ${f2(h)} ${f2(w)}" width="${f2(h)}" height="${f2(w)}" role="img" aria-label="Sin código de barras"><rect x="0.5" y="0.5" width="${f2(h - 1)}" height="${f2(w - 1)}" fill="#FFFFFF" stroke="#9C8F80" stroke-dasharray="2 1.5"></rect><text x="${f2(h / 2)}" y="${f2(w / 2 + 2)}" style="font-family: Arial, sans-serif; font-size: 6px; fill: #9C8F80; text-anchor: middle">SIN CÓDIGO</text></svg>`;
  return { w, h, html: `<div style="position: relative; width: ${f2(w)}px; height: ${f2(h)}px; margin: 0 auto"><div style="position: absolute; left: 0; top: ${f2(h)}px; width: ${f2(h)}px; height: ${f2(w)}px; transform: rotate(-90deg); transform-origin: 0 0">${svg}</div></div>` };
}

function signature(c) {
  const s = BACK.signature;
  const ic = c.signatureIcon ? `<img src="${esc(c.signatureIcon)}" alt="" style="position: absolute; left: ${s.iconLeft}px; top: ${s.iconTop}px; height: ${s.iconHeight}px">` : '';
  return `<div style="position: relative; width: ${s.w.toFixed(1)}px; height: ${s.h}px; margin-left: 1.2px"><div style="position: absolute; left: 0; top: ${s.top}px; width: ${s.w.toFixed(1)}px; text-align: center; font-family: Montserrat, sans-serif; font-weight: 800; font-size: ${s.fontSize}px; letter-spacing: 1px; line-height: 1; color: #4A2C1D; white-space: nowrap">${c.brand}</div>${ic}</div>`;
}

const handleRow = (h, first) => (h.kind === 'facebook' && !first
  ? `<div style="display: flex; align-items: flex-start; gap: 3px; margin-top: 2px">${icon(h.icon)}<span style="padding-top: 0.4px">${h.html}</span></div>`
  : `<div style="display: flex; align-items: center; gap: 3px${first ? '' : '; margin-top: 2px'}">${icon(h.icon)}<span>${h.html}</span></div>`);

/** QR + SÍGUENOS + one handle per line (the inside of the three-line social block). */
const redesColumn = (c) => `${c.qr}<div style="display: flex; flex-direction: column; gap: 2px; font-size: 6.2px; line-height: 1.15; white-space: nowrap">`
  + `<div style="${MONT_TITLE}">SÍGUENOS</div><div style="display: flex; flex-direction: column">${c.handles.map((h, i) => handleRow(h, i === 0)).join('')}</div></div>`;

/** Social block in three lines under the table (QR towards the edge). */
const redesNarrow = (c) => `<div style="display: flex; flex-direction: row-reverse; align-items: center; gap: 5px; ${TXT}">${redesColumn(c)}</div>`;

/** Social block in three lines in the panel; layout.js narrows the space QR → text (5 → 2.5 px) if needed. */
const redesPanel = (c) => `<div class="rq" data-gmin="2.5" style="display: flex; width: max-content; align-items: center; gap: 5px; ${TXT}">${redesColumn(c)}</div>`;

/** Social block in two lines (first two handles, then the rest), QR towards the edge. */
function redesWide(c, gap, slack) {
  const grp = (h) => `<span style="white-space: nowrap">${icon(h.icon, 8, true)} ${h.html}</span>`;
  const l1 = c.handles.slice(0, 2).map(grp).join(' · ');
  const l2 = c.handles.slice(2).map(grp).join(' · ');
  const pr = gap !== 5 ? ` padding-right: ${slack}px;` : '';
  return `<div style="display: flex; flex-direction: row-reverse; align-items: center; gap: ${gap}px;${pr} ${TXT}">${c.qr}<div>`
    + `<div style="${MONT_TITLE}">SÍGUENOS</div><div style="margin-top: 2px; white-space: nowrap">${l1}${l2 ? `<br>${l2}` : ''}</div></div></div>`;
}

function fechas() {
  const col = (w) => '<div style="flex: none; display: flex; flex-direction: column"><div style="font-size: 6.2px; line-height: 1.2">FECHA DE</div>'
    + `<div style="font-size: 9px; line-height: 1.1">${w}</div><div style="height: 20px; "></div></div>`;
  return `<div style="display: flex; width: max-content; gap: 5px; font-family: 'Roboto Condensed', Arial, sans-serif; color: #2B1A10; font-weight: 700">${col('ELABORACIÓN')}${col('VENCIMIENTO')}</div>`;
}

const block = (html, gap, shift = BACK.shift) => `<div class="blk" style="margin-top: ${gap}px; padding-left: ${shift.toFixed(4)}px;">${html}</div>`;

/**
 * HTML of one variant of the back, in view coordinates (x = 0 at the right fold of the front).
 * The `.rev` element is what layout.js arranges and measures.
 */
export function backVariantHtml(c, v) {
  const hasRedes = c.handles.length > 0 || c.qr;
  const redesInPanel = v.redes === 'panel' && hasRedes;
  const rowX = BACK.textX - BACK.shift;
  const ingY = 5 + (v.name === 'line' ? BACK.nameHeight + BACK.nameGap : 0);
  const bc = barcodeBlock(c);
  const cw = Math.max(bc.w, BACK.signature.w + 1.2);
  const float = `<div class="flt cfl" style="float: right; width: ${f2(cw)}px; margin-left: 4px; margin-bottom: 2px">${signature(c)}<div style="height: 1px"></div>${bc.html}</div>`;
  const nameTop = `<div class="nameT" style="font-family: Montserrat, sans-serif; font-weight: 800; font-size: 8.5px; letter-spacing: 0.4px; line-height: 1.17; color: ${c.ring}; text-align: left">${c.name}</div>`;

  const paras = [];
  if (v.name === 'top') paras.push(nameTop);
  paras.push(`<div><b>INGREDIENTES:</b> ${c.ing}<br><b>${c.origin.title}</b> ${c.origin.text}</div>`);
  paras[0] = float + paras[0];
  const cc = [c.contains && `<b>CONTIENE:</b> ${c.contains}`, c.mayContain && `<b>PUEDE CONTENER:</b> ${c.mayContain}`].filter(Boolean);
  if (cc.length) paras.push(`<div>${cc.join('<br>')}</div>`);
  if (c.storage) paras.push(`<div>${c.storage}</div>`);
  for (const t of c.extra) paras.push(`<div>${t}</div>`);
  paras.push(`<div><b>${c.packer.title}</b> ${c.packer.text}<br>${c.res}</div>`);
  let blocks = paras.map((p, i) => block(p, i === 0 ? 0 : BACK.gap)).join('');
  if (redesInPanel) {
    blocks += block(redesPanel(c), BACK.redesGap);
  }
  blocks += block(fechas(), redesInPanel ? BACK.redesGap : BACK.gap);

  const push = v.name === 'line' ? ' data-push="1"' : '';
  const ing = `<div class="reg" data-key="ing" data-shift="${BACK.shift.toFixed(4)}" data-stepy="${BACK.stepY}" style="position: relative; flex: 1 1 0; min-width: 0; margin-top: ${ingY.toFixed(3)}px; margin-right: ${BACK.gutter}px; display: flow-root; ${TXT}">${blocks}</div>`;
  const colA = `<div class="reg" data-key="colA"${push} style="position: relative; flex: none; width: max-content; margin-top: 4px; display: flow-root;"><div class="blk" style="margin-top: 0px;">${table(c)}</div></div>`;
  const row = `<div class="rowB" style="position: absolute; left: ${f2(rowX)}px; top: 0; width: ${f2(BACK.contentRight - rowX)}px; display: flex; align-items: flex-start">${ing}${colA}</div>`;
  const redes = hasRedes && !redesInPanel
    ? `<div class="reg" data-key="redes" data-free="1" data-maxr="${BACK.contentRight}" style="position: absolute; left: 0px; top: 0px; width: max-content; display: flow-root;"><div class="blk" style="margin-top: 0px;"><div class="rw">${redesWide(c, v.wideGap, 0.75)}</div><div class="rn" style="display: none">${redesNarrow(c)}</div></div></div>`
    : '';
  const nameLine = v.name === 'line'
    ? `<div class="nameN" style="position: absolute; left: ${f2(rowX)}px; top: 5px; white-space: nowrap; font-family: Montserrat, sans-serif; font-weight: 800; font-size: 8.5px; letter-spacing: 0.4px; line-height: 1.17; color: ${c.ring}">${c.name}</div>`
    : '';
  return `<div class="rev" data-variant="${v.id}" style="position: relative; width: ${f2(BACK.width)}px; height: ${f2(BACK.cut + 64)}px">${row}${redes}${nameLine}</div>`;
}

export { MM };
