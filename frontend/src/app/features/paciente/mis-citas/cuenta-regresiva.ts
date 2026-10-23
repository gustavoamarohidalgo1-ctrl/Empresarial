import { EstadoCita } from '../../../core/modelos/contrato';
import { EntradaFecha, cuentaRegresivaLima, diasHastaLima } from '../../../shared/utils/fecha-lima';

/** Estados en los que la cita todavía va a ocurrir o está ocurriendo. */
export const ESTADOS_ACTIVOS: ReadonlySet<EstadoCita> = new Set<EstadoCita>([
  'PENDIENTE',
  'CONFIRMADA',
  'CHECK_IN',
  'EN_ESPERA',
  'EN_ATENCION',
]);

/**
 * Cuenta regresiva legible (días de calendario de Lima) solo para citas activas que aún no
 * pasaron: «hoy a las 09:00», «mañana a las 09:00», «en 3 días». `null` en otro caso.
 */
export function cuentaRegresiva(
  inicio: EntradaFecha,
  estado: EstadoCita,
  ahora: Date,
): string | null {
  if (!ESTADOS_ACTIVOS.has(estado)) return null;
  const dias = diasHastaLima(inicio, ahora);
  if (dias === null || dias < 0) return null;
  return cuentaRegresivaLima(inicio, ahora) || null;
}

/** «en 3 días» → «En 3 días». */
export function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
