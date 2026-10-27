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
| `composition.storage` | Conservación (`null` = texto por defecto de la empresa) |
| `composition.usage_instructions` | Instrucciones de uso (opcional) |
| `composition.extra_text` | Texto adicional (opcional) |
| `composition.supplier_shelf_life` | Duración según el proveedor (no se imprime) |
| `recipe.components[]` | Receta de una mezcla: `product`, `g_per_100g`, `alternatives` |
| `nutrition.serving` | Porción: `g` y `household_measure` (medida casera) |
| `nutrition.per_100g` | Tabla por 100 g; cada valor con su `source`. Si falta un dato, la clave no se incluye |
| `sources[]` | Fuentes: `level` 1 proveedor, 2 etiqueta anterior coherente, 3 tabla reconocida, 4 referencia de mercado; `kind`, `from`, `date`, `files` |

En `company.json`: `brand` (marca), `packer` (envasador), `health_permit` (resolución sanitaria), `slogan` (eslogan sin y con sellos), `default_storage` (conservación por defecto), `follow_us` (Síguenos), `barcodes` (códigos de la empresa).

## Alérgeno genérico de frutos de cáscara

El id `tree_nuts` se imprime como "otros frutos de cáscara" si el producto contiene algún fruto de cáscara (p. ej. almendras) y como "frutos de cáscara" si no (p. ej. pasas).
