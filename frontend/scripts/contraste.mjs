// Verifica el contraste WCAG 2.2 AA de los tokens de src/styles.css en los temas claro y oscuro.
// Texto: 4,5:1 · bordes de controles, iconos y foco: 3:1. Uso: `npm run contraste`.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(import.meta.dirname, '..', 'src', 'styles.css'), 'utf8');

function bloque(selector) {
  const inicio = css.indexOf(`${selector} {`);
  if (inicio < 0) throw new Error(`No se encontró ${selector}`);
  const fin = css.indexOf('}', inicio);
  const tokens = {};
  for (const [, nombre, valor] of css.slice(inicio, fin).matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[nombre] = valor.trim();
  }
  return tokens;
}

const claro = bloque(':root');
const oscuroManual = bloque(':root.tema-oscuro');
const oscuroSistema = bloque(':root:not(.tema-claro)');
const oscuro = { ...claro, ...oscuroManual };

// Los dos bloques del tema oscuro (por sistema y manual) deben ser idénticos.
const distintos = [
  ...new Set([...Object.keys(oscuroManual), ...Object.keys(oscuroSistema)]),
].filter((t) => oscuroManual[t] !== oscuroSistema[t]);
if (distintos.length) {
  console.error(`✘ Los bloques oscuros difieren en: ${distintos.join(', ')}`);
  process.exit(1);
}

function resolver(tokens, nombre, profundidad = 0) {
  const valor = tokens[nombre];
  if (!valor || profundidad > 10) throw new Error(`Token sin valor: ${nombre}`);
  const ref = valor.match(/^var\((--[\w-]+)\)$/);
  return ref ? resolver(tokens, ref[1], profundidad + 1) : valor;
}

function luminancia(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const TEXTO = 4.5;
const NO_TEXTO = 3;
const ESTADOS = [
  'pendiente',
  'confirmada',
  'llegada',
  'espera',
  'atencion',
  'completada',
  'cancelada',
  'no-asistio',
];
const SEMANTICOS = ['exito', 'error', 'advertencia', 'info'];

const pares = [
  ['c-texto', 'c-fondo', TEXTO],
  ['c-texto', 'c-superficie', TEXTO],
  ['c-texto', 'c-superficie-elevada', TEXTO],
  ['c-texto-2', 'c-fondo', TEXTO],
  ['c-texto-2', 'c-superficie', TEXTO],
  ['c-texto-2', 'c-superficie-2', TEXTO],
  ['c-texto-2', 'c-superficie-3', TEXTO],
  ['c-texto-2', 'c-superficie-elevada', TEXTO],
  ['c-texto-2', 'c-primario-tenue', TEXTO],
  ['c-texto-2', 'c-primario-suave', TEXTO],
  ['c-sobre-primario', 'c-primario', TEXTO],
  ['c-sobre-primario', 'c-primario-hover', TEXTO],
  ['c-sobre-primario', 'c-primario-activo', TEXTO],
  ['c-enlace', 'c-superficie', TEXTO],
  ['c-enlace', 'c-fondo', TEXTO],
  ['c-enlace', 'c-superficie-2', TEXTO],
  ['c-primario-hover', 'c-superficie', TEXTO],
  ['c-primario', 'c-primario-suave', TEXTO],
  ['c-primario', 'c-primario-tenue', TEXTO],
  ['c-primario', 'c-superficie-elevada', TEXTO],
  ['c-primario-fuerte', 'c-primario-suave', TEXTO],
  ['c-acento', 'c-superficie', TEXTO],
  ['c-acento', 'c-acento-suave', TEXTO],
  ['c-sobre-peligro', 'c-peligro', TEXTO],
  ['c-sobre-peligro', 'c-peligro-hover', TEXTO],
  ['c-error', 'c-superficie', TEXTO],
  ['c-error', 'c-fondo', TEXTO],
  ...SEMANTICOS.flatMap((s) => [
    [`c-${s}`, `c-${s}-suave`, TEXTO],
    ['c-texto', `c-${s}-suave`, TEXTO],
    [`c-${s}`, 'c-superficie', NO_TEXTO],
  ]),
  ...ESTADOS.flatMap((e) => [
    [`estado-${e}`, `estado-${e}-fondo`, TEXTO],
    [`estado-${e}`, 'c-superficie', NO_TEXTO],
  ]),
  ['c-borde-control', 'c-superficie', NO_TEXTO],
  ['c-borde-control', 'c-fondo', NO_TEXTO],
  ['c-borde-control', 'c-superficie-2', NO_TEXTO],
  ['c-borde-control', 'c-superficie-elevada', NO_TEXTO],
  ['c-primario-borde', 'c-superficie', NO_TEXTO],
  ['c-primario-borde', 'c-fondo', NO_TEXTO],
  ['c-primario-borde', 'c-superficie-2', NO_TEXTO],
  ['c-foco', 'c-superficie', NO_TEXTO],
  ['c-foco', 'c-fondo', NO_TEXTO],
  ['c-foco', 'c-superficie-2', NO_TEXTO],
  ['c-foco', 'c-superficie-elevada', NO_TEXTO],
];

let fallos = 0;
const filas = [];
for (const [a, b, minimo] of pares) {
  const celdas = [`--${a}`.padEnd(24), `--${b}`.padEnd(26), minimo === TEXTO ? 'texto' : '3:1  '];
  for (const tokens of [claro, oscuro]) {
    const r = contraste(resolver(tokens, `--${a}`), resolver(tokens, `--${b}`));
    if (r < minimo) fallos++;
    celdas.push(`${r.toFixed(2).padStart(6)}${r < minimo ? ' ✘' : '  '}`);
  }
  filas.push(celdas.join(' '));
}
console.log(`${'primer plano'.padEnd(24)} ${'fondo'.padEnd(26)} tipo   claro   oscuro`);
console.log(filas.join('\n'));
if (fallos) {
  console.error(`✘ ${fallos} pares no cumplen WCAG 2.2 AA.`);
  process.exit(1);
}
console.log(`✔ ${pares.length * 2} combinaciones cumplen WCAG 2.2 AA en ambos temas.`);
