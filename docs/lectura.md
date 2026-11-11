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
| Unidades | Se llevan a las de la etiqueta (kcal, g, mg): sodio en g × 1000; energía solo en kJ ÷ 4,184; sal × 400 = sodio (con aviso). Si la conversión da algo imposible, la unidad impresa queda en duda y el valor no se usa: sodio sobre 5000 mg por 100 g, o sobre 1000 mg si ningún ingrediente aporta sal (arreglo 3, 0.7: una fruta seca con el sodio impreso en g en vez de mg); colesterol sobre 1500 mg |
| H. de C. | «Disponibles» (o «Disp.») se usa tal cual. «Totales» − fibra (con aviso). «H. de C.» sin aclarar: se usa tal como está impreso; si la energía calza claramente mejor restando la fibra, se pide revisarlo (nunca se cambia solo) |
| **Doble lectura** | Cada valor por 100 g se compara con su valor por porción (valor × porción / 100, con el margen del redondeo de ambos). Si las dos celdas se leen claras y calzan, el dato queda confirmado. Desde la 0.7 (arreglo 14) la otra columna solo confirma con precisión suficiente: **dos celdas dudosas nunca se confirman entre sí**; un valor dudoso se confirma solo si la celda por porción lo distingue de sus vecinos con la misma cantidad de decimales («0,3» en 40 g calza con 0,6, 0,7 y 0,8 por 100 g: no confirma ninguno; «1,5» en 30 g sí confirma un 5 dudoso); una celda por porción con menos decimales que la de 100 g («70,0 \| 17») o que calza solo con el margen extra del 2 % deja el valor «por confirmar». Una celda por porción dudosa se confirma con la de 100 g clara (p. ej. «1?,5» calza con 61,7 × 0,3). Si no calzan, el dato no se usa |
| Valor por 100 g ilegible | Se calcula desde la porción (valor × 100 / porción), con aviso. Un valor dudoso que la porción no distingue (1,2 con 0,3 de 30 g) queda dudoso y pide otra foto |
| **Tabla solo en fotos malas** | Desde la 0.7 (arreglo 15): si todas las fotos en que se ve la tabla vienen marcadas por la IA como borrosas, de lejos u oscuras, todos los valores de la tabla quedan «por confirmar» (aunque calcen las dos columnas) y un aviso pide otra foto de la tabla. Una foto de cerca de la tabla sin esos problemas lo levanta. Calibración del 10-11-2026: con fotos así la IA lee con seguridad números equivocados (de lejos, filas corridas) |
| Porción sin gramos | Si la columna por porción guarda una misma proporción con la de 100 g, se deduce la porción (confirmar); si no, la tabla no se usa |
| Columna por porción calculada para otro peso | Si todas las filas guardan la misma proporción pero no la de la porción declarada, se avisa y se usan los valores por 100 g |
| Sin columna por porción (páginas web) | Los valores quedan «sin verificar»: solo los revisan los chequeos de la tabla |
| Chequeos de la tabla | Los de siempre ([`nutrients.js`](../src/nutrients.js)): energía ≈ 4·P + 4·HdC + 9·G, grasas parciales, azúcares ≤ H. de C., total ≤ 100 g |
| Filas obligatorias | Si falta una, se pide otra foto (o completar con una tabla reconocida). El desglose de grasas es obligatorio con 3 g de grasa o más por porción |
| Dos idiomas | Desde la 0.7 (arreglo 2): si el proveedor repite un texto en otro idioma («HARINA, AZÚCAR… / FLOUR, SUGAR…», «1 unid. / units»), se deja solo el español (ingredientes, frases de alérgenos, conservación y medida casera), con una nota de lo que se quitó. Si ninguna parte parece español, no se quita nada ([`language.js`](../src/reading/language.js)) |
| Ingredientes | En minúsculas; los alérgenos que el proveedor marca en MAYÚSCULAS van entre llaves `{…}` (negrita). Si no los marca (o todo está en mayúsculas), se marcan los alérgenos encontrados |
| CONTIENE | Lo que dice el proveedor, más los alérgenos de la lista de ingredientes que no puso (con aviso). Cereales con gluten → «gluten». **«Harina» sin decir de qué es = harina de trigo → gluten** (lectura estricta, arreglo 1, 0.7); «harina de arroz, de maíz…» no. El alérgeno que es el propio producto va primero |
| PUEDE CONTENER | Lo que sigue a «Puede contener» y las frases de líneas compartidas («Elaborado en líneas que también procesan…», con aviso); sin repetir lo de CONTIENE. Lectura estricta: «frutos secos» = frutos de cáscara + maní. Un alérgeno que se nombra junto al grupo que ya lo incluye («frutos secos, maní») no cuenta como palabra repetida (arreglo 4, 0.7) |
| Lo añadido | Azúcar (azúcar, jarabes, miel, glucosa, concentrado de jugo…), grasa (aceites salvo el mineral, manteca, grasa…) y sal, con el ingrediente que lo trae: decide qué sellos se evalúan |
| Sellos del proveedor | Si su envase trae sellos distintos a los calculados, se avisa: puede faltar o sobrar algo añadido |
| Origen | Solo si la etiqueta lo dice («Origen: Chile», «Hecho en…»). Una dirección no es el origen |

