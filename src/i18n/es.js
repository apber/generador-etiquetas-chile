// Spanish texts of the label and of the alerts.
// message: short text for the person who prints (one problem, one action).
// detail: explanation for the review view.

export const NUTRIENT_LABELS = {
  energy_kcal: 'Energía (kcal)',
  protein_g: 'Proteínas (g)',
  total_fat_g: 'Grasas totales (g)',
  saturated_fat_g: 'Grasas saturadas (g)',
  monounsaturated_fat_g: 'Grasas monoinsat. (g)',
  polyunsaturated_fat_g: 'Grasas poliinsat. (g)',
  trans_fat_g: 'Grasas trans (g)',
  cholesterol_mg: 'Colesterol (mg)',
  available_carbohydrates_g: 'H. de C. disponibles (g)',
  total_sugars_g: 'Azúcares totales (g)',
  dietary_fiber_g: 'Fibra dietética (g)',
  sodium_mg: 'Sodio (mg)',
};

/** Short nutrient names for messages. */
const N = {
  energy_kcal: 'energía', protein_g: 'proteínas', total_fat_g: 'grasas totales',
  saturated_fat_g: 'grasas saturadas', monounsaturated_fat_g: 'grasas monoinsaturadas',
  polyunsaturated_fat_g: 'grasas poliinsaturadas', trans_fat_g: 'grasas trans',
  cholesterol_mg: 'colesterol', available_carbohydrates_g: 'H. de C. disponibles',
  total_sugars_g: 'azúcares totales', dietary_fiber_g: 'fibra dietética', sodium_mg: 'sodio',
};
export const nutrientName = (key) => N[key] ?? key;

export const SEAL_NAMES = {
  energy: 'ALTO EN CALORÍAS',
  sugars: 'ALTO EN AZÚCARES',
  saturated_fat: 'ALTO EN GRASAS SATURADAS',
  sodium: 'ALTO EN SODIO',
};

/** What was not added, per seal, for the 'over the limit but no seal' note. */
const NOT_ADDED = { energy: 'azúcar ni grasa', sugars: 'azúcar', saturated_fat: 'grasa', sodium: 'sal' };

const ADDED = { sugar: 'azúcar', fat: 'grasa o aceite', sodium: 'sal o sodio' };

export const LABEL_TEXT = {
  serving: (measure, g) => `Porción: ${measure} (${g} g)`,
  servingsPerPackage: (text) => `Porciones por envase: ${text}`,
  edibleNote: 'Valores por 100 g de parte comestible (sin cáscara)',
  packedBy: 'ENVASADO POR:',
  madeAndPackedIn: (country) => `ELABORADO Y ENVASADO EN ${country.toUpperCase()} POR:`,
  madeAndPackedBy: 'ELABORADO Y ENVASADO POR:',
  origin: 'ORIGEN:',
  originOfIngredients: 'ORIGEN DE LOS INGREDIENTES:',
  contains: 'CONTIENE:',
  mayContain: 'PUEDE CONTENER:',
  ingredients: 'INGREDIENTES:',
  netWeight: (text) => `PESO NETO: ${text}`,
};

const list = (items) => items.join(', ');
const comp = (p) => (p.component ? ` (en ${p.componentName})` : '');

/**
 * Texts per alert code. Codes may carry a suffix after ':' (e.g. missing_nutrient:sodium_mg);
 * the base code chooses the text.
 */
