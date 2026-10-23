import { CacheService } from '../../../core/cache/cache.service';
import { CitaDetalle } from '../../../core/modelos/contrato';

/** Clave de la caché en memoria para el perfil del paciente (docs/diseno.md § 7.6). */
export const CLAVE_PERFIL = 'perfil';

/** Clave de la caché en memoria para el detalle de una cita (docs/diseno.md § 7.6). */
export function claveCita(id: string): string {
  return `cita:${id}`;
}

/**
 * Tras una acción del paciente que terminó bien (reprogramar, cancelar, pre-check-in):
 * - guarda la cita que devolvió el servidor para que el detalle la pinte al instante, o
 *   la invalida si no la tenemos (respuesta perdida pero operación COMPLETADA);
 * - invalida las listas (`citas:*`) y la línea de tiempo de esa cita.
 * No se cachea ninguna otra respuesta de la mutación.
 */
export function registrarAccionEnCache(
  cache: CacheService,
  id: string,
  cita: CitaDetalle | null,
): void {
  if (cita) cache.guardar(claveCita(id), cita);
  else cache.invalidar(claveCita(id));
  cache.invalidarPrefijo('citas:');
  cache.invalidar(`${claveCita(id)}:linea-tiempo`);
}
