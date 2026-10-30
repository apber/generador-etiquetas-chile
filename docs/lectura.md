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
| H. de C. | «Disponibles» (o «Disp.») se usa tal cual. «Totales» − fibra (con aviso). «H. de C.» sin aclarar: se usa tal como está impreso; si la energía calza claramente mejor restando la fibra, se pide revisarlo (nunca se cambia solo) |
| **Doble lectura** | Cada valor por 100 g se compara con su valor por porción (valor × porción / 100, con el margen del redondeo de ambos). Si calzan, el dato queda confirmado aunque una de las dos celdas se leyera dudosa (p. ej. «1?,5» calza con 61,7 × 0,3). Si no calzan, el dato no se usa |
| Valor por 100 g ilegible | Se calcula desde la porción (valor × 100 / porción), con aviso. Un valor dudoso que calza con la porción solo por el redondeo (1,2 con 0,3 de 30 g) no se da por bueno: se usa el que da la porción (1,0) |
| Porción sin gramos | Si la columna por porción guarda una misma proporción con la de 100 g, se deduce la porción (confirmar); si no, la tabla no se usa |
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

### Modelo

`gemini-3.6-flash` con razonamiento bajo (elegido el 30-10-2026). Si se acaba su cuota del día o está ocupado, `gemini-3.5-flash-lite`; esa lectura lleva un aviso que pide revisar todos los datos con la bolsa, porque ese modelo lee con seguridad lo que no está claro. [`readWithFallback`](../src/reading/gemini.js).

### Foto de cerca de una sección

Cuando algo queda dudoso, se pide una foto de cerca de **solo esa parte**: una sección (frase de alérgenos, tabla, ingredientes), una frase, una o varias filas o un solo número. Se lee sola y reemplaza solo lo que muestra (las filas de la tabla se emparejan por nutriente); lo demás se conserva ([`merge.js`](../src/reading/merge.js)). Si la foto de cerca tampoco se lee, se revisa a mano con la bolsa.

### Datos que faltan

Dos salidas en cada aviso de dato faltante: **«Completar automáticamente»** (el sistema lo calcula —p. ej. desde la columna por porción— o lo busca en internet: tabla reconocida del mismo alimento, consenso de varias marcas, el mismo fabricante en otro país; queda marcado como referencia) y **«Escribir el dato»**. Nombres de los botones por confirmar con las maquetas (etapa 7f).

Tercera tanda (linaza, maravilla, pasas morenas con más fotos, caja de pistachos): 0 errores sin alerta. La maravilla trae grasas por porción que no calzan con las de 100 g (error del proveedor): el sistema lo marca; tras otra foto, la persona puede confirmar que la etiqueta dice eso.

### Frases de alérgenos

No tienen una segunda columna con que compararlas y suelen ir en letra muy chica. Por eso: cada frase trae su legibilidad; una palabra dudosa, un alérgeno repetido en la misma frase («sésamo/sésamo», a menudo otra palabra mal leída) o una palabra que no es un alérgeno conocido («otras frutas secas») frenan el guardado hasta revisarla con la bolsa. Las listas de CONTIENE y PUEDE CONTENER sacadas de los ingredientes o de las frases de líneas compartidas se confirman siempre.

### Primeras pruebas (6 productos reales, 30-10-2026)

Con fotos de 720 × 1600 px. «Errores sin alerta» = dato mal leído que ninguna alerta marca.

| Modelo | Tiempo por producto | Errores sin alerta | Comentario |
|---|---|---|---|
| gemini-3.6-flash (razonamiento bajo) | 4–18 s (una vez 60 s) | 0 | Marca lo que no lee |
| gemini-3.8-flash (razonamiento bajo) | 73–127 s | 0 | Igual de cuidadoso, demasiado lento |
| gemini-3.5-flash-lite | 3–8 s | 0–1 según la lectura | Lee con seguridad lo que no está claro: inventa dígitos y palabras marcándolos como claros |

Segunda tanda (5 productos más, gemini-3.6-flash, 7–14 s): 0 errores sin alerta con las reglas actuales.

## Probar desde la terminal

```
GEMINI_API_KEY=… node scripts/read-photos.mjs --list-models
GEMINI_API_KEY=… node scripts/read-photos.mjs --model gemini-3.6-flash --thinking low --hint "Maní con chocolate" foto1.jpg foto2.jpg
node scripts/read-photos.mjs --transcription lecturas/<nombre>.transcription.json --hint "…"   # sin gastar una lectura
```

Opciones: `--thinking low` (razonamiento), `--media high|medium|low` (resolución de imagen), `--kind web_capture` (capturas de una página), `--force` (leer aunque una foto no pase la revisión), `--out <carpeta>` (por defecto `lecturas/`), `--expect esperado.json --id <id>` (compara con lo esperado y cuenta los **errores sin alerta**: un dato mal leído que ninguna alerta marca).

Las fotos y las lecturas de una empresa real no van al repositorio (`lecturas/` está en `.gitignore`). En Node, si hay un proxy, usar `NODE_USE_ENV_PROXY=1`.
