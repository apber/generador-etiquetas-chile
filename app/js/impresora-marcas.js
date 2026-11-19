// Marcas de impresora y de teléfono para la guía «Preparar este teléfono para imprimir» (18-11-2026). Sin dependencias,
// para probarlo con node --test (test/impresora-marcas.test.js).

/**
 * Complemento de impresión de Android de cada marca de impresora (servicio que hace aparecer la impresora en la ventana
 * de imprimir). paquete: identificador en Play Store, verificado el 18-11-2026.
 */
export const MARCAS_IMPRESORA = {
  epson: { nombre: 'Epson', complemento: 'Epson Print Enabler', paquete: 'com.epson.mobilephone.android.epsonprintserviceplugin' },
  hp: { nombre: 'HP', complemento: 'HP Print Service Plugin', paquete: 'com.hp.android.printservice' },
  canon: { nombre: 'Canon', complemento: 'Canon Print Service', paquete: 'jp.co.canon.android.printservice.plugin' },
};

/** Marca de impresora guardada en app.json («marcaImpresora»): un id de MARCAS_IMPRESORA, 'otra' o null (sin elegir). */
export function marcaImpresoraDe(app) {
  const m = String(app?.marcaImpresora ?? '').trim().toLowerCase();
  if (!m) return null;
  return MARCAS_IMPRESORA[m] ? m : 'otra';
}

export const enlacePlayStore = (paquete) => `https://play.google.com/store/apps/details?id=${encodeURIComponent(paquete)}`;

/**
 * Marca del teléfono desde su modelo (Chrome en Android lo entrega con navigator.userAgentData) o, si no, desde el
 * texto del navegador. Devuelve 'samsung', 'xiaomi' (también Redmi y POCO) o null si no se reconoce.
 */
export function marcaDeModelo(modelo = '', agente = '') {
  const m = String(modelo).trim();
  if (/^SM-|samsung|galaxy/i.test(m)) return 'samsung';
  // Xiaomi: nombres comerciales o números de modelo como 2201117TG, 23129RAA4G o M2101K6G
  if (/xiaomi|redmi|poco|^mi\s|^M\d{4}[A-Z]\d|^\d{4,5}[A-Z0-9]{3,8}$/i.test(m)) return 'xiaomi';
  const a = String(agente);
  if (/\bSM-[A-Z0-9]+|samsung/i.test(a)) return 'samsung';
  if (/xiaomi|redmi|\bpoco\b|\bMi \d/i.test(a)) return 'xiaomi';
  return null;
}
