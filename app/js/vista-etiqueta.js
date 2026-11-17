// Muestra una parte de la etiqueta (frente, reverso o una mitad) a lo ancho de su caja, con las mismas letras del PDF.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { STRIP } from '../../src/template/geometry.js';

/** Zonas de la tira (px de la etiqueta). El medallón cuelga bajo el frente. */
export const ZONAS = {
  frente: (r) => ({ x0: STRIP.foldLeft - 1, x1: STRIP.tailEnd + 1, y0: 0, y1: Math.min(r.cut + 1, 152) }),
  reverso: (r) => ({ x0: r.freeEnd - 1, x1: STRIP.foldLeft + 1, y0: 0, y1: r.cut + 1 }),
  tira: (r) => ({ x0: r.freeEnd - 0.75, x1: STRIP.tailEnd + 0.75, y0: 0, y1: r.cut + 0.75 }),
  mitad1: (r) => ({ x0: r.freeEnd - 1, x1: 200, y0: 0, y1: r.cut + 1 }),
  mitad2: (r) => ({ x0: 186, x1: STRIP.foldLeft + 1, y0: 0, y1: r.cut + 1 }),
};

export function VistaEtiqueta({ vista, zona = 'frente', alt }) {
  const caja = useRef(null);
  const [ancho, setAncho] = useState(0);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setAncho(e.contentRect.width));
    ro.observe(caja.current);
    return () => ro.disconnect();
  }, []);
  const z = ZONAS[zona](vista.result);
  const s = ancho ? ancho / (z.x1 - z.x0) : 0;
  return html`<div ref=${caja} class="etq-escala" role="img" aria-label=${alt} style=${`height:${(z.y1 - z.y0) * s}px`}>
    ${s > 0 && html`<div class="etq-in" aria-hidden="true" style=${`transform:scale(${s}) translate(${-z.x0}px, ${-z.y0}px)`}
      dangerouslySetInnerHTML=${{ __html: vista.html }}></div>`}</div>`;
}
