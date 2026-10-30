# Plantilla de la etiqueta (sobre chico)

Código: [`src/template/`](../src/template). La plantilla arma la etiqueta de un producto a partir de lo que calcula [`src/label-data.js`](../src/label-data.js) y la maqueta en un navegador con las fuentes reales. El largo del reverso cambia por producto: mide lo mínimo para que todo quepa con los márgenes y separaciones de la plantilla, sin achicar nada.

```
npx playwright install chromium        # una vez
npm run render -- <carpeta> [ids…] [--assets marca.json] [--out carpeta] [--png]
```

Por cada producto deja `<id>.html` (la etiqueta terminada, sin scripts, a tamaño real: 1 mm = 3,7816 px), `<id>.json` (variante elegida, largo del reverso) y, con `--png`, una imagen. Sin `--assets` usa imágenes de reemplazo (demo). Las imágenes de una marca (logo, ícono de la firma, íconos de redes, sellos oficiales) viven fuera del repositorio, en un JSON:

```json
{ "logo": "logo.jpg", "signatureIcon": "icono.png",
  "seals": { "energy": "...svg", "sugars": "...svg", "saturated_fat": "...svg", "sodium": "...svg" },
  "icons": { "instagram": "...svg", "whatsapp": "...svg", "facebook": "...png" } }
```

En el navegador (la futura app): `labelPage(datos, empresa, opciones)` de [`label.js`](../src/template/label.js) devuelve la página; al cargarla, `layoutLabel` ([`layout.js`](../src/template/layout.js)) elige la variante y deja la etiqueta lista. La maqueta se hace a escala 1: a otras escalas el navegador redondea distinto y un bloque que cabe por décimas de píxel puede quedar en otro lugar.

## La tira

| Parte | Medida |
|---|---|
| Tira | 205,0 mm (unión B): el frente sigue 4,25 mm pasado el doblez derecho (cola oculta) y el reverso, en una sola pieza, da la vuelta por el doblez izquierdo y termina sobre la cola, 1,25 mm antes del doblez |
| Frente | 100,35 mm entre las marcas de doblez × 30 mm (cara principal 30,1 cm²) |
| Reverso | largo mínimo por producto (base de cálculo: 54,5 mm) |
| Código de barras | EAN-13 dibujado desde su número, vertical, al 80 % (21,0 × 30,6 mm) |
| QR | dibujado desde `follow_us.qr_url`, corrección M, sin logo, 9,3 mm |

## Reglas del reverso

- **Párrafos del panel de ingredientes**, con 2 px entre ellos: INGREDIENTES (con ORIGEN en línea propia), CONTIENE (con PUEDE CONTENER en línea nueva), conservación, instrucciones de uso y texto adicional si los hay, ENVASADO POR (con la resolución sanitaria en la línea siguiente) y las fechas de elaboración y vencimiento para escribir o timbrar.
- **1 mm por párrafo:** un párrafo empieza 1 mm más a la izquierda solo si cabe completo sobre el escalón del reverso; desde el primero que no, ninguno se corre.
- **Firma y código de barras** flotan a la derecha del texto; suben hasta que la cabeza del ícono de la firma quede a la altura del nombre del producto (si el nombre no llega a su columna o va arriba en una línea) o de la primera línea de ingredientes.
- **Tabla nutricional** al ancho de su contenido: título, «Porciones por envase» en una fila completa, la porción junto a los encabezados «100 g | Porción», líneas de 0,75 px entre grupos y de 0,4 px dentro de cada grupo; la leyenda de parte comestible, si corresponde, dentro de la tabla.
- **Bloque de redes** (QR + SÍGUENOS + redes, siempre junto): bajo la tabla, pegado al borde derecho (el de la tabla) y con el QR hacia el borde, lo más arriba que quede sin chocar (2,6 px de la tabla, 4 px del texto y del código de barras); en dos líneas si cabe justo bajo la tabla (el espacio entre el QR y el texto baja de 5 a 2,5 px solo si hace falta, con 0,75 px de holgura), si no en tres. O al final del panel de ingredientes, si así el reverso queda más corto.
- **Nombre del producto:** en una línea arriba (la tabla baja si el nombre llega a ella) o arriba dentro del panel de ingredientes, lo que deje el reverso más corto.

La plantilla mide las 44 variantes (nombre × ubicación del bloque de redes × espacio QR → texto) y se queda con la más corta; en empate, la primera de [`VARIANTS`](../src/template/back.js) (nombre en una línea, bloque bajo la tabla, espacio de 5 px).
