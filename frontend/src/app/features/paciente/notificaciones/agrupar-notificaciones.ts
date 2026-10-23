import { NotificacionPaciente, TipoNotificacion } from '../../../core/modelos/contrato';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import {
  claveDiaLima,
  formatearDiaLargo,
  hoyEnLima,
  sumarDias,
} from '../../../shared/utils/fecha-lima';

/** Notificaciones de un mismo día de Lima. */
export interface GrupoNotificaciones {
  /** `YYYY-MM-DD` en Lima. */
  clave: string;
  /** «Hoy», «Ayer» o «Miércoles, 4 de noviembre de 2026». */
  titulo: string;
  notificaciones: NotificacionPaciente[];
}

export const ICONO_NOTIFICACION: Readonly<Record<TipoNotificacion, NombreIcono>> = {
  RECORDATORIO: 'bell',
  CAMBIO: 'calendar-clock',
};

export const ETIQUETA_NOTIFICACION: Readonly<Record<TipoNotificacion, string>> = {
  RECORDATORIO: 'Recordatorio',
  CAMBIO: 'Cambio en tu cita',
};

/** «Hoy», «Ayer» o el día completo («Miércoles, 21 de octubre de 2026»), en hora de Lima. */
export function tituloDia(clave: string, ahora: Date = new Date()): string {
  const hoy = hoyEnLima(ahora);
  if (clave === hoy) return 'Hoy';
  if (clave === sumarDias(hoy, -1)) return 'Ayer';
  // Mediodía UTC = 07:00 en Lima: el mismo día de calendario.
  return formatearDiaLargo(`${clave}T12:00:00Z`);
}

/** Ordena de la más reciente a la más antigua y agrupa por día de Lima. */
export function agruparPorDia(
  notificaciones: readonly NotificacionPaciente[],
  ahora: Date = new Date(),
): GrupoNotificaciones[] {
  const grupos = new Map<string, GrupoNotificaciones>();
  const ordenadas = [...notificaciones].sort(
    (a, b) => Date.parse(b.creadaEn) - Date.parse(a.creadaEn),
  );
  for (const n of ordenadas) {
    const clave = claveDiaLima(n.creadaEn);
    let grupo = grupos.get(clave);
    if (!grupo) {
      grupo = { clave, titulo: tituloDia(clave, ahora), notificaciones: [] };
      grupos.set(clave, grupo);
    }
    grupo.notificaciones.push(n);
  }
  return [...grupos.values()];
}
