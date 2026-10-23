import { DestroyRef, Signal, afterNextRender, inject, signal } from '@angular/core';

/**
 * Geometría de los gráficos SVG propios del tablero (sin librerías): escalas con números
 * limpios, columnas con el extremo de datos redondeado, arcos de la dona, trama diagonal y
 * medición del ancho disponible.
 */

export interface Escala {
  /** Máximo del eje (≥ el dato mayor). */
  max: number;
  /** Marcas del eje, de 0 a `max`. */
  marcas: number[];
}

/** Escala con marcas «limpias» (1, 2, 2.5, 5 × 10ⁿ). Con `enteros`, el paso es ≥ 1. */
export function escalaLimpia(maximo: number, pasos = 4, enteros = true): Escala {
  if (!(maximo > 0)) return { max: enteros ? 4 : 1, marcas: enteros ? [0, 1, 2, 3, 4] : [0, 1] };
  const bruto = maximo / pasos;
  const magnitud = 10 ** Math.floor(Math.log10(bruto));
  const candidatos = [1, 2, 2.5, 5, 10].map((m) => m * magnitud);
  let paso = candidatos.find((c) => c >= bruto) ?? 10 * magnitud;
  if (enteros) paso = Math.max(1, Math.ceil(paso));
  const max = Math.ceil(maximo / paso) * paso;
  const marcas: number[] = [];
  for (let v = 0; v <= max + paso / 2; v += paso) marcas.push(Math.round(v * 1000) / 1000);
  return { max, marcas };
}

/** Columna con el extremo de datos (arriba) redondeado y la base recta. */
export function rutaColumna(x: number, y: number, ancho: number, alto: number, radio = 4): string {
  if (!(alto > 0) || !(ancho > 0)) return '';
  const r = Math.min(radio, ancho / 2, alto);
  const f = (n: number) => Math.round(n * 100) / 100;
  if (r <= 0) return `M${f(x)} ${f(y + alto)}V${f(y)}H${f(x + ancho)}V${f(y + alto)}Z`;
  return (
    `M${f(x)} ${f(y + alto)}V${f(y + r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}` +
    `H${f(x + ancho - r)}` +
    `A${f(r)} ${f(r)} 0 0 1 ${f(x + ancho)} ${f(y + r)}` +
    `V${f(y + alto)}Z`
  );
}

/**
 * Trama diagonal a 45° dentro de un rectángulo, como trazos sueltos (sin `<pattern>`: las
 * referencias `url(#…)` fallan en algunos navegadores con `<base href>`). Segundo canal de
 * identidad, además del color (daltonismo, impresión, alto contraste).
 */
export function rutaTrama(x: number, y: number, ancho: number, alto: number, paso = 5): string {
  if (!(alto > 0) || !(ancho > 0)) return '';
  const f = (n: number) => Math.round(n * 100) / 100;
  let d = '';
  for (let t = -alto + paso / 2; t < ancho; t += paso) {
    const desde = Math.max(0, -t);
    const hasta = Math.min(alto, ancho - t);
    if (hasta - desde < 0.5) continue;
    d += `M${f(x + t + desde)} ${f(y + alto - desde)}L${f(x + t + hasta)} ${f(y + alto - hasta)}`;
  }
  return d;
}

const TAU = Math.PI * 2;

function punto(cx: number, cy: number, r: number, angulo: number): string {
  const f = (n: number) => Math.round(n * 100) / 100;
  // Ángulo 0 = arriba, sentido horario.
  return `${f(cx + r * Math.sin(angulo))} ${f(cy - r * Math.cos(angulo))}`;
}

/** Sector de corona circular entre dos ángulos (radianes, 0 = arriba, sentido horario). */
export function rutaArco(
  cx: number,
  cy: number,
  rExterior: number,
  rInterior: number,
  inicio: number,
  fin: number,
): string {
  const barrido = fin - inicio;
  if (!(barrido > 0)) return '';
  if (barrido >= TAU - 1e-6) {
    // Anillo completo: dos mitades (un arco de 360° no se puede dibujar con un solo «A»).
    const medio = inicio + Math.PI;
    return (
      rutaArco(cx, cy, rExterior, rInterior, inicio, medio) +
      rutaArco(cx, cy, rExterior, rInterior, medio, inicio + TAU)
    );
  }
  const grande = barrido > Math.PI ? 1 : 0;
  return (
    `M${punto(cx, cy, rExterior, inicio)}` +
    `A${rExterior} ${rExterior} 0 ${grande} 1 ${punto(cx, cy, rExterior, fin)}` +
    `L${punto(cx, cy, rInterior, fin)}` +
    `A${rInterior} ${rInterior} 0 ${grande} 0 ${punto(cx, cy, rInterior, inicio)}Z`
  );
}

/** Índice siguiente para la navegación con flechas entre marcas (foco itinerante). */
export function indiceConTecla(tecla: string, actual: number, total: number): number | null {
  if (total <= 0) return null;
  switch (tecla) {
    case 'ArrowRight':
    case 'ArrowDown':
      return Math.min(total - 1, actual + 1);
    case 'ArrowLeft':
    case 'ArrowUp':
      return Math.max(0, actual - 1);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

/**
 * Ancho del elemento en px, actualizado con `ResizeObserver` (si existe). Así los gráficos
 * dibujan en píxeles reales y el texto conserva su tamaño en 360, 768 o 1366 px.
 * `objetivo` se resuelve tras el primer renderizado. Debe llamarse en un contexto de inyección.
 */
export function anchoObservado(
  objetivo: () => HTMLElement | null | undefined,
  inicial = 640,
): Signal<number> {
  const ancho = signal(inicial);
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    const el = objetivo();
    if (!el) return;
    const medir = (valor: number) => {
      if (valor > 0) ancho.set(Math.round(valor));
    };
    medir(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver((entradas) => {
      for (const e of entradas) medir(e.contentRect.width);
    });
    observador.observe(el);
    destroyRef.onDestroy(() => observador.disconnect());
  });
  return ancho.asReadonly();
}

let contador = 0;

/** Prefijo único para los `id` de cada gráfico (título, descripción, contenido). */
export function idUnico(prefijo: string): string {
  contador += 1;
  return `${prefijo}-${contador}`;
}