4. **Alertas**: un mensaje simple por problema con una sola acción — `retake` (sacar otra foto), `review` (revisar a mano), `confirm` (confirmar), `fallback` (completar con un respaldo) o `none` (solo para la revisión). Nada frena el guardado (decisión del 04-11-2026, criterio para pymes): las de `retake`, `review` y `fallback` quedan pendientes y recomiendan cómo comprobar el dato (otra foto o una captura, buscar en internet, compararlo a la vista con la bolsa); las de información que falta solo dicen cómo sale la etiqueta (p. ej. sin la línea ORIGEN). Lo que no se pudo leer o no calza no se usa en la etiqueta hasta revisarlo. Textos: [`src/i18n/es-reading.js`](../src/i18n/es-reading.js).

## Gemini

[`gemini.js`](../src/reading/gemini.js) llama a la API de Gemini con salida JSON (`responseSchema`) y resolución alta de imagen. En la app la llamada pasa por un servidor que guarda la clave; para las pruebas se usa la clave de quien desarrolla (`GEMINI_API_KEY`). Errores con mensaje simple: cuota agotada, servicio ocupado (un reintento), sin respuesta a tiempo (por intento: 45 s + 15 s por imagen, máximo 180 s; `timeoutFor`), clave inválida, respuesta incompleta. Cancelar corta la lectura de inmediato.

En el nivel gratuito Google puede usar lo enviado para mejorar sus productos: enviar solo fotos de etiquetas, sin personas ni datos personales.

### Modelo

`gemini-3.6-flash` con razonamiento bajo (elegido el 30-10-2026). Si se acaba su cuota del día, está ocupado o no responde a tiempo, `gemini-3.5-flash-lite`; esa lectura lleva un aviso que pide revisar todos los datos con la bolsa (con la causa: cuota → «léala de nuevo mañana»; ocupado o sin respuesta → «en un rato»), porque ese modelo lee con seguridad lo que no está claro. [`readWithFallback`](../src/reading/gemini.js).

### Foto de cerca de una sección

Cuando algo queda dudoso, se pide una foto de cerca de **solo esa parte**: una sección (frase de alérgenos, tabla, ingredientes), una frase, una o varias filas o un solo número. Se lee sola y reemplaza solo lo que muestra (las filas de la tabla se emparejan por nutriente); lo demás se conserva ([`merge.js`](../src/reading/merge.js)). Si la foto de cerca tampoco se lee, se revisa a mano con la bolsa.

### Datos que faltan

Dos salidas en cada aviso de dato faltante: **«Completar automáticamente»** (el sistema lo calcula —p. ej. desde la columna por porción— o lo busca en internet: tabla reconocida del mismo alimento, consenso de varias marcas, el mismo fabricante en otro país; queda marcado como referencia) y **«Escribir el dato»**. Nombres de los botones por confirmar con las maquetas (etapa 7f).

Tercera tanda (linaza, maravilla, pasas morenas con más fotos, caja de pistachos): 0 errores sin alerta. La maravilla trae grasas por porción que no calzan con las de 100 g (error del proveedor): el sistema lo marca; tras otra foto, la persona puede confirmar que la etiqueta dice eso.

### Frases de alérgenos

No tienen una segunda columna con que compararlas y suelen ir en letra muy chica. Por eso: cada frase trae su legibilidad; una palabra dudosa, un alérgeno repetido en la misma frase («sésamo/sésamo», a menudo otra palabra mal leída) o una palabra que no es un alérgeno conocido («otras frutas secas») quedan pendientes y recomiendan revisarla con la bolsa. Las listas de CONTIENE y PUEDE CONTENER sacadas de los ingredientes o de las frases de líneas compartidas se confirman siempre.

### Primeras pruebas (6 productos reales, 30-10-2026)

Con fotos de 720 × 1600 px. «Errores sin alerta» = dato mal leído que ninguna alerta marca.

| Modelo | Tiempo por producto | Errores sin alerta | Comentario |
|---|---|---|---|
| gemini-3.6-flash (razonamiento bajo) | 4–18 s (una vez 60 s) | 0 | Marca lo que no lee |
| gemini-3.8-flash (razonamiento bajo) | 73–127 s | 0 | Igual de cuidadoso, demasiado lento |
| gemini-3.5-flash-lite | 3–8 s | 0–1 según la lectura | Lee con seguridad lo que no está claro: inventa dígitos y palabras marcándolos como claros |

