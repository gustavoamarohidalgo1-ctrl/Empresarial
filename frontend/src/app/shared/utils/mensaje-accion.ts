import { TipoAviso } from '../../core/avisos/aviso-flash.service';
import { ErrorUsuario } from '../../core/errores/error.service';
import { mensajeResultadoIncierto } from '../../core/idempotencia/idempotencia.service';

/** Mensaje de resultado de una acción, listo para pintar en un `app-aviso`. */
export interface MensajeAccion {
  tipo: TipoAviso;
  titulo: string;
  texto: string;
  /** Texto secundario (p. ej. un problema al recargar después de un éxito). */
  detalle?: string;
  /** Mostrar «Reintentar» (misma clave de idempotencia). */
  reintentar?: boolean;
  /** Mostrar «Actualizar» (recargar la vista sin reintentar). */
  actualizar?: boolean;
}

/** Rechazo definitivo del servidor. Ofrece actualizar cuando la cita pudo haber cambiado. */
export function mensajeRechazo(error: ErrorUsuario): MensajeAccion {
  return {
    tipo: 'error',
    titulo: 'No se guardó',
    texto: error.mensaje,
    actualizar: [404, 409, 422].includes(error.status),
  };
}

/** Resultado desconocido: se ofrece reintentar con la misma clave. Nunca se afirma éxito ni rechazo. */
export function mensajeIncierto(estado: 'no-registrada' | 'sin-confirmar'): MensajeAccion {
  return {
    tipo: 'advertencia',
    titulo: estado === 'no-registrada' ? 'La operación no se registró' : 'Resultado sin confirmar',
    texto: mensajeResultadoIncierto(estado),
    reintentar: true,
  };
}

/** ¿El error al cargar una cita por ID equivale a «no encontrada»? (404, o 400 por ID mal formado). */
export function esCitaNoEncontrada(error: ErrorUsuario): boolean {
  return error.status === 404 || (error.status === 400 && error.codigo === 'VALIDACION');
}
