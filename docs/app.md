# La app (etapa 7f)

App web instalable (PWA) para registrar productos, leer las fotos del proveedor e imprimir las etiquetas. Está en
`app/` y usa el mismo código de `src/` que los scripts de Node. Sin compilación: Preact + htm (`app/vendor/`).

- **Pantallas:** Imprimir (la app abre aquí), Productos y Ajustes, con pestañas abajo en el teléfono y menú al costado
  desde 760 px de ancho. Todos los textos en `app/textos.js`; la marca y el nombre de la impresora salen de los datos de
  la empresa (`company.json` y `app.json`).
- **Datos:** en el dispositivo (IndexedDB, `app/js/datos/almacen.js`) y en una carpeta de OneDrive con los mismos
  archivos que usa Node: `company.json`, `products/<id>.json`, `marca/assets.json` y sus imágenes, más lo que agrega la
  app: `app.json` (opcional, p. ej. `{ "impresora": "Nombre de la impresora en Windows" }`), `etiquetas/`, `registro/impresiones.json`,
  `para-imprimir/`, `fotos/<id>/` y `lecturas/<id>/`. La sincronización (`app/js/datos/onedrive.js`) sube lo cambiado y
  baja lo nuevo (consulta delta de Microsoft Graph).
  **Primera vez:** si la carpeta de OneDrive no existe o está vacía, la app ofrece «Cargar los datos desde un archivo»:
  se elige la copia de la carpeta (.zip; `src/zip-read.js`) y la app la guarda y la sube (OneDrive crea la carpeta).
  Solo aparece con la carpeta vacía, así que no puede pisar datos.
- **Etiquetas:** cada etiqueta (una por presentación: producto + peso, y en una mezcla + variante) es un PDF vectorial
  que se hace una sola vez y queda en la carpeta de datos como `etiquetas/<clave>.pdf` y `etiquetas/<clave>.json` (la
  etiqueta en HTML, sus medidas y de qué presentación es), así que se sincroniza con el otro dispositivo. La clave
  (`src/app-label.js`) cambia si cambia algo de lo que sale en la etiqueta: los datos, la empresa, el contenido de las
  imágenes de marca o la plantilla (`LABEL_TEMPLATE_VERSION`). Solo una etiqueta que no está hecha se le pide al
  servidor (`src/render/label-pdf.js`); al hacerse una nueva, se borra la anterior de esa presentación. La hoja la arma
  el dispositivo sin internet (`src/sheet/compose-pdf.js`, pdf-lib) con el mismo plan que `npm run sheet`. La vista
  previa usa la etiqueta hecha o, si no hay, la maqueta en el mismo dispositivo.
- **Etiquetas por adelantado:** `node scripts/preparar-etiquetas.mjs <carpeta> [ids…] [--rehacer] [--limpiar]` hace en
  este computador las etiquetas de todas las presentaciones de los productos activos (y de cada variante de una mezcla
  con ficha) con la misma clave y el mismo PDF que el servidor, y las deja en `<carpeta>/etiquetas/`; las que ya están
  no se repiten y `--limpiar` borra las que ya no corresponden. Se sube esa carpeta a OneDrive y la app las tiene sin
  internet. **Al cambiar la plantilla, subir `LABEL_TEMPLATE_VERSION`** (si no, quedan en uso PDF viejos) y volver a
  correr el script.
- **Lectura de fotos:** siempre con los dos lectores (`app/js/lectura.js`): lo que coincide queda confirmado, lo que
  difiere queda «Dudoso» y lo leído por uno solo, «Por confirmar». Los datos críticos (alérgenos, filas obligatorias de
  la tabla, origen) que no estén confirmados y todo lo dudoso no salen en la etiqueta. Si el lector normal no está
  disponible, la lectura queda en espera y sigue sola.

## Probar en este computador

```bash
npm run app                         # http://localhost:8787/app/ — sin cuenta; «Ver con datos de prueba»
GEMINI_API_KEY=… npm run app        # con lectura de fotos real
```

El servidor local hace lo mismo que el de Cloudflare (PDF de cada etiqueta con Playwright y lecturas con la clave de
Gemini del computador), sin cuentas.

## Publicar (Cloudflare, gratis)

Dos copias: **dev** (lo último de `main`) y **producción** (la última versión etiquetada `vX.Y`: al crear la
etiqueta, `.github/workflows/produccion.yml` mueve la rama `produccion` a ella). Cada copia tiene su app, su servidor,
su clave de Gemini y su carpeta de OneDrive; en el teléfono quedan como dos apps («Nombre» y «Nombre DEV»).

**App (Cloudflare Pages, conectada al repositorio):** comando de compilación `node scripts/app-entorno.mjs`, carpeta
de salida `dist`, rama `main` (dev) o `produccion`. Variables de entorno del proyecto:

| Variable | Qué es |
|---|---|
| `APP_ENTORNO` | `dev` o `produccion` |
| `APP_NOMBRE` | nombre de la app en el teléfono (con dev se le agrega « DEV») |
| `APP_API` | dirección del servidor (el Worker de esa copia) |
| `MS_CLIENT_ID` | identificador de la app registrada en Microsoft |
| `APP_CARPETA` | carpeta de OneDrive con los datos, p. ej. `Empresa Gestión/Etiquetas` |

**Servidor (Cloudflare Workers, conectado al repositorio):** carpeta raíz del repositorio, comando
`npx wrangler deploy -c worker/wrangler.toml --env=""` (dev, rama `main`) o
`npx wrangler deploy -c worker/wrangler.toml --env produccion` (rama `produccion`). Usa Browser Rendering (plan
gratis: 10 minutos al día). Variables: `MS_CLIENT_ID`, `CUENTAS` (correos de las cuentas permitidas, separados por
coma), `ORIGENES` (dirección de la app, p. ej. `https://xxx.pages.dev`); secreto: `GEMINI_API_KEY`.

**Microsoft (OneDrive):** registrar una app en Microsoft Entra (portal de Azure, gratis; pide una cuenta de Azure) con
«Solo cuentas personales de Microsoft», plataforma **«Aplicaciones móviles y de escritorio»** (no «Aplicación de página
única»: así el servidor canjea el código y la sesión dura meses) y como direcciones de redirección las de las dos
copias de la app, terminadas en `/app/` (p. ej. `https://xxx.pages.dev/app/`). Permisos delegados: `User.Read`,
`Files.ReadWrite`, `offline_access`. Sin secreto de cliente.
