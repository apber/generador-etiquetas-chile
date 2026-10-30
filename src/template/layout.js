// Runs in the browser: lays out every variant of the back with the real fonts, measures it, keeps the shortest
// (on a tie, the first one) and fixes the length of the label (the back measures the minimum for its content).
// Port of the measuring engine v11 (PRE_JS, SHIFT_JS and MEASURE_JS).
//
// Self-contained on purpose (no imports, no outside variables): label.js inlines it in the page with
// Function.prototype.toString, and the app can import it as a module.

export async function layoutLabel(root, cfg) {
  // Font metrics (fontTools): top of the capitals from the top of the line box, as a fraction of the size
  const RC_CAP = (1900 - 1456) / 2048;   // Roboto Condensed
  const MS_CAP = (968 - 700) / 1000;     // Montserrat
  const PIC_TOP = 4;                     // the bird of the signature starts 4 px below the top of its box

  if (document.fonts) {
    await Promise.all(["400 6.2px 'Roboto Condensed'", "700 6.2px 'Roboto Condensed'", '800 8.5px Montserrat', '700 6.4px Montserrat']
      .map((f) => document.fonts.load(f).catch(() => null)));
    await document.fonts.ready;
  }

  const firstTextTop = (el) => {
    const r = document.createRange(); r.selectNodeContents(el.firstChild ?? el);
    return r.getClientRects()[0].top;
  };

  function arrange(rev) {
    const info = {};
    const top = rev.getBoundingClientRect().top;
    // Name in one line: the column it reaches (closer than 4 px) moves down to 2 px below the name
    const nm = rev.querySelector('.nameN');
    if (nm) {
      const n = nm.getBoundingClientRect();
      rev.querySelectorAll('.reg[data-push]').forEach((r) => {
        const b = r.getBoundingClientRect();
        if (n.right + 4 <= b.left) return;
        const d = (n.bottom - top) + 2 - (b.top - top);
        if (d <= 0) return;
        r.style.marginTop = `${parseFloat(r.style.marginTop) + d}px`;
        info.pushed = Number(d.toFixed(2));
      });
    }
    // Signature and barcode go up: the head of the bird at the height of the name (if the name does not reach
    // their column, or if it is on top of the panel in one line) or of the first line of the ingredients
    const f = rev.querySelector('.cfl');
    if (f) {
      const fr = f.getBoundingClientRect();
      const nameT = rev.querySelector('.nameT');
      let target, how;
      if (nm && nm.getBoundingClientRect().right + 4 <= fr.left) {
        target = firstTextTop(nm) + MS_CAP * 8.5; how = 'nombre';
      } else if (nameT && (() => { const r = document.createRange(); r.selectNodeContents(nameT); return r.getClientRects().length === 1; })()) {
        target = firstTextTop(nameT) + MS_CAP * 8.5; how = 'nombre';
      } else {
        // First line of the first text paragraph (INGREDIENTES, or what comes first if it is missing)
        const p1 = rev.querySelector('.reg[data-key="ing"] .p1');
        const tw = document.createTreeWalker(p1, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.textContent.trim() ? 1 : 3) });
        const t = tw.nextNode();
        const r = document.createRange(); r.selectNodeContents(t);
        target = r.getClientRects()[0].top + RC_CAP * 6.2; how = 'ingredientes';
      }
      const d = (fr.top + PIC_TOP) - target;
      f.style.marginTop = `${-d}px`;
      info.signature = { at: how, up: Number(d.toFixed(2)) };
    }
    // 1 mm rule, paragraph by paragraph: a paragraph starts 1 mm further left only if it ends above the step;
    // from the first one that does not, no paragraph moves
    rev.querySelectorAll('.reg[data-shift]').forEach((r) => {
      const ex = parseFloat(r.dataset.shift), sy = parseFloat(r.dataset.stepy);
      const blks = [...r.querySelectorAll(':scope > .blk')];
      blks.forEach((b) => { b.style.paddingLeft = `${ex}px`; b.dataset.sh = '0'; });
      for (const b of blks) {
        b.style.paddingLeft = '0px';
        if (b.getBoundingClientRect().bottom - top <= sy + 0.01) { b.dataset.sh = '1'; continue; }
        b.style.paddingLeft = `${ex}px`; break;
      }
      info.shifted = blks.map((b) => b.dataset.sh).join('');
    });
    // Social block in the panel: if it does not fit beside the float, the space QR → text goes from 5 px down
    // to the minimum in steps of 0.25; if it still does not fit, back to 5 px
    rev.querySelectorAll('.rq').forEach((q) => {
      const blk = q.closest('.blk'), reg = q.closest('.reg');
      const fits = () => {
        const a = q.getBoundingClientRect(), b = blk.getBoundingClientRect(), r = reg.getBoundingClientRect();
        const padT = parseFloat(getComputedStyle(blk).paddingTop) || 0;
        return a.top - (b.top + padT) < 0.5 && a.right <= r.right + 0.05;
      };
      const gmin = parseFloat(q.dataset.gmin);
      let g = 5; q.style.gap = `${g}px`;
      while (!fits() && g - 0.25 >= gmin - 1e-6) { g -= 0.25; q.style.gap = `${g}px`; }
      if (!fits()) { g = 5; q.style.gap = '5px'; }
      const a = q.getBoundingClientRect(), r = reg.getBoundingClientRect();
      if (a.right > r.right + 0.05) reg.dataset.over = (a.right - r.right).toFixed(2);
      info.redes = { where: 'panel', gap: g, below: a.top - blk.getBoundingClientRect().top > 0.5 };
    });
    // Social block under the table: flush with the right edge of the content (the edge of the table), moving down
    // until it hits nothing (table 2.6 px, text and barcode 4 px). The two-line form is used if it fits right
    // below the table; if not, the three-line form if it ends higher.
    const rd = rev.querySelector('.reg[data-free]');
    if (rd) {
      const R0 = rev.getBoundingClientRect();
      const rel = (q, g) => ({ l: q.left - R0.left, r: q.right - R0.left, t: q.top - R0.top, b: q.bottom - R0.top, g });
      const tab = rel(rev.querySelector('.reg[data-key="colA"]').getBoundingClientRect(), 2.6);
      const obs = [tab];
      const ing = rev.querySelector('.reg[data-key="ing"]');
      const tw = document.createTreeWalker(ing, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        const rg = document.createRange(); rg.selectNodeContents(n);
        [...rg.getClientRects()].forEach((q) => { if (q.width > 0.3) obs.push(rel(q, 4)); });
      }
      ing.querySelectorAll('.flt, img, svg').forEach((el) => obs.push(rel(el.getBoundingClientRect(), 4)));
      const maxR = parseFloat(rd.dataset.maxr);
      const place = () => {
        const rb = rd.getBoundingClientRect(), W = rb.width, H = rb.height;
        const x = maxR - W;
        let y = tab.b + 2.6, moved = true, k = 0;
        while (moved && k++ < 60) {
          moved = false;
          for (const o of obs) {
            if (x < o.r + o.g - 0.05 && x + W > o.l - o.g + 0.05 && y < o.b + o.g - 0.05 && y + H > o.t - o.g + 0.05) { y = o.b + o.g; moved = true; }
          }
        }
        return { x, y, H };
      };
      const rw = rd.querySelector('.rw'), rn = rd.querySelector('.rn');
      let best = place(), lines = 2;
      if (rn && best.y > tab.b + 2.65) {
        rw.style.display = 'none'; rn.style.display = '';
        const b3 = place();
        if (b3.y + b3.H < best.y + best.H - 0.01) { best = b3; lines = 3; } else { rw.style.display = ''; rn.style.display = 'none'; }
      }
      rd.style.left = `${best.x}px`; rd.style.top = `${best.y}px`;
      info.redes = { where: 'tabla', lines, x: Number(best.x.toFixed(1)), y: Number(best.y.toFixed(1)) };
    }
    return info;
  }

  function measure(rev) {
    const R0 = rev.getBoundingClientRect();
    let over = -Infinity, bad = false;
    const regions = {};
    rev.querySelectorAll('.reg').forEach((r) => {
      const b = r.getBoundingClientRect();
      const blks = [...r.querySelectorAll(':scope > .blk')];
      let bottom = blks.length ? Math.max(...blks.map((x) => x.getBoundingClientRect().bottom)) : b.top;
      r.querySelectorAll('.flt').forEach((fl) => { bottom = Math.max(bottom, fl.getBoundingClientRect().bottom); });
      bottom -= R0.top;
      regions[r.dataset.key] = { top: Number((b.top - R0.top).toFixed(2)), bottom: Number(bottom.toFixed(2)), left: Number((b.left - R0.left).toFixed(2)), right: Number((b.right - R0.left).toFixed(2)) };
      over = Math.max(over, bottom - cfg.limit);
      if (r.dataset.key === 'ing' && r.dataset.over) bad = true;
    });
    const len = bad ? 99 : Math.ceil((cfg.baseLengthMm + over / cfg.mm) * 10 - 1e-6) / 10;
    return { len, over, regions };
  }

  const revs = [...root.querySelectorAll('.variants .rev')];
  const results = revs.map((rev) => ({ rev, id: rev.dataset.variant, info: arrange(rev) }));
  results.forEach((r) => Object.assign(r, measure(r.rev)));
  let best = results[0];
  for (const r of results) if (r.len < best.len) best = r;   // first one on a tie

  const lengthMm = best.len;
  const cut = cfg.baseCut + Math.round((lengthMm - cfg.baseLengthMm) * cfg.mm * 1000) / 1000;
  const check = Math.max(...Object.values(best.regions).map((g) => g.bottom)) - (cfg.limit + (cut - cfg.baseCut));

  // Move the chosen back into the label and fix the length
  const back = root.querySelector('.back');
  back.replaceChildren(...best.rev.childNodes);
  back.querySelectorAll('.rw, .rn').forEach((e) => { if (e.style.display === 'none') e.remove(); });
  back.style.height = `${(Math.round((cut + 0.75) * 100) / 100)}px`;
  const r2 = (v) => Math.round(v * 100) / 100;
  const d = cfg.outline.replaceAll('{C7}', String(r2(cut - 7.25))).replaceAll('{C}', String(r2(cut)));
  root.querySelectorAll('.outline').forEach((p) => p.setAttribute('d', d));
  const H = Math.ceil(cut + 0.75);
  root.style.height = `${H}px`;
  const svg = root.querySelector('svg.strip');
  if (svg) { svg.setAttribute('height', String(H)); svg.setAttribute('viewBox', `0 0 ${cfg.boardWidth} ${H}`); }
  root.querySelector('.variants')?.remove();

  const result = {
    variant: best.id, lengthMm, cut: r2(cut), boardHeight: H, check: Number(check.toFixed(2)), ...best.info,
    regions: best.regions,
    candidates: results.map((r) => ({ id: r.id, lengthMm: r.len })),
  };
  root.dataset.lengthMm = String(lengthMm);
  return result;
}
