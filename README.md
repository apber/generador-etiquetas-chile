# Generador de etiquetas de alimentos (Chile)

Herramienta para que una pyme de alimentos envasados registre sus productos y genere etiquetas que cumplen la normativa chilena de rotulado: tabla nutricional, sellos "ALTO EN", alérgenos, ingredientes, origen y código de barras.

**Estado:** en desarrollo. Listos: formato de los datos y cálculos (tabla nutricional, porciones, sellos, alérgenos, mezclas, chequeos), con pruebas automáticas. Siguiente: la etiqueta con los datos.

## Qué hará cuando esté terminado

- ✅ Guarda una ficha por producto con los datos del proveedor (nutrición por 100 g, ingredientes, alérgenos, origen).
- ✅ Calcula lo derivado: valores por porción, porciones por envase, sellos ALTO EN, redondeos y chequeos de coherencia.
- ✅ Arma mezclas a partir de las fichas de sus ingredientes.
- ⏳ Genera la etiqueta y la hoja de impresión en PDF.
- ⏳ Lee los datos desde fotos de la etiqueta del proveedor.
- ⏳ App para celular y programa para PC, con los datos en una carpeta de OneDrive.

✅ listo · ⏳ pendiente

Normativa de referencia: Reglamento Sanitario de los Alimentos (DS 977/96, MINSAL), Ley 20.606, DS 297/1992 y Ley 19.496.

## Datos

El repositorio solo trae datos de ejemplo de una marca ficticia (modo demo). Los datos reales de cada empresa viven fuera del código, en su propia carpeta de OneDrive.

## English

Label generator for packaged foods sold in Chile: keeps one record per product from supplier data and produces labels compliant with Chilean food labeling rules (nutrition facts, "ALTO EN" warning seals, allergens, origin, barcode). Work in progress. Demo data only; real company data lives outside this repository.

## Para desarrollar

```
npm ci
npm run validate          # revisa el formato de demo/
npm run label             # muestra lo calculado para cada producto de demo/
npm test                  # pruebas automáticas
```

Detalle de los datos y de los cálculos: [docs/formato-datos.md](docs/formato-datos.md).

## Licencia

MIT. Ver [LICENSE](LICENSE).
