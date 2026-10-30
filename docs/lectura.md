# Lectura de fotos / Photo reading

Lee las fotos o capturas de la etiqueta de un proveedor y arma un **borrador de ficha** con alertas. Nada se guarda sin que la persona lo confirme (eso lo hará la pantalla de la app).

Código: [`src/reading/`](../src/reading). Prueba desde la terminal: [`scripts/read-photos.mjs`](../scripts/read-photos.mjs).

## Cómo funciona

1. **Revisión de cada foto en el dispositivo**, antes de gastar una lectura ([`image-quality.js`](../src/reading/image-quality.js), [`image-browser.js`](../src/reading/image-browser.js)): tamaño, nitidez (varianza del laplaciano), luz y exceso de brillo. Si una foto no sirve, se pide otra. La foto se achica a 1600 px por lado y se envía en JPEG. *Los umbrales son una primera estimación: se calibran con fotos reales.*
2. **La IA transcribe, no interpreta** ([`prompt.js`](../src/reading/prompt.js), [`schema.js`](../src/reading/schema.js)). Una sola consulta con todas las fotos del producto. Devuelve un JSON de formato fijo: cada fila de la tabla con sus dos columnas tal como están impresas (texto exacto, número y si se lee claro, dudoso o no se lee), la porción, los ingredientes, las frases de alérgenos, el origen solo si la etiqueta lo dice, la conservación, el proveedor y las fechas.
3. **El código convierte y valida** ([`table.js`](../src/reading/table.js), [`text.js`](../src/reading/text.js), [`convert.js`](../src/reading/convert.js)), con reglas fijas:

| Qué | Regla |
|---|---|
| Número de cada celda | Se toma del texto impreso (coma decimal, punto de miles); si no coincide con el número que dio la IA, el dato queda dudoso. «1.181» se lee como 1181 y queda marcado (miles o decimal) |
| Fila → nutriente | Por el nombre de la fila (energía, proteínas, grasa saturada, mono, poli, trans, colesterol, H. de C., azúcares, fibra, sodio, sal) |
| Unidades | Se llevan a las de la etiqueta (kcal, g, mg): sodio en g × 1000; energía solo en kJ ÷ 4,184; sal × 400 = sodio (con aviso) |
| H. de C. | «Disponibles» se usa tal cual. «Totales» − fibra (con aviso). «H. de C.» sin aclarar: se elige la lectura con la que la energía calza mejor (con aviso) |
| **Doble lectura** | Cada valor por 100 g se compara con su valor por porción (valor × porción / 100, con el margen del redondeo de ambos). Si calzan, el dato queda confirmado aunque una de las dos celdas se leyera dudosa (p. ej. «1?,5» calza con 61,7 × 0,3). Si no calzan, el dato no se usa |
| Valor por 100 g ilegible | Se calcula desde la porción (valor × 100 / porción), con aviso |
| Columna por porción calculada para otro peso | Si todas las filas guardan la misma proporción pero no la de la porción declarada, se avisa y se usan los valores por 100 g |
| Sin columna por porción (páginas web) | Los valores quedan «sin verificar»: solo los revisan los chequeos de la tabla |
| Chequeos de la tabla | Los de siempre ([`nutrients.js`](../src/nutrients.js)): energía ≈ 4·P + 4·HdC + 9·G, grasas parciales, azúcares ≤ H. de C., total ≤ 100 g |
| Filas obligatorias | Si falta una, se pide otra foto (o completar con una tabla reconocida). El desglose de grasas es obligatorio con 3 g de grasa o más por porción |
| Ingredientes | En minúsculas; los alérgenos que el proveedor marca en MAYÚSCULAS van entre llaves `{…}` (negrita). Si no los marca (o todo está en mayúsculas), se marcan los alérgenos encontrados |
| CONTIENE | Lo que dice el proveedor, más los alérgenos de la lista de ingredientes que no puso (con aviso). Cereales con gluten → «gluten». El alérgeno que es el propio producto va primero |
| PUEDE CONTENER | Lo que sigue a «Puede contener» y las frases de líneas compartidas («Elaborado en líneas que también procesan…», con aviso); sin repetir lo de CONTIENE. Lectura estricta: «frutos secos» = frutos de cáscara + maní |
| Lo añadido | Azúcar (azúcar, jarabes, miel, glucosa, concentrado de jugo…), grasa (aceites salvo el mineral, manteca, grasa…) y sal, con el ingrediente que lo trae: decide qué sellos se evalúan |
| Sellos del proveedor | Si su envase trae sellos distintos a los calculados, se avisa: puede faltar o sobrar algo añadido |
| Origen | Solo si la etiqueta lo dice («Origen: Chile», «Hecho en…»). Una dirección no es el origen |

4. **Alertas**: un mensaje simple por problema con una sola acción — `retake` (sacar otra foto), `review` (revisar a mano), `confirm` (confirmar), `fallback` (completar con un respaldo) o `none` (solo para la revisión). Las de `retake`, `review` y `fallback` frenan el guardado hasta que se resuelven. Textos: [`src/i18n/es-reading.js`](../src/i18n/es-reading.js).

## Gemini

[`gemini.js`](../src/reading/gemini.js) llama a la API de Gemini con salida JSON (`responseSchema`) y resolución alta de imagen. En la app la llamada pasa por un servidor que guarda la clave; para las pruebas se usa la clave de quien desarrolla (`GEMINI_API_KEY`). Errores con mensaje simple: cuota agotada, servicio ocupado (un reintento), clave inválida, respuesta incompleta.

En el nivel gratuito Google puede usar lo enviado para mejorar sus productos: enviar solo fotos de etiquetas, sin personas ni datos personales.

## Probar desde la terminal

```
GEMINI_API_KEY=… node scripts/read-photos.mjs --list-models
GEMINI_API_KEY=… node scripts/read-photos.mjs --model <modelo> --hint "Maní con chocolate" foto1.jpg foto2.jpg
node scripts/read-photos.mjs --transcription lecturas/<nombre>.transcription.json --hint "…"   # sin gastar una lectura
```

Opciones: `--kind web_capture` (capturas de una página), `--force` (leer aunque una foto no pase la revisión), `--out <carpeta>` (por defecto `lecturas/`), `--expect esperado.json --id <id>` (compara con lo esperado y cuenta los **errores sin alerta**: un dato mal leído que ninguna alerta marca).

Las fotos y las lecturas de una empresa real no van al repositorio (`lecturas/` está en `.gitignore`).
