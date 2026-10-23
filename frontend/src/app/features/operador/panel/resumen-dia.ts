import { AccionOperador, CitaOperador, EstadoCita } from '../../../core/modelos/contrato';
import { NombreIcono } from '../../../shared/ui/icono/iconos';

/**
 * Agrupación de estados para los indicadores y los filtros del panel del operador.
 * Sigue el recorrido del paciente en la sede:
 * por llegar (pendiente o confirmada) → en espera (llegada registrada o en espera)
 * → en atención → completada; las canceladas y ausencias quedan aparte.
 */
export type GrupoEstado = 'por-llegar' | 'en-espera' | 'en-atencion' | 'completadas' | 'cerradas';

export type FiltroPanel = 'todas' | GrupoEstado;

export const GRUPO_DE_ESTADO: Readonly<Record<EstadoCita, GrupoEstado>> = {
  PENDIENTE: 'por-llegar',
  CONFIRMADA: 'por-llegar',
  CHECK_IN: 'en-espera',
  EN_ESPERA: 'en-espera',
  EN_ATENCION: 'en-atencion',
  COMPLETADA: 'completadas',
  CANCELADA: 'cerradas',
  NO_ASISTIO: 'cerradas',
};

export interface OpcionFiltro {
  id: FiltroPanel;
  etiqueta: string;
}

/** Chips de filtro, en el orden del recorrido del paciente. */
export const FILTROS_PANEL: readonly OpcionFiltro[] = [
  { id: 'todas', etiqueta: 'Todas' },
  { id: 'por-llegar', etiqueta: 'Por llegar' },
  { id: 'en-espera', etiqueta: 'En espera' },
  { id: 'en-atencion', etiqueta: 'En atención' },
  { id: 'completadas', etiqueta: 'Completadas' },
  { id: 'cerradas', etiqueta: 'Canceladas o ausentes' },
];

/** Icono de cada acción del operador (docs/diseno.md § iconos sugeridos). */
export const ICONO_ACCION_OPERADOR: Readonly<Record<AccionOperador, NombreIcono>> = {
  REGISTRAR_LLEGADA: 'map-pin',
  PASAR_A_ESPERA: 'hourglass',
  INICIAR_ATENCION: 'stethoscope',
  COMPLETAR: 'check-check',
};

export type ConteoFiltros = Readonly<Record<FiltroPanel, number>>;

export interface ResumenDia {
  conteo: ConteoFiltros;
  /** Citas que siguen su curso (total menos canceladas y ausencias). */
  activas: number;
  /** Porcentaje entero de citas activas ya completadas (0 si no hay activas). */
  progreso: number;
  /** Inicio (ISO UTC) de la primera cita por llegar, o `null`. */
  siguiente: string | null;
  /** Minutos de la espera más larga desde la llegada (solo para el día de hoy), o `null`. */
  mayorEsperaMin: number | null;
}

export function contarPorFiltro(citas: readonly CitaOperador[]): ConteoFiltros {
  const conteo: Record<FiltroPanel, number> = {
    todas: citas.length,
    'por-llegar': 0,
    'en-espera': 0,
    'en-atencion': 0,
    completadas: 0,
    cerradas: 0,
  };
  for (const c of citas) {
    const grupo = GRUPO_DE_ESTADO[c.estado];
    if (grupo) conteo[grupo]++;
  }
  return conteo;
}

export function filtrarCitas(
  citas: readonly CitaOperador[],
  filtro: FiltroPanel,
): readonly CitaOperador[] {
  return filtro === 'todas' ? citas : citas.filter((c) => GRUPO_DE_ESTADO[c.estado] === filtro);
}

/**
 * Indicadores del día, calculados de la lista (ordenada por hora).
 * `ahora` solo se usa para la espera más larga, que únicamente tiene sentido si la lista es de hoy.
 */
export function resumirDia(
  citas: readonly CitaOperador[],
  ahora: number,
  esHoy: boolean,
): ResumenDia {
  const conteo = contarPorFiltro(citas);
  const activas = conteo.todas - conteo.cerradas;
  const progreso = activas > 0 ? Math.round((conteo.completadas / activas) * 100) : 0;

  let siguiente: string | null = null;
  let mayorEsperaMin: number | null = null;
  for (const c of citas) {
    const grupo = GRUPO_DE_ESTADO[c.estado];
    if (grupo === 'por-llegar' && (siguiente === null || c.inicio < siguiente)) {
      siguiente = c.inicio;
    }
    if (esHoy && grupo === 'en-espera' && c.llegadaRegistradaEn) {
      const llegada = Date.parse(c.llegadaRegistradaEn);
      if (!Number.isNaN(llegada)) {
        const minutos = Math.max(0, Math.floor((ahora - llegada) / 60_000));
        mayorEsperaMin = Math.max(mayorEsperaMin ?? 0, minutos);
      }
    }
  }
  return { conteo, activas, progreso, siguiente, mayorEsperaMin };
}

/** «menos de 1 min», «25 min», «1 h 05 min». */
export function formatearEspera(minutos: number): string {
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${String(resto).padStart(2, '0')} min`;
}

/** Ordena por hora de inicio (y por código si coinciden). */
export function ordenarCitas(citas: readonly CitaOperador[] | null | undefined): CitaOperador[] {
  return [...(citas ?? [])].sort(
    (a, b) => a.inicio.localeCompare(b.inicio) || a.codigo.localeCompare(b.codigo),
  );
}

/**
 * Combina una lista recién descargada con la que se está mostrando: si una cita local tiene una
 * `versionCita` mayor (la devolvió una transición mientras la consulta viajaba), se conserva la
 * local para no volver atrás. Así una actualización (manual o automática) nunca deshace una
 * acción recién guardada.
 */
export function fusionarCitas(
  frescas: readonly CitaOperador[],
  actuales: readonly CitaOperador[],
): CitaOperador[] {
  if (actuales.length === 0) return [...frescas];
  const porId = new Map(actuales.map((c) => [c.id, c]));
  return frescas.map((fresca) => {
    const local = porId.get(fresca.id);
    return local && local.versionCita > fresca.versionCita ? local : fresca;
  });
}
