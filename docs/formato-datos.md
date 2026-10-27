# Formato de los datos / Data format

Los datos de cada empresa viven en su propia carpeta (en producción, en OneDrive), fuera de este repositorio:

```
<carpeta de la empresa>/
  company.json          datos fijos: envasador, resolución sanitaria, eslogan, redes, códigos de barras
  products/
    <id>.json           una ficha por producto (el nombre del archivo es el id)
```

Esquemas: [`schema/company.schema.json`](../schema/company.schema.json) y [`schema/product.schema.json`](../schema/product.schema.json). Ejemplo completo con una marca ficticia: [`demo/`](../demo).

Para revisar una carpeta: `npm run validate -- <carpeta>` (sin carpeta, revisa `demo/`).

**Idioma:** las claves de los archivos y el código están en inglés. La interfaz y la etiqueta están en español; el catálogo de alérgenos trae los nombres en español e inglés.

## Regla general

La ficha guarda **solo lo que se escribe o se lee del proveedor**. Todo lo derivado se calcula al generar la etiqueta y no se guarda: valores por porción, porciones por envase, sellos ALTO EN, eslogan, texto de envasador y origen, chequeos y alertas.

## Tipos de producto (`type`)

| Valor | Qué guarda |
|---|---|
| `simple` | Composición y nutrición por 100 g propias, con sus fuentes. |
| `mix` | Una receta con productos simples y gramos por 100 g (suma 100). Ingredientes, alérgenos, añadidos, origen y nutrición salen de las fichas de los componentes. |
| `management_only` | Solo nombre y presentaciones con su código (productos sin etiqueta del sistema). |

## Claves y su nombre en la etiqueta

| Clave | Parte de la etiqueta / significado |
|---|---|
| `product_name` | Nombre del producto (arco inferior del medallón) |
| `description` | Descripción: nombre del alimento (RSA art. 107 a), hasta 3 líneas |
| `highlight` | Destacado, opcional; normalmente 1–2 líneas, 3 si hace falta (se revisa que quepa) |
| `ring_color` | Color del aro (hexadecimal o `null`) |
| `status` | `active` (se vende) / `inactive` (no se vende) |
| `presentations[]` | Presentaciones: `net_weight_g` (peso neto), `container` (envase), `barcode` (EAN-13 de esa presentación), `barcode_source` (`own` propio / `third_party` entregado por otra entidad) |
| `composition.ingredients` | Ingredientes, en el orden del proveedor; alérgenos entre llaves `{maní}` (se imprimen en negrita) |
| `composition.name_as_ingredient` | Nombre como ingrediente (lo usan las mezclas) |
| `composition.contains` | Contiene: ids del catálogo [`data/allergens.json`](../data/allergens.json); `null` = dato faltante, `[]` = no hay |
| `composition.may_contain` | Puede contener: igual que `contains`; lo que está en `contains` se quita solo |
| `composition.added` | Lo añadido: `sugar` (azúcar), `fat` (grasa), `sodium` (sodio), con el ingrediente que lo trae; define qué sellos se evalúan |
| `composition.country_of_origin` | País de origen (`null` = faltante) |
| `composition.in_shell` | Con cáscara: la tabla es por parte comestible y lleva leyenda |
| `composition.edible_g_per_100g` | Con cáscara: gramos de parte comestible en 100 g del producto como se vende (se pesa una vez); las porciones por envase se cuentan sobre lo comestible |
| `composition.storage` | Conservación (`null` = texto por defecto de la empresa) |
| `composition.usage_instructions` | Instrucciones de uso (opcional) |
| `composition.extra_text` | Texto adicional (opcional) |
| `composition.supplier_shelf_life` | Duración según el proveedor (no se imprime) |
| `recipe.components[]` | Receta de una mezcla: `product`, `g_per_100g`, `alternatives` |
| `nutrition.serving` | Porción: `g` y `household_measure` (medida casera) |
| `nutrition.per_100g` | Tabla por 100 g; cada valor con su `source`. Si falta un dato, la clave no se incluye |
| `confirmed_alerts[]` | Decisiones del usuario sobre alertas: `alert` (código), `decision`, `date`, `note`. Con una decisión, la alerta deja de frenar la impresión pero sigue a la vista. Quitar un sello que corresponde: `alert` = `remove_seal:<sello>` y `decision` = `remove_seal` |
| `sources[]` | Fuentes: `level` 1 proveedor, 2 etiqueta anterior coherente, 3 tabla reconocida, 4 referencia de mercado; `kind`, `from`, `date`, `files` |

