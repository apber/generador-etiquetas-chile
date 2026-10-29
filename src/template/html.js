// Small HTML helpers for the template.

export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** An icon given as inline SVG markup or as an image address, drawn at `size` px. */
export function icon(src, size = 8, inline = false) {
  const extra = inline ? '; display: inline-block; vertical-align: -1.3px' : '';
  if (!src) return `<span style="flex: none; display: inline-block; width: ${size}px; height: ${size}px${inline ? '; vertical-align: -1.3px' : ''}"></span>`;
  if (src.trim().startsWith('<svg')) {
    return src.trim().replace(/^<svg\b([^>]*?)(\sstyle="[^"]*")?([^>]*)>/, (m, a, st, b) => `<svg${a}${b} style="flex: none${extra}">`);
  }
  return `<img src="${esc(src)}" alt="" style="flex: none${extra}; width: ${size}px; height: ${size}px">`;
}
