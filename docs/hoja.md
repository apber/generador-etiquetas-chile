# Hoja de impresión

Código: [`src/sheet/`](../src/sheet) (cálculo y página, sirven igual en la futura app) y [`src/node/sheet-pdf.js`](../src/node/sheet-pdf.js) (PDF con Chromium). Toma las etiquetas terminadas de la [plantilla](plantilla.md) y las pone en hojas carta o A4 a tamaño real.

```
npx playwright install chromium        # una vez
npm run sheet -- <carpeta> <id[:copias]>… [--assets marca.json] [--out hoja.pdf] [--fill]
                 [--paper letter|a4] [--margin mm] [--gap mm] [--paper-type normal|fotografico] [--gamma n]
                 [--ring id=#hex] [--barcode id=número] [--html]
```

Ejemplos: `npm run sheet -- datos mani:3 mix:2` (3 + 2 etiquetas, en el orden dado); `npm run sheet -- datos mani cranberries mix --fill` (repite la lista hasta llenar una hoja). Imprimir el PDF en **tamaño real / 100 %**, sin «ajustar a la página».

## Reglas

| | |
|---|---|
| Orden | el de la lista; con `--fill`, la lista se repite hasta que la siguiente no cabe |
| Separación | 3 mm entre los contornos de corte (no entre los tableros) |
| Márgenes | arriba y abajo al menos `--margin` (4 mm por defecto); cada página se centra en vertical por su pila de etiquetas y en horizontal por el contorno visible |
| Cuántas caben | todas las que entren con los márgenes; las que no, pasan a otra página. Cada etiqueta mide lo suyo (el reverso cambia por producto) |
| Lados | la tira mide 205,0 mm: en carta quedan 5,4 mm por lado; en A4, 2,5 mm (aviso: muchas impresoras no imprimen tan cerca del borde) |
| Productos incompletos | no van en la hoja; se avisa |

Con la etiqueta del sobre chico, en carta caben 5 de 51,7 mm con márgenes de hasta 4,5 mm, y 5 de 43 mm (6 en A4).

## Color según el papel

En papel fotográfico brillante los colores se imprimen más oscuros. `--paper-type fotografico` aplica una curva gamma (0,85 por ahora; `--gamma` para probar otros valores): aclara los tonos medios y deja igual el negro y el blanco, así que el código de barras, el QR, la tabla y los sellos no cambian. Los colores del dibujo se corrigen en el HTML; las imágenes (logo, ícono de la firma, íconos de redes) se corrigen píxel a píxel en el navegador antes de imprimir, a su propia resolución. Los sellos (SVG en blanco y negro) no se tocan.

## Precisión

En la página las posiciones son exactas; al pasar a PDF, Chromium las redondea al píxel (±0,13 mm), bastante menos de lo que se mueve el papel en una impresora casera.
