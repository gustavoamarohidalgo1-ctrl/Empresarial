import { ResumenIndicadores } from '../../../core/modelos/contrato';
import {
  formatearDiaLargo,
  formatearFechaSinHora,
  partesCalendarioLima,
  sumarDias,
} from '../../../shared/utils/fecha-lima';

/** Series del gráfico de barras apiladas, en el orden en que se apilan (de la base hacia arriba). */
export type IdSerie = 'completadas' | 'noAsistio' | 'canceladas' | 'resto';

export interface DefinicionSerie {
  id: IdSerie;
  etiqueta: string;
  /** Explicación breve (leyenda y tabla). */
  ayuda: string;
  /** Con trama diagonal además del color (segundo canal de identidad). */
  trama: boolean;
}

export const SERIES_DIA: readonly DefinicionSerie[] = [
  { id: 'completadas', etiqueta: 'Completadas', ayuda: 'Atención terminada', trama: false },
  { id: 'noAsistio', etiqueta: 'Sin asistencia', ayuda: 'No asistió', trama: true },
  { id: 'canceladas', etiqueta: 'Canceladas', ayuda: 'Canceladas', trama: false },
  {
    id: 'resto',
    etiqueta: 'Otras',
    ayuda: 'Pendientes, confirmadas o en curso',
    trama: false,
  },
];

export type Granularidad = 'dia' | 'semana' | 'mes';

export const TITULO_GRANULARIDAD: Readonly<Record<Granularidad, string>> = {
  dia: 'Citas por día',
  semana: 'Citas por semana',
  mes: 'Citas por mes',
};

export interface PuntoSerie {
  /** Fecha `YYYY-MM-DD` del primer día del grupo. */
  clave: string;
  /** Etiqueta corta del eje («6 oct»). */
  corta: string;
  /** Etiqueta completa («Martes, 6 de octubre de 2026», «Del 06 oct 2026 al 12 oct 2026»). */
  larga: string;
  total: number;
  completadas: number;
  noAsistio: number;
  canceladas: number;
  /** Total − completadas − sin asistencia − canceladas (nunca negativo). */
  resto: number;
}

type FilaDia = ResumenIndicadores['porDia'][number];

/** Con más de dos meses de días, las barras diarias serían ilegibles: se agrupan. */
export function granularidadPara(dias: number): Granularidad {
  if (dias <= 62) return 'dia';
  if (dias <= 190) return 'semana';
  return 'mes';
}

const MES_LARGO = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, -((dia + 6) % 7));
}

function corta(fecha: string): string {
  const p = partesCalendarioLima(`${fecha}T12:00:00Z`);
  return p ? `${p.dia} ${p.mes}` : fecha;
}

/** Agrupa `porDia` por día, semana (lunes a domingo) o mes, en orden cronológico. */
export function agruparPorPeriodo(
  porDia: readonly FilaDia[],
  granularidad: Granularidad,
): PuntoSerie[] {
  const grupos = new Map<string, { filas: FilaDia[] }>();
  const ordenados = [...porDia].sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (const fila of ordenados) {
    const clave =
      granularidad === 'dia'
        ? fila.fecha
        : granularidad === 'semana'
          ? lunesDe(fila.fecha)
          : fila.fecha.slice(0, 7);
    const grupo = grupos.get(clave) ?? { filas: [] };
    grupo.filas.push(fila);
    grupos.set(clave, grupo);
  }

  return [...grupos.values()].map(({ filas }) => {
    const primera = filas[0].fecha;
    const ultima = filas[filas.length - 1].fecha;
    const suma = (k: 'total' | 'completadas' | 'canceladas' | 'noAsistio') =>
      filas.reduce((acc, f) => acc + (f[k] ?? 0), 0);
    const total = suma('total');
    const completadas = suma('completadas');
    const canceladas = suma('canceladas');
    const noAsistio = suma('noAsistio');
    let etiquetaCorta: string;
    let larga: string;
    if (granularidad === 'dia') {
      etiquetaCorta = corta(primera);
      larga = formatearDiaLargo(`${primera}T12:00:00Z`);
    } else if (granularidad === 'semana') {
      etiquetaCorta = corta(primera);
      larga =
        primera === ultima
          ? formatearFechaSinHora(primera)
          : `Del ${formatearFechaSinHora(primera)} al ${formatearFechaSinHora(ultima)}`;
    } else {
      const p = partesCalendarioLima(`${primera}T12:00:00Z`);
      etiquetaCorta = p ? `${p.mes} ${p.anio.slice(2)}` : primera.slice(0, 7);
      const mes = MES_LARGO.format(new Date(`${primera}T12:00:00Z`));
      larga = mes.charAt(0).toUpperCase() + mes.slice(1);
    }
    return {
      clave: primera,
      corta: etiquetaCorta,
      larga,
      total,
      completadas,
      noAsistio,
      canceladas,
      resto: Math.max(0, total - completadas - canceladas - noAsistio),
    };
  });
}
