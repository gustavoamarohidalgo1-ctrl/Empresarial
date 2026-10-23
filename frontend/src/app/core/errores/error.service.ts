import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { ErrorCampo, Operacion } from '../modelos/contrato';
import { codigoDe, problemaDe } from './problema';

export { codigoDe, problemaDe };

/** Error ya traducido para mostrar al usuario. Nunca contiene trazas ni datos técnicos. */
export interface ErrorUsuario {
  status: number;
  codigo: string | null;
  mensaje: string;
  errores: ErrorCampo[];
  requestId: string | null;
  sinConexion: boolean;
}

/**
 * Mensajes por `codigo` del contrato. Se usan cuando el servidor no envía un `detail` (o
 * `mensaje`) concreto, p. ej. en las operaciones rechazadas que se consultan en `/operaciones`.
 */
export const MENSAJES_POR_CODIGO: Readonly<Record<string, string>> = {
  VALIDACION: 'Revisa los datos marcados e inténtalo de nuevo.',
  IDEMPOTENCY_KEY_REQUERIDA: 'No pudimos procesar la solicitud. Inténtalo de nuevo.',
  NO_AUTENTICADO: 'Tu sesión terminó. Inicia sesión de nuevo.',
  CREDENCIALES_INVALIDAS: 'No pudimos iniciar sesión. Revisa tu correo y tu contraseña.',
  ACCESO_DENEGADO: 'No tienes permiso para realizar esta acción.',
  CSRF_INVALIDO: 'Tu sesión de seguridad se renovó. Vuelve a intentarlo.',
  CITA_NO_ENCONTRADA: 'No encontramos esta cita.',
  RECURSO_NO_ENCONTRADO: 'No encontramos lo que buscabas.',
  VERSION_OBSOLETA: 'La cita cambió. Actualiza la vista antes de continuar.',
  CONFLICTO_CONCURRENTE: 'Otra operación cambió la cita al mismo tiempo. Actualiza la vista.',
  HORARIO_NO_DISPONIBLE:
    'El horario elegido ya no está disponible. Tu cita conserva el horario anterior.',
  IDEMPOTENCIA_CONFLICTO:
    'Esta operación ya se había registrado con otros datos. Actualiza la vista antes de continuar.',
  TRANSICION_NO_PERMITIDA: 'La acción ya no es válida para el estado actual de la cita.',
  FUERA_DE_PLAZO: 'La acción está fuera del plazo permitido.',
  MOTIVO_INVALIDO: 'El motivo elegido no es válido. Elige otro motivo.',
  DATOS_PRE_CHECK_IN_INVALIDOS: 'Debes confirmar que tus datos son correctos.',
  LLEGADA_YA_REGISTRADA: 'La llegada ya estaba registrada para esta cita.',
  // Ampliación v1.1
  CORREO_REGISTRADO:
    'Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
  CONTRASENA_INCORRECTA: 'La contraseña actual no es correcta.',
  ENLACE_INVALIDO:
    'El enlace para restablecer la contraseña no es válido, ya venció o ya se usó. Pide uno nuevo.',
  LIMITE_CITAS:
    'No puedes reservar esta cita: ya tienes el máximo de citas activas, una de esta especialidad ese día u otra cita que se cruza con este horario.',
  DEMASIADOS_INTENTOS: 'Hiciste demasiados intentos. Espera unos minutos e inténtalo de nuevo.',
  ERROR_INTERNO: 'Ocurrió un error inesperado. Inténtalo más tarde.',
};

const MENSAJE_SIN_CONEXION =
  'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
const MENSAJE_SERVIDOR = 'Ocurrió un error inesperado en el servidor. Inténtalo más tarde.';
const MENSAJE_GENERICO = 'No se pudo completar la acción. Inténtalo de nuevo.';

/**
 * Minutos de espera según `Retry-After` (segundos, o una fecha HTTP), redondeados hacia arriba.
 * `null` si la cabecera no está o no se entiende.
 */
export function minutosDeEspera(
  retryAfter: string | null | undefined,
  ahora = Date.now(),
): number | null {
  const valor = retryAfter?.trim();
  if (!valor) return null;
  const segundos = /^\d+$/.test(valor) ? Number(valor) : (Date.parse(valor) - ahora) / 1000;
  if (!Number.isFinite(segundos) || segundos <= 0) return null;
  return Math.max(1, Math.ceil(segundos / 60));
}

/** 429 sin detalle del servidor: genérico, con el tiempo de espera si se conoce. */
function mensajeDemasiadosIntentos(minutos: number | null): string {
  if (minutos === null) return MENSAJES_POR_CODIGO['DEMASIADOS_INTENTOS'];
  return `Hiciste demasiados intentos. Inténtalo de nuevo en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}.`;
}

