// Fonts of the label for rendering in Node (Playwright): Montserrat and Roboto Condensed (SIL Open Font
// License) from the Google Fonts repository, kept in a local cache folder (not in the repository).
// Arial: the system's Arial or a metric-compatible font (Liberation Sans on Linux).

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const FONTS_DIR = process.env.LABEL_FONTS_DIR ?? join(repoRoot, '.cache', 'fonts');

const FONTS = {
  'Montserrat.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf',
  'RobotoCondensed.ttf': 'https://raw.githubusercontent.com/google/fonts/main/ofl/robotocondensed/RobotoCondensed%5Bwght%5D.ttf',
};

/** Downloads the fonts if they are missing and returns the @font-face rules (file:// addresses). */
export async function labelFontsCss(dir = FONTS_DIR) {
  mkdirSync(dir, { recursive: true });
  for (const [name, url] of Object.entries(FONTS)) {
    const path = join(dir, name);
    if (existsSync(path)) continue;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not download ${name}: HTTP ${res.status}`);
    writeFileSync(path, Buffer.from(await res.arrayBuffer()));
  }
  const url = (n) => pathToFileURL(join(dir, n)).href;
  return `@font-face{font-family:"Roboto Condensed";src:url("${url('RobotoCondensed.ttf')}");font-weight:100 900}`
    + `@font-face{font-family:Montserrat;src:url("${url('Montserrat.ttf')}");font-weight:100 900}`;
}
