import { Params } from '@angular/router';
import {
  esFechaIsoValida,
  formatearFechaSinHora,
  sumarDias,
} from '../../../shared/utils/fecha-lima';

/**
 * Filtro del tablero de indicadores y su reflejo en la URL (`queryParams`), para poder
 * compartir la vista. Las fechas son días de calendario de Lima (`YYYY-MM-DD`).
 */

export type PresetPeriodo =
  'este-mes' | 'ultimos-7' | 'ultimos-30' | 'mes-anterior' | 'personalizado';

export const PRESETS_PERIODO: readonly { id: PresetPeriodo; etiqueta: string }[] = [
  { id: 'este-mes', etiqueta: 'Este mes' },
  { id: 'ultimos-7', etiqueta: 'Últimos 7 días' },
  { id: 'ultimos-30', etiqueta: 'Últimos 30 días' },
  { id: 'mes-anterior', etiqueta: 'Mes anterior' },
  { id: 'personalizado', etiqueta: 'Personalizado' },
];

/** Periodo por defecto: el mismo que aplica el servidor sin parámetros (el mes en curso). */
export const PRESET_POR_DEFECTO = 'este-mes' satisfies PresetPeriodo;

/** Rango máximo que acepta `GET /analitica/resumen` (docs/api.md). */
export const RANGO_MAXIMO_DIAS = 366;

export type Dimension = 'sede' | 'especialidad' | 'profesional';
export const DIMENSIONES: readonly Dimension[] = ['sede', 'especialidad', 'profesional'];

export interface FiltroIndicadores {
  periodo: PresetPeriodo;
  desde: string;
  hasta: string;
  sede: string | null;
  especialidad: string | null;
  profesional: string | null;
}

/** Resultado de leer la URL: el filtro efectivo y, si el enlace traía algo inválido, por qué. */
export interface LecturaFiltro {
  filtro: FiltroIndicadores;
  aviso: string | null;
}

/** Códigos de catálogo aceptados en la URL (evita valores arbitrarios en la consulta). */
const PATRON_CODIGO = /^[A-Za-z0-9_-]{1,40}$/;

const esPreset = (valor: unknown): valor is PresetPeriodo =>
  PRESETS_PERIODO.some((p) => p.id === valor);

function primerDiaMes(fecha: string): string {
  return `${fecha.slice(0, 8)}01`;
}

function ultimoDiaMes(fecha: string): string {
  const [anio, mes] = fecha.split('-').map(Number);
  return new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
}

/** Desde y hasta de un preset, a partir de «hoy» en Lima. */
export function resolverPreset(
  preset: Exclude<PresetPeriodo, 'personalizado'>,
  hoy: string,
): { desde: string; hasta: string } {
  switch (preset) {
    case 'ultimos-7':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case 'ultimos-30':
      return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'mes-anterior': {
      const finAnterior = sumarDias(primerDiaMes(hoy), -1);
      return { desde: primerDiaMes(finAnterior), hasta: finAnterior };
    }
    default:
      return { desde: primerDiaMes(hoy), hasta: ultimoDiaMes(hoy) };
  }
}

