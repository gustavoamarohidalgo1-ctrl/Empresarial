// Verifica el presupuesto de docs/diseno.md § 4: JS inicial ≤ 90 kB transferidos.
// Se mide como el «Estimated transfer size» de `ng build` (brotli) y se informa también gzip.
// Uso: `npm run build && npm run presupuesto`. Lee los <script> y <link rel="modulepreload">
// de dist/frontend/browser/index.html (lo que se descarga antes del primer render).
// Con otra salida (`ng build --output-path <dir>`): `npm run presupuesto -- <dir>`.
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

const LIMITE_KB = 90;
const salida = process.argv[2]
  ? resolve(process.argv[2])
  : join(import.meta.dirname, '..', 'dist', 'frontend');
const dist = join(salida, 'browser');
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const archivos = new Set(
  [
    ...html.matchAll(/<script[^>]+src="([^"]+\.js)"/g),
    ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+\.js)"/g),
  ].map((m) => m[1]),
);

let brotli = 0;
let gzip = 0;
for (const archivo of archivos) {
  const contenido = readFileSync(join(dist, archivo));
  const br = brotliCompressSync(contenido).length / 1000;
  const gz = gzipSync(contenido, { level: 9 }).length / 1000;
  brotli += br;
  gzip += gz;
  console.log(
    `${archivo.padEnd(24)} brotli ${br.toFixed(2).padStart(6)} kB · gzip ${gz.toFixed(2).padStart(6)} kB`,
  );
}
console.log(
  `JS inicial: brotli ${brotli.toFixed(2)} kB (límite ${LIMITE_KB} kB) · gzip ${gzip.toFixed(2)} kB`,
);
if (brotli > LIMITE_KB) {
  console.error('✘ Se superó el presupuesto de JS inicial.');
  process.exit(1);
}
console.log('✔ Dentro del presupuesto.');