export const ALERT_TEXTS = {
  missing_origin: {
    message: (p) => `Falta el país de origen${comp(p)}. Pídalo al proveedor.`,
    detail: () => 'El país de origen es obligatorio (RSA art. 107 d). Envasar no cambia el origen: vale el del proveedor.',
  },
  missing_ingredients: {
    message: (p) => `Falta la lista de ingredientes${comp(p)}. Suba una foto de la bolsa.`,
    detail: () => 'La lista de ingredientes es obligatoria (RSA art. 107 g).',
  },
  missing_contains: {
    message: (p) => `Falta saber qué alérgenos tiene${comp(p)}. Revise la bolsa del proveedor.`,
    detail: () => 'CONTIENE es obligatorio cuando hay alérgenos (RSA art. 107 h; Res. 427/2010).',
  },
  missing_may_contain: {
    message: (p) => `El proveedor no dice qué alérgenos puede contener${comp(p)}. Revise la bolsa.`,
    detail: () => 'PUEDE CONTENER se declara cuando hay riesgo de contaminación cruzada (RSA art. 107 h). Si el proveedor no lo informa, se imprime sin esa línea.',
  },
  missing_nutrient: {
    message: (p) => `Falta el dato de ${nutrientName(p.key)}${comp(p)} en la tabla. Suba otra foto de la tabla.`,
    detail: (p) => p.mandatoryBecauseFat
      ? 'El desglose de grasas y el colesterol son obligatorios porque la porción tiene 3 g de grasa o más (RSA art. 115).'
      : 'Dato obligatorio de la tabla nutricional (RSA art. 115).',
  },
  missing_serving: {
    message: () => 'Falta la porción. Escriba la porción del proveedor.',
    detail: () => 'La porción en gramos y en medida casera es obligatoria (RSA art. 115).',
  },
  missing_edible_part: {
    message: () => 'Falta pesar la parte comestible. Pese 100 g con cáscara, pélelos y anote cuánto pesa lo comestible.',
    detail: () => 'Los valores son por parte comestible; las porciones por envase deben contarse sobre lo comestible. Sin ese dato se cuentan sobre el peso con cáscara (da más porciones de las reales).',
  },
  missing_component: {
    message: (p) => `Falta la ficha de ${p.componentId}. Créela antes de imprimir esta mezcla.`,
    detail: () => 'Una mezcla se calcula con las fichas de sus ingredientes.',
  },
  missing_ring_color: {
    message: () => 'Falta elegir el color del aro. Se usará el color de ejemplo.',
    detail: () => 'No es un dato obligatorio por norma.',
  },
  missing_barcode: {
    message: () => 'Esta presentación no tiene código de barras.',
    detail: () => 'El código de barras no es obligatorio por norma; lo piden los comercios.',
  },
  seal_unknown: {
    message: (p) => `No se puede saber si lleva el sello ${SEAL_NAMES[p.seal]}: falta el dato de ${nutrientName(p.nutrient)}.`,
    detail: (p) => `Se agregó ${list(p.addedBy)}, así que hay que evaluar ${SEAL_NAMES[p.seal]} (RSA art. 120 bis).`,
  },
  inconsistent_energy: {
    message: (p) => `Los números de la tabla no cuadran${comp(p)}. Suba otra foto de la tabla.`,
    detail: (p) => `Energía declarada ${p.declared} kcal; calculada (4·P + 4·HdC + 9·G) ${p.calculated} kcal (${String(p.difference_pct).replace('.', ',')} %). Tolerancia: 10 %.`,
  },
  inconsistent_fat_parts: {
    message: (p) => `Los números de las grasas no cuadran${comp(p)}. Suba otra foto de la tabla.`,
    detail: (p) => `Saturadas + mono + poli + trans = ${p.parts} g, más que las grasas totales (${p.total} g).`,
  },
  inconsistent_fat_parts_low: {
    message: (p) => `Revise las grasas de la tabla${comp(p)}: parecen incompletas.`,
    detail: (p) => `Saturadas + mono + poli + trans = ${p.parts} g de ${p.total} g de grasas totales (menos del 80 %). Puede ser una fila mal leída.`,
  },
  inconsistent_sugars: {
    message: (p) => `Los azúcares no cuadran${comp(p)}. Suba otra foto de la tabla.`,
    detail: (p) => `Azúcares (${p.sugars} g) mayores que los H. de C. disponibles (${p.carbohydrates} g).`,
  },
  inconsistent_over_100g: {
    message: (p) => `Los números de la tabla no cuadran${comp(p)}. Suba otra foto de la tabla.`,
    detail: (p) => `Proteínas + grasas + H. de C. + fibra = ${p.grams} g en 100 g.`,
  },
  inconsistent_ingredients_format: {
    message: (p) => `Revise cómo quedó escrita la lista de ingredientes${comp(p)}.`,
    detail: () => 'Paréntesis o llaves { } sin cerrar en la lista de ingredientes.',
  },
  reference_data: {
    message: (p) => `Hay datos de referencia${comp(p)}, no del proveedor. Cuando tenga la bolsa, suba una foto.`,
    detail: (p) => `Fuente nivel ${p.level} (${p.from}): ${list(p.fields)}.`,
  },
  claim_health: {
    message: (p) => `Con sellos no se puede decir "${p.text}". Cambie ese texto.`,
    detail: () => 'Con sellos ALTO EN no se permiten descriptores saludables (Ley 20.606; RSA art. 120 bis).',
  },
  claim_no_sugar_added: {
    message: (p) => `No puede decir "sin azúcar" ("${p.text}"): el producto lleva azúcar o jarabe.`,
    detail: () => '"Sin azúcar" no se puede usar si se agregaron azúcares o jarabes (RSA art. 120).',
  },
  claim_no_sugar_natural: {
    message: (p) => `"${p.text}": el producto tiene azúcar natural. Diga "sin azúcar añadida".`,
    detail: () => '"Libre de azúcar" exige menos de 0,5 g de azúcares por porción (RSA art. 120, lectura estricta).',
  },
  claim_no_added_sugar_false: {
    message: (p) => `"${p.text}" no es cierto: el producto lleva azúcar o jarabe añadidos.`,
    detail: () => 'Declaración falsa (Ley 19.496; RSA art. 120).',
  },
  claim_no_salt_false: {
    message: (p) => `"${p.text}" no es cierto: el producto lleva sal.`,
    detail: () => 'Declaración falsa (Ley 19.496; RSA art. 120).',
  },
  claim_same_nutrient: {
    message: (p) => `Con el sello ${SEAL_NAMES[p.seal]} no se puede decir "${p.text}".`,
    detail: () => 'Con un sello ALTO EN no se permiten descriptores nutricionales del mismo nutriente (Manual MINSAL 2017).',
  },
  seal_removed: {
    message: (p) => `Se quitó el sello ${SEAL_NAMES[p.seal]} por decisión de Aukan.`,
    detail: (p) => `Corresponde por norma (se agregó ${list(p.addedBy)}; ${nutrientName(p.nutrient)} ${p.value} > ${p.limit}). Decisión registrada el ${p.date}.`,
  },
  over_limit_not_added: {
    message: () => '',
    detail: (p) => `${nutrientName(p.nutrient)}: ${p.value} supera el límite de ${p.limit}, pero no lleva ${SEAL_NAMES[p.seal]} porque no se agregó ${NOT_ADDED[p.seal]} (RSA art. 120 bis).`,
  },
  fiber_omitted: {
    message: () => '',
    detail: (p) => `La fibra no se declara: falta en ${list(p.components)}.`,
  },
  assumed_zero: {
    message: () => '',
    detail: (p) => `${nutrientName(p.key)}: se cuenta 0 para ${list(p.components)} (tiene 0,5 g de grasa o menos por 100 g y no informa el dato).`,
  },
  component_storage: {
    message: () => '',
    detail: (p) => `${p.componentName} tiene conservación especial: "${p.storage}". Revise si la mezcla también la necesita.`,
  },
  serving_exceeds_package: {
    message: () => '',
    detail: (p) => `La porción (${p.serving} g) es mayor que el contenido (${p.content} g).`,
  },
  inactive: {
    message: () => 'Este producto está marcado como "no se vende".',
    detail: () => '',
  },
};

export { ADDED as ADDED_NAMES };
