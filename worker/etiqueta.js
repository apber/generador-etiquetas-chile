// Lo común del PDF de una etiqueta en el servidor (Cloudflare Worker y servidor local): revisa el pedido y arma la
// respuesta. La etiqueta vuelve con «@marca:archivo» en vez de cada imagen (la app pone las suyas): así pesa poco.

const MAX_IMAGEN = 600_000;   // caracteres de una imagen data: (los sellos oficiales pesan ≈ 350 000)

export class PedidoMalo extends Error {}

/** Del cuerpo del pedido a lo que necesita renderLabelPdf. */
export function prepararEtiqueta(cuerpo) {
  const { labelData, company, assets } = cuerpo ?? {};
  if (!labelData?.front || !labelData?.nutrition || !company) throw new PedidoMalo('Faltan los datos de la etiqueta.');
  if (labelData.incomplete) throw new PedidoMalo('La etiqueta está incompleta.');
  const img = (u) => {
    if (u == null) return undefined;
    if (typeof u !== 'string' || u.length > MAX_IMAGEN) throw new PedidoMalo('Imagen no válida.');
    if (!/^data:image\/(png|jpeg|svg\+xml|webp)[;,]/.test(u) && !/^<svg[\s>]/.test(u.trim())) throw new PedidoMalo('Imagen no válida.');
    return u;
  };
  const a = assets ?? {};
  const options = {
    assets: {
      logo: img(a.logo), signatureIcon: img(a.signatureIcon),
      seals: Object.fromEntries(Object.entries(a.seals ?? {}).map(([k, v]) => [k, img(v)])),
      icons: Object.fromEntries(Object.entries(a.icons ?? {}).map(([k, v]) => [k, img(v)])),
    },
  };
  return { labelData, company, options };
}

const base64 = (bytes) => {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Respuesta: { pdf (base64), html (con «@marca:archivo»), result }. */
export function devolverEtiqueta({ pdf, html, result }, cuerpo) {
  let h = html;
  const a = cuerpo.assets ?? {};
  const marca = cuerpo.marca ?? {};
  const pares = [['logo', a.logo], ['signatureIcon', a.signatureIcon],
    ...Object.entries(a.seals ?? {}).map(([k, v]) => [`seal:${k}`, v]), ...Object.entries(a.icons ?? {}).map(([k, v]) => [`icon:${k}`, v])];
  for (const [k, uri] of pares) {
    if (!uri || !uri.startsWith('data:') || !marca[k]) continue;
    h = h.split(uri.replace(/&/g, '&amp;')).join(`@marca:${marca[k]}`).split(uri).join(`@marca:${marca[k]}`);
  }
  const { cut, freeEnd, lengthMm, variant } = result;
  return { pdf: base64(pdf), html: h, result: { cut, freeEnd, lengthMm, variant } };
}
