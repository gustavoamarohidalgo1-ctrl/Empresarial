/**
 * Fechas de SIGA-SP. La API envía instantes ISO-8601 en UTC; la interfaz los muestra SIEMPRE
 * en America/Lima con `Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima' })`.
 * Nunca se usa la zona horaria del navegador.
 */

export const ZONA_LIMA = 'America/Lima';
export const LOCALE = 'es-PE';

const formatoFechaHora = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA_LIMA,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const formatoDiaLargo = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA_LIMA,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const formatoCalendario = new Intl.DateTimeFormat(LOCALE, {
  timeZone: ZONA_LIMA,
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const formatoIso = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_LIMA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export type EntradaFecha = string | number | Date | null | undefined;

function aFecha(valor: EntradaFecha): Date | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const fecha = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function partes(formato: Intl.DateTimeFormat, fecha: Date): Record<string, string> {
  const resultado: Record<string, string> = {};
  for (const parte of formato.formatToParts(fecha)) {
    if (parte.type !== 'literal') resultado[parte.type] = parte.value;
  }
  return resultado;
}

function mesCorto(valor: string): string {
  return valor.replace(/\.$/, '').toLowerCase();
}

/** «04 nov 2026, 09:00» (hora de Lima). */
export function formatearFechaHora(valor: EntradaFecha): string {
  const fecha = aFecha(valor);
  if (!fecha) return '';
  const p = partes(formatoFechaHora, fecha);
  return `${p['day']} ${mesCorto(p['month'])} ${p['year']}, ${p['hour']}:${p['minute']}`;
}

/** «04 nov 2026» (día en Lima). */
export function formatearFecha(valor: EntradaFecha): string {
  const fecha = aFecha(valor);
  if (!fecha) return '';
  const p = partes(formatoFechaHora, fecha);
  return `${p['day']} ${mesCorto(p['month'])} ${p['year']}`;
}

/** «09:00» (hora de Lima, 24 h). */
export function formatearHora(valor: EntradaFecha): string {
  const fecha = aFecha(valor);
  if (!fecha) return '';
  const p = partes(formatoFechaHora, fecha);
  return `${p['hour']}:${p['minute']}`;
}

/** «Miércoles, 4 de noviembre de 2026» (día en Lima). */
export function formatearDiaLargo(valor: EntradaFecha): string {
  const fecha = aFecha(valor);
  if (!fecha) return '';
  const texto = formatoDiaLargo.format(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Día local de Lima en formato `YYYY-MM-DD` (para agrupar o consultar por fecha). */
export function claveDiaLima(valor: EntradaFecha): string {
  const fecha = aFecha(valor);
  if (!fecha) return '';
  const p = partes(formatoIso, fecha);
  return `${p['year']}-${p['month']}-${p['day']}`;
}

/** Hoy en Lima, `YYYY-MM-DD`, sin importar la zona horaria del navegador. */
export function hoyEnLima(ahora: Date = new Date()): string {
  return claveDiaLima(ahora);
}

/** Suma días a una fecha sin hora `YYYY-MM-DD` (aritmética de calendario, sin zonas). */
export function sumarDias(fechaIso: string, dias: number): string {
  const [anio, mes, dia] = fechaIso.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias));
  return fecha.toISOString().slice(0, 10);
}

/** Formatea una fecha sin hora `YYYY-MM-DD` como «06 nov 2026». */
export function formatearFechaSinHora(fechaIso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) return '';
  // Mediodía UTC = 07:00 en Lima: el mismo día de calendario.
  return formatearFecha(`${fechaIso}T12:00:00Z`);
}

export function esFechaIsoValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split('-').map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

/** Partes de una «ficha de calendario» (día en Lima). */
export interface PartesCalendario {
  /** Día de Lima en formato `YYYY-MM-DD` (para `<time datetime>`). */
  iso: string;
  /** Día del mes sin cero inicial: «4». */
  dia: string;
  /** Mes abreviado en minúsculas, sin punto: «nov», «set». */
  mes: string;
  /** Día de la semana abreviado, sin punto: «mié». */
  diaSemana: string;
  anio: string;
}

/** `{ iso: '2026-11-04', dia: '4', mes: 'nov', diaSemana: 'mié', anio: '2026' }` (Lima). */
export function partesCalendarioLima(valor: EntradaFecha): PartesCalendario | null {
  const fecha = aFecha(valor);
  if (!fecha) return null;
  const p = partes(formatoCalendario, fecha);
  return {
    iso: claveDiaLima(fecha),
    dia: String(Number(p['day'])),
    mes: mesCorto(p['month']),
    diaSemana: p['weekday'].replace(/\.$/, '').toLowerCase(),
    anio: p['year'],
  };
}

/** Días de calendario (en Lima) entre hoy y la fecha: 0 = hoy, 1 = mañana, -1 = ayer. */
export function diasHastaLima(valor: EntradaFecha, ahora: Date = new Date()): number | null {
  const destino = claveDiaLima(valor);
  if (!destino) return null;
  const aUtc = (iso: string) => {
    const [anio, mes, dia] = iso.split('-').map(Number);
    return Date.UTC(anio, mes - 1, dia);
  };
  return Math.round((aUtc(destino) - aUtc(hoyEnLima(ahora))) / 86_400_000);
}

/**
 * Cuenta regresiva legible por días de calendario de Lima:
 * «hoy a las 09:00», «mañana a las 09:00», «en 3 días», «ayer», «hace 5 días».
 */
export function cuentaRegresivaLima(valor: EntradaFecha, ahora: Date = new Date()): string {
  const dias = diasHastaLima(valor, ahora);
  if (dias === null) return '';
  if (dias === 0) return `hoy a las ${formatearHora(valor)}`;
  if (dias === 1) return `mañana a las ${formatearHora(valor)}`;
  if (dias === -1) return 'ayer';
  return dias > 1 ? `en ${dias} días` : `hace ${-dias} días`;
}