Segunda tanda (5 productos más, gemini-3.6-flash, 7–14 s): 0 errores sin alerta con las reglas actuales.

### Al cambiar las instrucciones o el modelo

Las instrucciones (`PROMPT_VERSION` en [`prompt.js`](../src/reading/prompt.js)) y los modelos solo cambian con una versión nueva, y la versión nueva se usa recién después de volver a puntuar las lecturas esperadas (arreglo 12, 0.7; skill lectura-con-ia). Cada lectura guarda el modelo y la versión de las instrucciones.

1. Subir `PROMPT_VERSION` y agregar su línea en [`test/prompt.test.js`](../test/prompt.test.js) (huella de las instrucciones y el formato, y los modelos). La prueba falla si cambian el texto, el formato o el modelo sin eso.
2. Si solo cambian las reglas del código: puntuar de nuevo las lecturas guardadas, sin gastar cuota: `node scripts/score-readings.mjs --expect esperado.json [--alias producto=id] carpeta-de-lecturas` (también acepta los .zip descomprimidos de la página de pruebas). Cuenta por lector los **errores sin alerta**.
3. Si cambian las instrucciones o el modelo: una tanda nueva con fotos buenas de los productos con datos esperados (página de pruebas, «Lote de fotos de varios productos») y puntuarla igual. Meta: 0 errores sin alerta con el lector normal.
4. Anotar la fecha de la puntuación en la línea de la versión (`scored`).

| Versión | Cambio | Puntuación |
|---|---|---|
| 4 (04-11-2026) | Frases de alérgenos palabra por palabra | 0 errores sin alerta en 14 lecturas con fotos buenas (03 y 04-11) |
| 5 (10-11-2026) | Un texto con palabras gastadas, tapadas o cortadas es dudoso, con «?» donde falta (arreglo 13: el lector normal dio por clara una lista de ingredientes a la que le faltaba una palabra borrada) | 11-11-2026, 12 productos con fotos buenas, los dos lectores: normal 0 errores sin alerta (110 bien, 1 mal con alerta); rápido 0 en la tabla (104 bien, 6 con alerta), pero 1 texto sin alerta (origen «Caraca» por «Canadá» en la linaza). Revisados a mano: en las pasas rubias la palabra borrada sale como «?» y dudosa (arreglo 13); en el barquillo, «harina» da gluten y se quita el inglés. Con las reglas de la 0.7, las 40 lecturas de la calibración (instrucciones v4) dan 0 errores sin alerta con el lector normal (antes 25) y 5 con el rápido (antes 30) |

## Página de pruebas en el celular

[`lectura/`](../lectura) es una página web (sin servidor) para probar la lectura con la cámara del teléfono, publicada con GitHub Pages en <https://apber.github.io/generador-etiquetas-chile/lectura/>. Usa los mismos módulos de `src/reading/`: no repite reglas.

