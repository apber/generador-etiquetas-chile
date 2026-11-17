// @font-face rules of the label with the fonts given as base64 (app/fonts: the same files in the app, in the
// server and in the tests). Arial: Arimo, made with the same measures, so the result does not depend on the
// computer having Arial (Cloudflare's browser and Android do not).

export function labelFontsCssFrom({ montserrat, robotoCondensed, arimo }) {
  const face = (family, b64, weight = '100 900') => `@font-face{font-family:${family};src:url(data:font/woff2;base64,${b64}) format("woff2");font-weight:${weight}}`;
  return face('Montserrat', montserrat) + face('"Roboto Condensed"', robotoCondensed)
    + face('Arial', arimo, '400 700') + face('Helvetica', arimo, '400 700');
}
