// The label fonts of the app (app/fonts) as @font-face rules with data: addresses, for Node (Playwright).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { labelFontsCssFrom } from '../render/fonts-css.js';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'fonts');
const b64 = (n) => readFileSync(join(dir, n)).toString('base64');

export const appLabelFontsCss = () => labelFontsCssFrom({
  montserrat: b64('montserrat.woff2'), robotoCondensed: b64('roboto-condensed.woff2'), arimo: b64('arimo.woff2'),
});