- **Clave:** cada persona pega su propia clave de Gemini; queda guardada solo en ese navegador (`localStorage`) y se envía solo a Gemini. Conviene una clave creada para pruebas y, en Google Cloud, limitarla a la API de Gemini y al sitio `apber.github.io`. La app real (etapa 7f) no pedirá clave: la llamada pasará por el servidor.
- **Fotos:** «Sacar foto» (cámara) o «Elegir fotos» (galería, varias). No se pregunta si son fotos de la bolsa o capturas de una página: cada imagen se reconoce sola (una captura tiene mucho blanco puro) y se pueden mezclar en una misma lectura. Mientras se revisan se ve «Revisando 2 de 5 fotos…». Cada foto se revisa en el teléfono antes de gastar una lectura y muestra sus medidas (tamaño, nitidez, luz, píxeles quemados) para calibrar los umbrales con fotos de cámara.
- **Resultado:** avisos ordenados (los pendientes primero), la tabla por 100 g con el estado de cada valor y lo impreso en las dos columnas, y los textos (ingredientes con los alérgenos en negrita, CONTIENE, PUEDE CONTENER, frases leídas, lo añadido, origen, conservación, fechas, proveedor).
- **Foto de cerca:** desde el aviso que la pide, o «Foto de cerca de otra parte…»; reemplaza solo lo que muestra.
- **Lote de fotos de varios productos** (desde la 0.6.5; [`batch.js`](../lectura/batch.js)): se eligen muchas fotos a la vez y el nombre de cada archivo dice a qué lectura va: `producto_prueba_lo-que-sea.jpg` (p. ej. `mani-bitter_R_tabla.jpg`); `producto_todas_….jpg` va en todas las lecturas de ese producto (p. ej. la foto de ingredientes). Una lectura por producto y prueba; antes de ponerlas en la cola se muestra el plan (fotos de cada lectura, cuáles no pasan la revisión y los nombres sin producto). Todas van a la cola del lector elegido en «Leer el lote con» (desde la 0.6.8): el normal, el rápido o, desde la 0.7.1, **los dos** (cada lectura se pone una vez por lector, con las mismas fotos), para comparar los lectores; el rápido tiene su propia cuota y no espera a las lecturas del normal. Se leen aunque alguna foto no pase la revisión. La lectura guarda el producto (`hint`), la prueba (`test`), `batch: true`, si alguna foto no pasó la revisión (`forced`) y la revisión de cada foto (`quality`); el archivo descargado se llama `lectura-<producto>_<prueba>-<fecha>.json` (`…-rapido-…` si la leyó el lector rápido, a propósito o como respaldo; desde la 0.6.8).
- **Guardar:** las 3 últimas lecturas de cada producto (y de cada prueba y lector: las del rápido no desplazan a las del normal), hasta 60, quedan en el teléfono sin las fotos. «Descargar lectura» o «Compartir lectura» entregan un archivo con la transcripción, las medidas de las fotos y el resultado, para revisarlo o compararlo con lo esperado (`--transcription`). Desde la 0.6.8, en la lista de lecturas guardadas: «Descargar» baja una lectura sin abrirla, y con las casillas («Seleccionar todas») «Descargar seleccionadas» baja varias en un solo .zip (un JSON por lectura, con los mismos nombres; [`zip.js`](../lectura/zip.js), sin compresión ni librerías).
- **En espera del lector normal** (desde la 0.6.4; lo mismo hará la app en 7f): si no responde ningún lector (cuota agotada, servicio ocupado o sin respuesta), la lectura queda en espera con sus fotos (IndexedDB del teléfono). Si solo respondió el lector rápido, su lectura se muestra y además queda en espera para leerla de nuevo con el normal; al terminar se comparan las dos ([`compare.js`](../src/reading/compare.js)): lo que coincide queda confirmado por los dos modelos y se listan las diferencias. Se reintenta sola ([`retry.js`](../src/reading/retry.js)): con el límite diario, 5 minutos después de la medianoche del Pacífico; con el límite por minuto, tras la espera que indica Gemini (`retryDelay`) más 5 s; con un 429 sin detalle o el servicio ocupado, cada 15 minutos; otros errores esperan a «Intentar ahora». Entre lecturas de la cola hay 4 s de pausa. La página tiene que estar abierta (al abrirla o volver a ella, sigue sola). En Ajustes, «Avisar con una notificación del teléfono…» (la casilla guarda la elección; aparte se muestra el permiso del teléfono, con «Pedir permiso», cómo permitirlo si Chrome lo bloqueó y «Probar aviso») muestra una sola notificación que se va actualizando (service worker [`sw.js`](../lectura/sw.js), sin caché). Solo con el modelo «Automático».
- **Ajustes:** modelo (automático: el elegido y el de respaldo), razonamiento y resolución de imagen. Contador de lecturas del día (la cuota se reinicia a medianoche del Pacífico).
- **Colores:** azul = bien, naranja = problema, siempre con un símbolo y una palabra (no depende del color).

Prueba automática: [`test/lectura-page.test.js`](../test/lectura-page.test.js) (Chromium con Gemini simulado).

## Probar desde la terminal

```
GEMINI_API_KEY=… node scripts/read-photos.mjs --list-models
GEMINI_API_KEY=… node scripts/read-photos.mjs --model gemini-3.6-flash --thinking low --hint "Maní con chocolate" foto1.jpg foto2.jpg
node scripts/read-photos.mjs --transcription lecturas/<nombre>.transcription.json --hint "…"   # sin gastar una lectura
```

Puntuar lecturas guardadas (descargadas de la página o de `lecturas/`) contra lo esperado, por lector:

```
node scripts/score-readings.mjs --expect esperado.json --alias cranberries-ocean-spray=cranberries-ocean --detail carpeta/
```

Opciones: `--thinking low` (razonamiento), `--media high|medium|low` (resolución de imagen), `--kind web_capture` (capturas de una página), `--force` (leer aunque una foto no pase la revisión), `--out <carpeta>` (por defecto `lecturas/`), `--expect esperado.json --id <id>` (compara con lo esperado y cuenta los **errores sin alerta**: un dato mal leído que ninguna alerta marca).

Las fotos y las lecturas de una empresa real no van al repositorio (`lecturas/` está en `.gitignore`). En Node, si hay un proxy, usar `NODE_USE_ENV_PROXY=1`.
