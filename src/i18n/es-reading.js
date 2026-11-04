// Spanish texts of the photo reading (stage 7e).
// message: one problem, one action, for the person who loads the product (simple words).
// detail: explanation for the review view.

import { nutrientName } from './es.js';

const IMAGE_PROBLEMS = {
  glare: 'reflejo', blurry: 'borrosa', cut_off: 'cortada', too_far: 'muy lejos',
  tilted: 'inclinada', dark: 'oscura', covered: 'tapada',
};
const STATUS = {
  doubtful: 'no se lee bien', mismatch: 'no calza con la columna por porción',
};
const fmt = (x) => String(x).replace('.', ',');

/**
 * action: retake (otra foto) | review (revisar a mano) | confirm (confirmar) | fallback (completar con respaldo) | none.
 * Nothing stops saving (user, 04-11-2026): each alert says what is missing or doubtful and recommends a way to check it
 * (another photo or a screenshot, a web search, comparing with the bag); missing information only says how the label comes out.
 */
export const READING_ALERTS = {
  fallback_model: {
    action: 'review',
    message: (p) => (p.reason === 'quota'
      ? 'Se leyó con el lector rápido (hoy se acabaron las lecturas normales), que se equivoca más. Conviene comparar los datos con la bolsa o leerla de nuevo mañana.'
      : 'Se leyó con el lector rápido (el normal estaba ocupado), que se equivoca más. Conviene comparar los datos con la bolsa o leerla de nuevo en un rato.'),
    detail: (p) => `Modelo de respaldo: ${p.model}. Causa: ${{ quota: 'cuota del día agotada', overloaded: 'servicio ocupado', timeout: 'no respondió a tiempo' }[p.reason] ?? p.reason}.`,
  },
  photo_unusable: {
    action: 'retake',
    message: (p) => `La foto ${p.index} ${p.reason}. Conviene sacar otra con buena luz, de frente y de cerca.`,
    detail: (p) => p.detail ?? '',
  },
  no_table: {
    action: 'retake',
    message: () => 'No encontré la tabla nutricional. Conviene una foto de la tabla o una captura de la página del proveedor.',
    detail: () => 'Sin tabla no se puede armar la ficha (RSA art. 115).',
  },
  no_serving: {
    action: 'review',
    message: () => 'No encontré la porción. Conviene una foto de la línea de la porción, o escribir los gramos y la medida casera.',
    detail: () => 'La porción en gramos y en medida casera es obligatoria (RSA art. 115).',
  },
  serving_doubtful: {
    action: 'confirm',
    message: (p) => (p.text ? `Confirme la porción: «${p.text}».` : `Confirme la porción: ${fmt(p.g ?? '?')} g.`),
    detail: () => 'La línea de la porción no se leyó con total claridad.',
  },
  serving_differs: {
    action: 'confirm',
    message: (p) => `Confirme la porción: ${fmt(p.printed)} g.`,
    detail: (p) => `La IA leyó ${fmt(p.read)} g, pero la línea impresa dice ${fmt(p.printed)} g. Se usa la impresa.`,
  },
  header_not_100: {
    action: 'review',
    message: () => 'La primera columna de la tabla no dice «100 g». Conviene compararla a la vista con la bolsa.',
    detail: (p) => `Encabezado leído: «${p.header}». Los valores deben ser por 100 g.`,
  },
  unit_unknown: {
    action: 'review',
    message: (p) => `No reconozco la unidad de «${p.label}». Conviene compararla a la vista con la bolsa.`,
    detail: (p) => `Unidad leída: «${p.unit}».`,
  },
  unit_doubtful: {
    action: 'review',
    message: (p) => `${cap(nutrientName(p.key))}: la tabla dice «${p.text ?? '?'}» en ${p.from} por 100 g, que serían ${fmt(p.value)} ${p.to}: no es posible. Lo más probable es que sean ${p.to}; mientras tanto el dato no se usa. Conviene compararlo a la vista con la bolsa.`,
    detail: () => 'Unidad impresa dudosa: el valor no se usa hasta revisarlo.',
  },
  unit_converted: {
    action: 'none',
    message: () => '',
    detail: (p) => `${nutrientName(p.key)}: venía en ${p.from}, se pasó a ${p.to}.`,
  },
  row_repeated: {
    action: 'review',
    message: (p) => `«${p.label}» aparece dos veces en la tabla; se usó la primera. Conviene compararla a la vista con la bolsa.`,
    detail: () => '',
  },
  serving_column_other_weight: {
    action: 'confirm',
    message: (p) => `La columna por porción del proveedor está calculada para ${fmt(p.computed)} g, no para ${fmt(p.declared)} g. Se usan los valores por 100 g; confirme la porción.`,
    detail: () => 'Todos los valores por porción están en la misma proporción con los de 100 g, pero esa proporción no es la porción declarada. Los valores por porción de la etiqueta se recalculan desde los de 100 g.',
  },
  columns_disagree_no_serving: {
    action: 'retake',
    message: () => 'Los números de la tabla no calzan entre sí. Conviene otra foto de la tabla, de cerca y con buena luz, o una captura de la página del proveedor.',
    detail: () => 'La tabla no dice la porción y los valores por porción no guardan una misma proporción con los de 100 g: la lectura no es confiable.',
  },
  serving_inferred: {
    action: 'confirm',
    message: (p) => `La tabla no dice los gramos de la porción; por sus números son ${fmt(p.g)} g. Confirme.`,
    detail: () => 'Calculado con la proporción entre la columna por porción y la de 100 g.',
  },
  energy_from_kj: {
    action: 'confirm',
    message: (p) => `La energía venía solo en kJ (${fmt(p.kj)}). Se pasó a kcal; confirme.`,
    detail: () => '1 kcal = 4,184 kJ.',
  },
  sodium_from_salt: {
    action: 'confirm',
    message: (p) => `El proveedor da sal (${fmt(p.salt)} g), no sodio. Se calculó el sodio; confirme.`,
    detail: () => 'Sodio (mg) = sal (g) × 400.',
  },
  carbs_total_converted: {
    action: 'confirm',
    message: () => 'El proveedor da los H. de C. totales. Se restó la fibra para tener los disponibles; confirme.',
    detail: (p) => `H. de C. disponibles = ${fmt(p.total)} − ${fmt(p.fiber)} (fibra).`,
  },
  carbs_total_no_fiber: {
    action: 'fallback',
    message: () => 'El proveedor da los H. de C. totales y no la fibra. Se puede «Completar automáticamente» (busca en internet) o «Escribir el dato».',
    detail: () => 'La etiqueta chilena declara H. de C. disponibles (totales − fibra). Completar con una tabla reconocida del mismo alimento.',
  },
  carbs_unspecified: {
    action: 'confirm',
    message: (p) => `La tabla dice «${p.label}» sin aclarar si son disponibles. Confirme que no incluyen la fibra.`,
    detail: () => 'Se tomaron como disponibles, tal como están impresos.',
  },
  carbs_maybe_total: {
    action: 'review',
    message: () => 'Los H. de C. podrían ser los totales (con fibra). Conviene buscar la ficha del proveedor en internet o compararlo con un producto igual.',
    detail: (p) => `Energía declarada ${p.declared} kcal; con los H. de C. impresos da ${p.asPrinted} kcal y restando la fibra ${p.minusFiber} kcal. Se dejó el valor impreso.`,
  },
  no_household_measure: {
    action: 'review',
    message: (p) => `Falta la medida casera de la porción de ${fmt(p.g)} g (p. ej. «¼ taza» o «5 unidades»). Se puede «Completar automáticamente» o «Escribir el dato».`,
    detail: () => 'La porción se declara en gramos y en medida casera (RSA art. 115).',
  },
  row_missing: {
    action: 'fallback',
    message: (p) => `No encontré ${listY(p.keys.map(nutrientName))} en la tabla. Si la foto corta la tabla, conviene otra; si el proveedor no lo informa, se puede «Completar automáticamente» (busca en internet) o «Escribir el dato».`,
    detail: (p) => (p.becauseFat.length
      ? `${cap(listY(p.becauseFat.map(nutrientName)))}: obligatorio porque la porción tiene 3 g de grasa o más (RSA art. 115). `
      : '') + 'Dato obligatorio de la tabla (RSA art. 115). «Completar automáticamente» busca el dato en internet (tabla reconocida del mismo alimento como USDA, consenso de varias marcas o el mismo fabricante en otro país) o lo calcula; queda marcado como dato de referencia.',
  },
  no_serving_column: {
    action: 'none',
    message: () => '',
    detail: () => 'La tabla no trae columna por porción: los valores por 100 g no se pudieron comparar con otra columna. Quedan revisados solo con los chequeos de la tabla.',
  },
  value_doubtful: {
    action: 'retake',
    message: (p) => `No se lee bien: ${listY(p.keys.map(nutrientName))}. Conviene otra foto de la tabla, de frente y sin reflejo, o compararlo a la vista con la bolsa.`,
    detail: (p) => p.items.map((i) => `${nutrientName(i.key)}: por 100 g «${i.text100 ?? '—'}», por porción «${i.textServing ?? '—'}»`).join('. '),
  },
  value_mismatch: {
    action: 'retake',
    message: (p) => `${cap(listY(p.keys.map(nutrientName)))}: no calza entre las dos columnas. Conviene otra foto de la tabla o compararlo a la vista con la bolsa.`,
    detail: (p) => p.items.map((i) => `${nutrientName(i.key)}: «${i.text100}» × ${fmt(i.servingG)} / 100 = ${fmt(i.expected)}; por porción dice «${i.textServing}»`).join('. '),
  },
  value_derived: {
    action: 'confirm',
    message: (p) => `No se lee bien por 100 g: ${listY(p.keys.map(nutrientName))}. Se calculó desde la porción; confirme.`,
    detail: (p) => p.items.map((i) => `${nutrientName(i.key)}: «${i.textServing}» × 100 / ${fmt(i.servingG)} = ${fmt(i.value)}`).join('. ') + '. El redondeo del proveedor puede dar una pequeña diferencia.',
  },

  table_check: {
    action: 'retake',
    message: () => 'Los números de la tabla no cuadran. Conviene otra foto de la tabla o compararla a la vista con la bolsa.',
    detail: (p) => p.text,
  },
  no_ingredients: {
    action: 'retake',
    message: () => 'No encontré la lista de ingredientes. Conviene una foto de los ingredientes o una captura de la página del proveedor.',
    detail: () => 'La lista de ingredientes es obligatoria (RSA art. 107 g).',
  },
  ingredients_doubtful: {
    action: 'review',
    message: () => 'Hay partes de la lista de ingredientes que no se leen bien. Conviene una foto de cerca o compararla a la vista con la bolsa.',
    detail: (p) => `Leído: «${p.text}».`,
  },
  contains_added_from_ingredients: {
    action: 'confirm',
    message: (p) => `Los ingredientes traen ${p.names} y el proveedor no lo puso en «Contiene». Se agregó; confirme.`,
    detail: () => 'CONTIENE = alérgenos presentes como ingredientes, también dentro de un ingrediente (RSA art. 107 h).',
  },
  contains_from_ingredients: {
    action: 'confirm',
    message: (p) => `El proveedor no dice «Contiene». Por los ingredientes, contiene ${p.names}; confirme.`,
    detail: () => 'Tomado de la lista de ingredientes.',
  },
  allergen_unknown: {
    action: 'retake',
    message: (p) => `No reconozco «${p.phrase}» como alérgeno. Conviene una foto de cerca de esa frase; si dice eso, compararla a la vista.`,
    detail: (p) => `En: «${p.statement}».`,
  },
  allergen_statement_doubtful: {
    action: 'retake',
    message: () => 'La frase de alérgenos no se lee bien. Conviene una foto de cerca de solo esa frase.',
    detail: (p) => `Leído: «${p.statement}». ` + (p.repeated.length ? `Se repite: ${p.repeated.join(', ')} (puede ser otra palabra mal leída). ` : '') + 'La letra de los alérgenos suele ser muy chica; una palabra mal leída cambia PUEDE CONTENER. Si la foto de cerca tampoco se lee, revisarla a mano con la bolsa.',
  },
  may_contain_from_statement: {
    action: 'confirm',
    message: (p) => `«Puede contener» sale de la frase del proveedor «${p.statement}». Confirme.`,
    detail: () => 'Líneas compartidas = riesgo de contaminación cruzada (PUEDE CONTENER, RSA art. 107 h).',
  },
  no_may_contain: {
    action: 'review',
    message: () => 'El proveedor no dice qué alérgenos puede contener: la etiqueta sale sin la línea PUEDE CONTENER.',
    detail: () => 'Si el proveedor no lo informa, la etiqueta sale sin la línea PUEDE CONTENER.',
  },
  no_origin: {
    action: 'review',
    message: () => 'No encontré el país de origen: la etiqueta sale sin la línea ORIGEN. Si está en otra parte de la bolsa o en la página del proveedor, una foto o captura lo agrega.',
    detail: () => 'El país de origen es obligatorio (RSA art. 107 d). Envasar no cambia el origen.',
  },
  origin_not_explicit: {
    action: 'review',
    message: (p) => `El proveedor no dice el país de origen; solo da una dirección (${p.text}). La etiqueta sale sin la línea ORIGEN.`,
    detail: () => 'Una dirección no es el país de origen: debe decirlo la etiqueta o el proveedor.',
  },
  in_shell: {
    action: 'review',
    message: () => 'Producto con cáscara: para la tabla hace falta pesar 100 g con cáscara, pelarlos y anotar cuánto pesa lo comestible.',
    detail: () => 'La tabla se declara por parte comestible y las porciones por envase se cuentan sobre lo comestible.',
  },
  supplier_claims: {
    action: 'none',
    message: () => '',
    detail: (p) => `El envase del proveedor dice: ${p.claims.map((c) => `«${c}»`).join(', ')}. No se copia a la etiqueta sin respaldo.`,
  },
  seals_differ: {
    action: 'review',
    message: (p) => `El envase del proveedor trae sellos distintos a los calculados (${p.supplier} / ${p.computed}). Conviene revisar lo añadido.`,
    detail: () => 'Los sellos se calculan con la tabla y lo añadido (RSA art. 120 bis); si difieren del proveedor, puede faltar o sobrar un ingrediente añadido.',
  },
  image_problems: {
    action: 'none',
    message: () => '',
    detail: (p) => p.list.map((i) => `Foto ${i.index}: ${i.problems.map((x) => IMAGE_PROBLEMS[x] ?? x).join(', ')}`).join('. '),
  },
  remarks: {
    action: 'none',
    message: (p) => `Nota de la lectura: ${p.text}`,
    detail: () => '',
  },
};

const cap = (s) => s[0].toUpperCase() + s.slice(1);
const listY = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);
