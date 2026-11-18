// Colores del aro en la app (18-11-2026): la paleta de la empresa, los colores libres, un nombre para cada color
// (para leerlo sin depender del color) y el siguiente libre para un producto nuevo.
import { estado } from './datos/almacen.js';
import { freeRingColors, ringLetterColor, isHex, deltaE } from '../../src/ring-colors.js';

/** Paleta de la empresa (company.json → ring_palette), en mayúsculas. */
export const paleta = () => (estado.company?.ring_palette ?? []).filter(isHex).map((c) => c.toUpperCase());

/** Colores de la paleta que ningún producto usa, en el orden de la paleta. */
export const libres = (sinId = null) => freeRingColors(paleta(), [...estado.products.values()].filter((p) => p.id !== sinId));

/** Color para un producto nuevo: el primero libre (null si no queda ninguno: se usa el café de la marca). */
export const primerLibre = () => libres()[0] ?? null;

/** Productos que llevan color del aro: los que tienen etiqueta y los por completar (no los componentes). */
export const conAro = () => [...estado.products.values()]
  .filter((p) => p.type !== 'management_only' && p.status !== 'inactive')
  .sort((a, b) => a.product_name.localeCompare(b.product_name, 'es'));

/** Etiquetas impresas de un producto: { n, ultima } (fecha de la última impresión). */
export function impresasDe(id) {
  let n = 0, ultima = null;
  for (const r of estado.impresiones ?? []) {
    for (const it of r.items ?? []) if (it.id === id) { n += it.n ?? 0; if (!ultima || r.fecha > ultima) ultima = r.fecha; }
  }
  return { n, ultima };
}

// Nombres de referencia: el nombre de un color es el de la referencia más parecida (CIEDE2000)
const NOMBRES = [
  ['Rojo', '#D32F2F'], ['Rojo carmín', '#B0102C'], ['Rojo ladrillo', '#B23A12'], ['Burdeo', '#743431'], ['Vino', '#851C48'],
  ['Frambuesa', '#C2185B'], ['Fucsia', '#D81B7A'], ['Rosado', '#E96589'], ['Rosado claro', '#F8C3D2'], ['Rosa viejo', '#E8B4B3'],
  ['Malva', '#91657B'], ['Salmón', '#F08A70'], ['Coral', '#EE7A5E'], ['Durazno', '#FFC6A5'], ['Naranjo', '#F5821F'],
  ['Naranjo quemado', '#BD5B10'], ['Terracota', '#C1917C'], ['Café', '#7A4A1E'], ['Café oscuro', '#3A221A'], ['Chocolate', '#4B2A1A'], ['Café grisáceo', '#7D6355'],
  ['Caramelo', '#C58B45'], ['Café dorado', '#986A29'], ['Café rojizo', '#8A4A1C'], ['Café tabaco', '#514129'], ['Arena', '#E9BB77'], ['Beige', '#D9C9A8'], ['Gris café', '#AEA38E'], ['Mostaza', '#C3A12A'],
  ['Ámbar', '#FFC20E'], ['Amarillo', '#F2E116'], ['Amarillo claro', '#FFEB87'], ['Verde oliva', '#6B7A2A'], ['Verde oliva oscuro', '#2F3D0C'],
  ['Verde limón', '#A1C412'], ['Verde manzana', '#7CC36A'], ['Verde pistacho', '#D0EF95'], ['Verde', '#3C9A4A'], ['Verde oscuro', '#1F5A2E'], ['Verde grisáceo', '#849A7C'],
  ['Verde menta', '#A9D4B4'], ['Verde agua', '#6CC5C0'], ['Verde esmeralda', '#17A47D'], ['Turquesa', '#22A2BD'], ['Verde azulado', '#1F7A78'],
  ['Petróleo', '#0B3B37'], ['Azul petróleo', '#1F5F73'], ['Celeste', '#8EC9E8'], ['Azul', '#1A6FC0'], ['Azul mar', '#1A7DAE'], ['Azul marino', '#023559'],
  ['Azul lavanda', '#9DB4F0'], ['Lavanda', '#C9B3E6'], ['Lila', '#C278C9'], ['Violeta', '#7264C1'], ['Morado', '#7B3F8C'],
  ['Morado oscuro', '#341C74'], ['Berenjena', '#492246'], ['Azul grisáceo', '#4C4D78'], ['Gris lavanda', '#908EB0'], ['Gris', '#8A8A8A'],
  ['Gris azulado', '#5E6670'], ['Gris claro', '#C8C8C8'], ['Gris oscuro', '#454545'], ['Negro', '#1A1A1A'], ['Blanco', '#FAFAFA'],
];

/** Nombre aproximado de un color en palabras («Verde oscuro»), para no depender solo de verlo. */
export function nombreColor(hex) {
  let mejor = null, d = Infinity;
  for (const [n, c] of NOMBRES) { const x = deltaE(hex, c); if (x < d) { d = x; mejor = n; } }
  return mejor;
}

/** «Letra blanca» o «Letra café» según el color. */
export const letraDe = (hex) => (ringLetterColor(hex) === '#FFFFFF' ? 'blanca' : 'café');
