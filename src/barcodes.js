// Barcodes: each code belongs to one presentation (product + net weight).

import { isValidEan13 } from './ean13.js';

/** Map number -> { productId, net_weight_g } of the codes already assigned. */
export function barcodeUsage(products) {
  const used = new Map();
  for (const p of products.values()) {
    for (const pr of p.presentations ?? []) {
      if (pr.barcode) used.set(pr.barcode, { productId: p.id, net_weight_g: pr.net_weight_g });
    }
  }
  return used;
}

/** First valid code of the company's own list that no presentation uses yet; null if none is left. */
export function nextFreeBarcode(company, products) {
  const used = barcodeUsage(products);
  const free = (company.barcodes ?? []).find((c) => c.source === 'own' && !used.has(c.number) && isValidEan13(c.number));
  return free ? free.number : null;
}