/** Días de calendario entre dos fechas, ambos incluidos (1 si son el mismo día). */
export function diasIncluidos(desde: string, hasta: string): number {
  const aUtc = (iso: string) => {
    const [a, m, d] = iso.split('-').map(Number);
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((aUtc(hasta) - aUtc(desde)) / 86_400_000) + 1;
}

/** Valida un rango personalizado. Devuelve el mensaje de error o `null`. */
export function validarRango(desde: string, hasta: string): string | null {
  if (!esFechaIsoValida(desde)) return 'Escribe una fecha de inicio válida.';
  if (!esFechaIsoValida(hasta)) return 'Escribe una fecha de fin válida.';
  if (desde > hasta) return 'La fecha de inicio debe ser anterior o igual a la de fin.';
  if (diasIncluidos(desde, hasta) > RANGO_MAXIMO_DIAS) {
    return `El periodo puede abarcar como máximo ${RANGO_MAXIMO_DIAS} días.`;
  }
  return null;
}

function codigo(valor: string | null | undefined): string | null {
  const v = valor?.trim();
  return v && PATRON_CODIGO.test(v) ? v : null;
}

/** Filtro por defecto (este mes, sin otros filtros). */
export function filtroPorDefecto(hoy: string): FiltroIndicadores {
  return {
    periodo: PRESET_POR_DEFECTO,
    ...resolverPreset(PRESET_POR_DEFECTO, hoy),
    sede: null,
    especialidad: null,
    profesional: null,
  };
}

/**
 * Lee el filtro de los `queryParams`. Lo inválido se ignora (nunca rompe la vista) y se
 * explica en `aviso`. `desde`/`hasta` sin `periodo` se interpretan como «Personalizado».
 */
export function leerFiltro(
  parametro: (nombre: string) => string | null,
  hoy: string,
): LecturaFiltro {
  const base = filtroPorDefecto(hoy);
  const dimensiones = {
    sede: codigo(parametro('sede')),
    especialidad: codigo(parametro('especialidad')),
    profesional: codigo(parametro('profesional')),
  };
  const periodo = parametro('periodo');
  const desde = parametro('desde');
  const hasta = parametro('hasta');

  if (periodo === 'personalizado' || (!periodo && (desde || hasta))) {
    const error = validarRango(desde ?? '', hasta ?? '');
    if (error) {
      return {
        filtro: { ...base, ...dimensiones },
        aviso: 'El periodo del enlace no es válido. Mostramos el mes en curso.',
      };
    }
    return {
      filtro: { periodo: 'personalizado', desde: desde!, hasta: hasta!, ...dimensiones },
      aviso: null,
    };
  }

  if (periodo && !esPreset(periodo)) {
    return {
      filtro: { ...base, ...dimensiones },
      aviso: 'El periodo del enlace no es válido. Mostramos el mes en curso.',
    };
  }

  const preset = (periodo ?? PRESET_POR_DEFECTO) as Exclude<PresetPeriodo, 'personalizado'>;
  return {
    filtro: { periodo: preset, ...resolverPreset(preset, hoy), ...dimensiones },
    aviso: null,
  };
}

/**
 * `queryParams` de un filtro. Se omite lo que coincide con el valor por defecto para que la
 * URL quede corta; los atajos se guardan como atajo (la vista compartida sigue siendo
 * «Últimos 7 días» aunque se abra otro día) y el personalizado, con sus fechas.
 */
export function parametrosDeFiltro(filtro: FiltroIndicadores): Params {
  const params: Params = {
    periodo: filtro.periodo === PRESET_POR_DEFECTO ? null : filtro.periodo,
    desde: filtro.periodo === 'personalizado' ? filtro.desde : null,
    hasta: filtro.periodo === 'personalizado' ? filtro.hasta : null,
  };
  for (const d of DIMENSIONES) params[d] = filtro[d];
  return params;
}

/** Parámetros para la API (`desde`, `hasta` y los códigos elegidos). */
export function consultaApi(filtro: FiltroIndicadores): Record<string, string> {
  const consulta: Record<string, string> = { desde: filtro.desde, hasta: filtro.hasta };
  for (const d of DIMENSIONES) {
    const valor = filtro[d];
    if (valor) consulta[d] = valor;
  }
  return consulta;
}

/** Clave estable del filtro (para la caché y para no repetir consultas). */
export function claveFiltro(filtro: FiltroIndicadores): string {
  const c = consultaApi(filtro);
  return Object.keys(c)
    .sort()
    .map((k) => `${k}=${c[k]}`)
    .join('&');
}

/** «01 oct 2026 – 31 oct 2026» (o un solo día). */
export function textoRango(desde: string, hasta: string): string {
  const a = formatearFechaSinHora(desde);
  return desde === hasta ? a : `${a} – ${formatearFechaSinHora(hasta)}`;
}

/** Etiqueta del preset («Últimos 7 días»). */
export function etiquetaPreset(preset: PresetPeriodo): string {
  return PRESETS_PERIODO.find((p) => p.id === preset)?.etiqueta ?? '';
}