En `company.json`: `brand` (marca), `packer` (envasador), `health_permit` (resolución sanitaria), `slogan` (eslogan sin y con sellos), `default_storage` (conservación por defecto), `follow_us` (Síguenos), `barcodes` (códigos de la empresa).

## Alérgeno genérico de frutos de cáscara

El id `tree_nuts` se imprime como "otros frutos de cáscara" si el producto contiene algún fruto de cáscara (p. ej. almendras) y como "frutos de cáscara" si no (p. ej. pasas).

## Cálculos

Código: [`src/label-data.js`](../src/label-data.js) arma todo lo que necesita la etiqueta a partir de la ficha. Para revisar una carpeta en texto: `npm run label -- <carpeta> [id] [--variant componente=alternativa]`.

| Qué | Regla | Código |
|---|---|---|
| Redondeo de la tabla | RSA art. 115: desde 100, entero; de 1 a menos de 100, 1 decimal; bajo 1, hasta 2 decimales (sin ceros sobrantes). Si el dígito que se descarta es 5 o más, sube. El rango se vuelve a elegir después de redondear (99,96 → 100) | `src/rounding.js` |
| Porción | La del proveedor; los valores por porción se calculan desde los de 100 g y se redondean aparte | `src/nutrients.js` |
| Porciones por envase | Entero con redondeo normal, nunca menos de 1. Por defecto "aprox." siempre que la división no sea exacta (opción: solo cuando se redondea hacia arriba, el mínimo legal). Con cáscara, sobre la parte comestible | `src/rounding.js` |
| Desglose de grasas | Saturadas, mono, poli, trans y colesterol son obligatorios si la porción tiene 3 g de grasa o más (valor sin redondear o declarado); si no, se muestran solo los que se conocen | `src/nutrients.js` |
| Mezclas | Valor por 100 g = suma de (valor del componente × gramos / 100); se redondea al final. Fibra solo si todos los componentes la informan. Un componente con 0,5 g de grasa o menos que no informa el desglose cuenta 0 (queda anotado) | `src/nutrients.js` |
| Sellos ALTO EN | Solo si se añadió algo (también dentro de un ingrediente comprado) y el nutriente relacionado supera el límite por 100 g (sólidos: 275 kcal, 10 g azúcares, 4 g saturadas, 400 mg sodio). Azúcar → azúcares y calorías; grasa o aceite → saturadas y calorías; sal → solo sodio. Lectura estricta: basta que supere el valor sin redondear o el declarado | `src/seals.js` |
| Eslogan | Con sellos que correspondan por norma, el eslogan "con sellos" (aunque se haya quitado uno por decisión) | `src/label-data.js` |
| Contiene / puede contener | Mezclas: unión de los componentes, del más pesado al más liviano; primero el alérgeno que es el propio ingrediente (almendras, maní) y después los demás (sulfitos). Lo que está en contiene sale de puede contener | `src/allergens.js` |
| Ingredientes de una mezcla | Orden decreciente por peso (empates en el orden de la receta). Un componente de un solo ingrediente aparece con su nombre como ingrediente; si tiene varios, "nombre (sus ingredientes)" | `src/ingredients.js` |
| Envasador y origen | Simple: "ENVASADO POR:" + "ORIGEN: país". Mezcla: "ELABORADO Y ENVASADO EN CHILE POR:" + "ORIGEN DE LOS INGREDIENTES:" agrupado por país (opción: "ELABORADO Y ENVASADO POR:") | `src/label-data.js` |
| Chequeos | Energía vs 4·P + 4·HdC + 9·G (10 %; con valores bajo 50 kcal, 5 kcal); grasas parciales ≤ totales; parciales bajo 80 % del total (posible fila mal leída); azúcares ≤ H. de C.; proteínas + grasas + H. de C. + fibra ≤ 100 g | `src/nutrients.js` |
| Textos | Con sellos: sin palabras de salud (saludable, bienestar…) ni descriptores del mismo nutriente del sello. "Sin azúcar" no va si se añadió azúcar o si la porción tiene 0,5 g de azúcares o más; "sin sal" no va si se añadió sal | `src/claims.js` |

### Alertas

Cada alerta trae `code`, `kind` (`missing` faltante, `inconsistent` incoherente, `reference` dato de referencia, `regulatory` normativa, `info`), `message` (texto corto para quien imprime) y `detail` (explicación para la revisión). `print` dice qué pasa al imprimir: `ask` = aviso con "Imprimir igual" / "Cancelar"; `review` = hay que corregir o confirmar antes; `none` = solo informativa. En una mezcla, las alertas de un componente llevan su id delante (`pasas-rubias/missing_origin`).
