/**
 * Inactividad de la persona frente a la página.
 *
 * Cada consulta al servidor renueva la sesión, que caduca tras 30 min sin solicitudes. Las
 * consultas automáticas en segundo plano (contador de notificaciones del paciente, actualización
 * del panel del operador) se detienen tras 15 min sin interacción y se reanudan con la siguiente:
 * así una pestaña olvidada en un equipo compartido no mantiene la sesión abierta sin límite.
 */
export const LIMITE_INACTIVIDAD_MS = 15 * 60_000;

/** Interacciones que cuentan como actividad. Volver a la pestaña o mover el ratón no cuentan. */
export const EVENTOS_INTERACCION = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

/** Oyentes pasivos y en captura: no retrasan el desplazamiento y no los cortan otros oyentes. */
const OPCIONES_OYENTE: AddEventListenerOptions = { capture: true, passive: true };

/**
 * Llama a `alInteractuar` en cada interacción con el documento. Devuelve la función que retira
 * los oyentes (para `DestroyRef.onDestroy`).
 */
export function escucharInteraccion(
  documento: Document,
  alInteractuar: (evento: Event) => void,
): () => void {
  for (const tipo of EVENTOS_INTERACCION) {
    documento.addEventListener(tipo, alInteractuar, OPCIONES_OYENTE);
  }
  return () => {
    for (const tipo of EVENTOS_INTERACCION) {
      documento.removeEventListener(tipo, alInteractuar, OPCIONES_OYENTE);
    }
  };
}

/** ¿Pasó el límite de inactividad desde la última interacción (instantes en ms)? */
export function superaInactividad(ultimaInteraccion: number, ahora = Date.now()): boolean {
  return ahora - ultimaInteraccion >= LIMITE_INACTIVIDAD_MS;
}