/** Campos con el texto concreto que puede traer una respuesta del servidor. */
interface TextoServidor {
  detail?: unknown;
  mensaje?: unknown;
}

/** Texto concreto del servidor: `detail` (RFC 9457) o, si no, `mensaje`. */
function detalleDe(fuente: TextoServidor | null | undefined): string | null {
  for (const texto of [fuente?.detail, fuente?.mensaje]) {
    if (typeof texto === 'string' && texto.trim()) return texto.trim();
  }
  return null;
}

function mensajePorStatus(status: number): string {
  if (status === 0) return MENSAJE_SIN_CONEXION;
  if (status >= 500) return MENSAJE_SERVIDOR;
  switch (status) {
    case 400:
      return 'Revisa los datos ingresados.';
    case 401:
      return MENSAJES_POR_CODIGO['NO_AUTENTICADO'];
    case 403:
      return MENSAJES_POR_CODIGO['ACCESO_DENEGADO'];
    case 404:
      return 'No encontramos lo que buscabas.';
    case 409:
      return 'Los datos cambiaron mientras trabajabas. Actualiza la vista.';
    case 429:
      return MENSAJES_POR_CODIGO['DEMASIADOS_INTENTOS'];
    default:
      return MENSAJE_GENERICO;
  }
}

/**
 * Servicio central de errores: traduce `application/problem+json` (RFC 9457) a mensajes
 * para el usuario. Prefiere el texto concreto del servidor (`detail` o `mensaje`, p. ej. «Ya
 * tienes una cita de Cardiología el …» o «Inténtalo nuevamente en 12 minutos») y, si no lo hay,
 * el mensaje por `codigo` o por estado HTTP (un 429 sin cuerpo usa `Retry-After`). Los 5xx
 * siempre muestran un mensaje genérico con el `requestId`.
 */
@Injectable({ providedIn: 'root' })
export class ErrorService {
  traducir(error: unknown): ErrorUsuario {
    if (!(error instanceof HttpErrorResponse)) {
      return {
        status: -1,
        codigo: null,
        mensaje: MENSAJE_GENERICO,
        errores: [],
        requestId: null,
        sinConexion: false,
      };
    }

    const status = error.status;
    const problema = problemaDe(error);
    const codigo = problema?.codigo ?? null;
    const requestId = problema?.requestId ?? error.headers?.get('X-Request-Id') ?? null;
    const errores = Array.isArray(problema?.errores) ? problema.errores : [];

    let mensaje: string;
    const detalle = detalleDe(problema);
    if (status === 0) {
      mensaje = MENSAJE_SIN_CONEXION;
    } else if (status >= 500 || codigo === 'ERROR_INTERNO') {
      // El detalle queda en el log del servidor; el usuario solo ve el código de referencia.
      mensaje = MENSAJES_POR_CODIGO['ERROR_INTERNO'];
      if (requestId) mensaje += ` Código de referencia: ${requestId}.`;
    } else if (detalle) {
      mensaje = detalle;
    } else if (status === 429) {
      mensaje = mensajeDemasiadosIntentos(minutosDeEspera(error.headers?.get('Retry-After')));
    } else if (codigo && MENSAJES_POR_CODIGO[codigo]) {
      mensaje = MENSAJES_POR_CODIGO[codigo];
    } else {
      mensaje = mensajePorStatus(status);
    }

    return { status, codigo, mensaje, errores, requestId, sinConexion: status === 0 };
  }

  /**
   * Traduce una operación `RECHAZADA` consultada en `/operaciones/{clave}`. Si la operación
   * trae un texto concreto (`mensaje` o `detail`), se prefiere a los mensajes por código.
   */
  desdeOperacion(operacion: Operacion): ErrorUsuario {
    const codigo = operacion.codigoError;
    const mensaje =
      detalleDe(operacion as unknown as TextoServidor) ||
      (codigo && MENSAJES_POR_CODIGO[codigo]) ||
      mensajePorStatus(operacion.httpStatus);
    return {
      status: operacion.httpStatus,
      codigo,
      mensaje,
      errores: [],
      requestId: null,
      sinConexion: false,
    };
  }

  /** Agrupa `errores[]` por nombre de campo para mostrarlos junto a cada control. */
  erroresPorCampo(error: ErrorUsuario): Record<string, string> {
    const resultado: Record<string, string> = {};
    for (const e of error.errores) {
      if (e?.campo && !resultado[e.campo]) {
        resultado[e.campo] = e.mensaje;
      }
    }
    return resultado;
  }
}
