// Valida una carpeta de datos: empresa.json + fichas/*.json.
// Uso: node scripts/validar-fichas.mjs <carpeta>   (por defecto: demo)
// Revisa el formato (esquema) y las referencias entre archivos. Los chequeos
// nutricionales y normativos son parte de los cálculos, no de este script.

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { esEan13Valido } from '../src/ean13.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const leer = (ruta) => JSON.parse(readFileSync(ruta, 'utf8'));

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validarFicha = ajv.compile(leer(join(raiz, 'esquema/ficha.schema.json')));
const validarEmpresa = ajv.compile(leer(join(raiz, 'esquema/empresa.schema.json')));
const catalogo = new Set(leer(join(raiz, 'datos/alergenos.json')).alergenos.map((a) => a.id));

const carpeta = process.argv[2] ?? join(raiz, 'demo');
const errores = [];
const avisos = [];

const formatearErrores = (archivo, errs) =>
  errs.forEach((e) => errores.push(`${archivo}: ${e.instancePath || '(raíz)'} ${e.message}`));

// Empresa
const empresa = leer(join(carpeta, 'empresa.json'));
if (!validarEmpresa(empresa)) formatearErrores('empresa.json', validarEmpresa.errors);
const codigosEmpresa = new Map((empresa.codigos_barras ?? []).map((c) => [c.numero, c.origen]));
for (const numero of codigosEmpresa.keys()) {
  if (!esEan13Valido(numero)) errores.push(`empresa.json: código ${numero} con dígito verificador incorrecto`);
}

// Fichas
const dirFichas = join(carpeta, 'fichas');
const fichas = new Map();
for (const nombre of readdirSync(dirFichas).filter((n) => n.endsWith('.json')).sort()) {
  const ficha = leer(join(dirFichas, nombre));
  if (!validarFicha(ficha)) formatearErrores(nombre, validarFicha.errors);
  if (ficha.id !== basename(nombre, '.json')) errores.push(`${nombre}: el id "${ficha.id}" no coincide con el nombre del archivo`);
  fichas.set(ficha.id, { ficha, nombre });
}

const codigosUsados = new Map();
for (const { ficha, nombre } of fichas.values()) {
  const comp = ficha.composicion ?? {};

  // Alérgenos del catálogo
  for (const campo of ['contiene', 'puede_contener']) {
    for (const id of comp[campo] ?? []) {
      if (!catalogo.has(id)) errores.push(`${nombre}: "${id}" en ${campo} no está en el catálogo de alérgenos`);
    }
  }
  const repetidos = (comp.contiene ?? []).filter((id) => (comp.puede_contener ?? []).includes(id));
  if (repetidos.length) avisos.push(`${nombre}: ${repetidos.join(', ')} está en CONTIENE y en PUEDE CONTENER (se quitará de PUEDE CONTENER)`);
  if ((comp.contiene ?? []).length && comp.ingredientes && !/\{[^}]+\}/.test(comp.ingredientes)) {
    avisos.push(`${nombre}: tiene alérgenos en CONTIENE pero ninguno marcado con {…} en los ingredientes`);
  }

  // Fuentes referenciadas
  const fuentes = new Set((ficha.fuentes ?? []).map((f) => f.id));
  const refs = [comp.fuente, ficha.nutricion?.porcion?.fuente,
    ...Object.values(ficha.nutricion?.por_100g ?? {}).map((v) => v.fuente)].filter(Boolean);
  for (const ref of new Set(refs)) {
    if (!fuentes.has(ref)) errores.push(`${nombre}: la fuente "${ref}" no está en "fuentes"`);
  }

  // Receta
  if (ficha.receta) {
    const suma = ficha.receta.componentes.reduce((s, c) => s + c.g_por_100g, 0);
    if (Math.abs(suma - 100) > 0.01) errores.push(`${nombre}: la receta suma ${suma} g, debe sumar 100`);
    for (const c of ficha.receta.componentes) {
      for (const id of [c.producto, ...(c.alternativas ?? [])]) {
        const comp = fichas.get(id);
        if (!comp) avisos.push(`${nombre}: falta la ficha de "${id}" (componente de la receta)`);
        else if (comp.ficha.tipo !== 'simple') errores.push(`${nombre}: "${id}" debe ser un producto simple`);
      }
    }
  }

  // Códigos de barras
  for (const p of ficha.presentaciones) {
    if (!p.codigo_barras) continue;
    if (!esEan13Valido(p.codigo_barras)) errores.push(`${nombre}: código ${p.codigo_barras} con dígito verificador incorrecto`);
    if (codigosUsados.has(p.codigo_barras)) errores.push(`${nombre}: código ${p.codigo_barras} ya está usado en ${codigosUsados.get(p.codigo_barras)}`);
    codigosUsados.set(p.codigo_barras, `${nombre} (${p.peso_neto_g} g)`);
    if (!codigosEmpresa.has(p.codigo_barras)) avisos.push(`${nombre}: código ${p.codigo_barras} no está en la lista de la empresa`);
  }
}

console.log(`Carpeta: ${carpeta}`);
console.log(`Fichas: ${fichas.size}`);
avisos.forEach((a) => console.log(`  aviso: ${a}`));
errores.forEach((e) => console.log(`  ERROR: ${e}`));
console.log(errores.length ? `${errores.length} error(es).` : 'Formato correcto.');
process.exit(errores.length ? 1 : 0);
