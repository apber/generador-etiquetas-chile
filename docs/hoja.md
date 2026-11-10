# Hoja de impresión

Código: [`src/sheet/`](../src/sheet) (cálculo y página, sirven igual en la futura app) y [`src/node/sheet-pdf.js`](../src/node/sheet-pdf.js) (PDF con Chromium). Toma las etiquetas terminadas de la [plantilla](plantilla.md) y las pone en hojas carta o A4 a tamaño real.

```
npx playwright install chromium        # una vez
npm run sheet -- <carpeta> <id[:copias]>… [--assets marca.json] [--out hoja.pdf] [--fill]
                 [--paper letter|a4] [--margin mm] [--gap mm] [--paper-type normal|fotografico] [--gamma n]
                 [--ring id=#hex] [--barcode id=número] [--html] [--edge straight|step] [--fold-marks right|both|none]
```

Ejemplos: `npm run sheet -- datos mani:3 mix:2` (3 + 2 etiquetas, en el orden dado); `npm run sheet -- datos mani cranberries mix --fill` (repite la lista hasta llenar una hoja). Imprimir el PDF en **tamaño real / 100 %**, sin «ajustar a la página».

## Reglas

| | |
|---|---|
| Orden | el de la lista; con `--fill`, la lista se repite hasta que la siguiente no cabe |
| Separación | línea de corte compartida (v0.6.1): la línea de arriba de cada etiqueta queda sobre la de abajo de la anterior (−0,40 mm entre contornos), así el fondo del reverso y el borde de la etiqueta siguiente se cortan de una vez. Con `--gap 3`, 3 mm entre los contornos de corte, como antes |
| Márgenes | arriba y abajo al menos `--margin` (4 mm por defecto); cada página se centra en vertical por su pila de etiquetas y en horizontal por el contorno visible |
| Cuántas caben | todas las que entren con los márgenes; las que no, pasan a otra página. Cada etiqueta mide lo suyo (el reverso cambia por producto) |
| Lados | la tira mide 204,25 mm: en carta quedan 5,8 mm por lado; en A4, 2,9 mm (aviso: muchas impresoras no imprimen tan cerca del borde). Con el borde recto, el lado izquierdo de toda la pila queda alineado |
| Productos incompletos | no van en la hoja; se avisa |

Con la etiqueta del sobre chico y la línea compartida, en carta (márgenes de 4 mm) caben 5 de 51,7 mm y 6 de hasta 45,5 mm; en A4, 6 de hasta 48,5 mm y 7 de hasta 41,6 mm. Con 3 mm de separación: 5 de 51,7 mm con márgenes de hasta 4,5 mm y 5 de 43 mm (6 en A4).

## Color según el papel

En papel fotográfico brillante los colores se imprimen bastante más oscuros que en papel normal, aun con el tipo de papel correcto en el controlador. `--paper-type fotografico` aplica una corrección elegida con hojas de calibración en una Epson L375 con papel fotográfico brillante y ese tipo de papel en el controlador (ver abajo; `--gamma` para otro valor): aclara los tonos medios y deja igual el negro y el blanco, así que el código de barras, el QR, la tabla y los sellos no cambian. Los colores del dibujo se corrigen en el HTML; las imágenes (logo, ícono de la firma, íconos de redes) se corrigen píxel a píxel en el navegador antes de imprimir, a su propia resolución. Los sellos (SVG en blanco y negro) no se tocan.

**Corregir solo la luminosidad (04-11-2026):** la curva por canal aclara bien, pero cambia el tono de los colores saturados (el verde de WhatsApp pasa a menta) y apaga los cafés oscuros. Con `--gamma L0.5` la curva se aplica solo a la luminosidad (espacio OKLab): aclara lo mismo y conserva el tono. `L0.5S1.25` además sube la intensidad del color (croma × 1,25). El negro y el blanco no cambian. Un número solo (`0.45`) sigue siendo la curva por canal.

**Dibujo e imágenes por separado (04-11-2026):** `--gamma L0.45S1.25/L0.5` corrige los colores del dibujo (aro, textos, íconos en línea) con lo que va antes de la barra y las imágenes (logo con el hibisco, picaflor de la firma) con lo que va después; así el aro gana color sin recortar el rojo del hibisco.

**Valor de `fotografico` (04-11-2026, Epson L375, papel fotográfico brillante):** dibujo con luminosidad 0,45 · saturación ×1,25, imágenes con luminosidad 0,5 y el fondo de la etiqueta (#F6EEDF) con 0,45 por canal, que lo deja pálido y neutro en vez de amarillento (`overrides` de `PAPER_TYPES`). Elegido con dos hojas de calibración comparadas con una impresión en papel normal. Antes: 0,45 por canal para todo. Con `--gamma` explícito, ese valor se aplica a todo.

**Calibrar un papel:** `npm run sheet -- <carpeta> <id> --calibrate 1,0.75,0.6,0.5,0.4 --assets …` (o con luminosidad: `--calibrate "0.45;L0.5;L0.5S1.15;L0.5S1.3;L0.45S1.15"`) arma una hoja con la etiqueta de ese producto una vez por valor, numerada bajo el frente («Prueba de color N.º 1 · Sin corrección», …). Se imprime en el papel a calibrar con el tipo de papel correcto en el diálogo de impresión, se compara con una hoja en papel normal y el número que más se parezca da el valor de `--gamma` (o el de `PAPER_TYPES` en [`page.js`](../src/sheet/page.js)).

## Precisión

En la página las posiciones son exactas; al pasar a PDF, Chromium las redondea al píxel (±0,13 mm), bastante menos de lo que se mueve el papel en una impresora casera.
