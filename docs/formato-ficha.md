# Formato de los datos

Los datos de cada empresa viven en su propia carpeta (en producción, en OneDrive), con esta forma:

```
<carpeta de la empresa>/
  empresa.json          datos fijos: envasador, resolución sanitaria, eslogan, redes, códigos de barras
  fichas/
    <id>.json           una ficha por producto (el nombre del archivo es el id)
```

Esquemas: [`esquema/empresa.schema.json`](../esquema/empresa.schema.json) y [`esquema/ficha.schema.json`](../esquema/ficha.schema.json). Ejemplo completo con una marca ficticia: [`demo/`](../demo).

Para revisar una carpeta: `npm run validar -- <carpeta>` (sin carpeta, revisa `demo/`).

## Regla general

La ficha guarda **solo lo que se escribe o se lee del proveedor**. Todo lo derivado se calcula al generar la etiqueta y no se guarda: valores por porción, porciones por envase, sellos ALTO EN, eslogan, texto de envasador y origen, chequeos y alertas.

## Tipos de producto

| Tipo | Qué guarda |
|---|---|
| `simple` | Composición y nutrición por 100 g propias, con sus fuentes. |
| `mezcla` | Una receta con productos simples y gramos por 100 g (suma 100). Ingredientes, alérgenos, añadidos, origen y nutrición salen de las fichas de los componentes. |
| `solo_gestion` | Solo nombre y presentaciones con su código (productos sin etiqueta del sistema). |

## Campos de la ficha

**Identificación**
- `nombre_producto`: arco inferior del medallón.
- `descripcion`: nombre del alimento (RSA art. 107 a), hasta 3 líneas.
- `destacado`: opcional, hasta 2 líneas (p. ej. "TOSTADO, NO FRITO").
- `tipo`, `estado` (`se_vende` / `no_se_vende`), `color_aro` (hexadecimal o `null`).

**Presentaciones**: una o más, cada una con `peso_neto_g`, `envase` y su `codigo_barras` EAN-13 (13 dígitos, se valida el dígito verificador). El código pertenece a la presentación, no al producto.

**Composición** (productos simples)
- `ingredientes`: texto en el orden del proveedor. Los alérgenos van entre llaves, `{maní}`, y se imprimen en negrita.
- `nombre_como_ingrediente`: nombre corto que usan las mezclas. Si los ingredientes son más que ese nombre, la mezcla escribe `nombre (ingredientes)`.
- `contiene` y `puede_contener`: ids del catálogo [`datos/alergenos.json`](../datos/alergenos.json). `null` significa dato faltante (genera alerta); `[]` significa que no hay. Lo que está en `contiene` se quita solo de `puede_contener`.
- `anadidos`: azúcar, grasa o sodio adicionados (también dentro de un ingrediente comprado). Define qué sellos se evalúan.
- `pais_origen` (`null` = faltante), `con_cascara` (tabla por parte comestible, con leyenda), `conservacion` (`null` = texto por defecto de la empresa).
- Opcionales: `instrucciones_uso`, `texto_adicional`, `duracion_proveedor` (no se imprime).

**Nutrición**
- `porcion`: gramos y medida casera.
- `por_100g`: cada valor con su `fuente`. Si falta un dato, la clave no se incluye.

**Fuentes**: cada una con `nivel` (1 proveedor, 2 etiqueta anterior coherente, 3 tabla reconocida, 4 referencia de mercado), tipo, origen, fecha y archivos de respaldo. Cuando hay varias, gana la de nivel más bajo; las otras solo llenan vacíos y dejan alerta.

## Alérgeno genérico de frutos de cáscara

El id `frutos_cascara` se imprime como "otros frutos de cáscara" si el producto contiene algún fruto de cáscara (p. ej. almendras) y como "frutos de cáscara" si no (p. ej. pasas).
