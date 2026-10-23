import { LOCALE } from '../../../shared/utils/fecha-lima';

/** Formato de cifras del tablero (es-PE: «1,234», «12.5 %»). */

const entero = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 });
const unDecimal = new Intl.NumberFormat(LOCALE, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Texto que se muestra cuando una tasa no tiene denominador (nunca «0 %»). */
export const NO_CALCULABLE = 'No calculable';

/** Espacio fino no separable entre la cifra y su unidad («12.5 %», «8 min»). */
const ESPACIO = ' ';

export function formatearEntero(valor: number): string {
  return entero.format(valor);
}

/** «12.5 %»; `null` → «No calculable». */
export function formatearTasa(tasa: number | null | undefined): string {
  return tasa === null || tasa === undefined || Number.isNaN(tasa)
    ? NO_CALCULABLE
    : `${unDecimal.format(tasa)}${ESPACIO}%`;
}

/** «12.4 min»; `null` → «No calculable». */
export function formatearMinutos(valor: number | null | undefined): string {
  return valor === null || valor === undefined || Number.isNaN(valor)
    ? NO_CALCULABLE
    : `${unDecimal.format(valor)}${ESPACIO}min`;
}

/** Porcentaje de una parte sobre el total con un decimal («16.7 %»); 0 si el total es 0. */
export function porcentaje(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;
}

/** «1 cita» / «12 citas». */
export function plural(n: number, uno: string, varios: string): string {
  return `${formatearEntero(n)} ${n === 1 ? uno : varios}`;
}
