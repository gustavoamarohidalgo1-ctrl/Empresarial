import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of } from 'rxjs';
import { api } from '../http/api';
import { ErrorService, ErrorUsuario, problemaDe } from '../errores/error.service';
import { Operacion } from '../modelos/contrato';

export const CABECERA_IDEMPOTENCIA = 'Idempotency-Key';

/**
 * Resultado de una operación idempotente. Solo hay éxito o rechazo cuando se sabe:
 * - `exito`: el servidor respondió 2xx con los datos.
 * - `exito-verificado`: la respuesta se perdió, pero `/operaciones/{clave}` dice COMPLETADA
 *   (hay que recargar los datos: no tenemos el cuerpo de la respuesta).
 * - `rechazada`: el servidor respondió un error, o `/operaciones/{clave}` dice RECHAZADA.
 * - `no-registrada`: la respuesta se perdió y la operación no existe (404): se puede
 *   reintentar con la MISMA clave.
 * - `sin-confirmar`: no se pudo saber el resultado (la consulta también falló). Reintentar con
 *   la misma clave es seguro: si ya se había guardado, el servidor devuelve lo guardado.
 */
export type ResultadoOperacion<T> =
  | { estado: 'exito'; datos: T }
  | { estado: 'exito-verificado'; operacion: Operacion }
  | { estado: 'rechazada'; error: ErrorUsuario }
  | { estado: 'no-registrada'; clave: string }
  | { estado: 'sin-confirmar'; clave: string };

/** Genera un UUID v4. Usa `crypto.randomUUID()` y, fuera de contexto seguro, `getRandomValues`. */
export function generarClave(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Una intención del usuario (p. ej. «confirmar CIT001»). Conserva la misma clave mientras
 * el contenido no cambie, para que los reintentos de esa intención reutilicen la clave.
 * Si el contenido cambia, es otra intención y recibe otra clave (evita 409 IDEMPOTENCIA_CONFLICTO).
 */
export class IntencionIdempotente {
  private clave: string | null = null;
  private huella: string | null = null;

  constructor(private readonly generar: () => string = generarClave) {}

  /** Clave para este contenido: la misma en los reintentos; nueva si el contenido cambia. */
  clavePara(contenido: unknown): string {
    const huella = JSON.stringify(contenido ?? null);
    if (this.clave === null || this.huella !== huella) {
      this.clave = this.generar();
      this.huella = huella;
    }
    return this.clave;
  }

  get claveActual(): string | null {
    return this.clave;
  }

  /** Cierra la intención cuando ya hay un resultado definitivo (éxito o rechazo). */
  cerrar(): void {
    this.clave = null;
    this.huella = null;
  }
}

/**
 * ¿Se perdió la respuesta? Error de red (status 0) o un fallo de pasarela sin cuerpo
 * problem+json (el proxy no obtuvo respuesta del backend): el servidor pudo haber
 * procesado la operación, así que hay que consultarla antes de decir nada.
 */
export function esRespuestaPerdida(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  if (error.status === 0) return true;
  return [502, 503, 504].includes(error.status) && problemaDe(error) === null;
}

@Injectable({ providedIn: 'root' })
export class IdempotenciaService {
  private readonly http = inject(HttpClient);
  private readonly errores = inject(ErrorService);

  nuevaIntencion(): IntencionIdempotente {
    return new IntencionIdempotente();
  }

  /**
   * Ejecuta la petición con la cabecera `Idempotency-Key` de la intención.
   * `contenido` identifica la intención (normalmente, el cuerpo y el recurso).
   * Cierra la intención solo cuando el resultado es definitivo.
   */
  ejecutar<T>(
    intencion: IntencionIdempotente,
    contenido: unknown,
    peticion: (cabeceras: HttpHeaders) => Observable<T>,
  ): Observable<ResultadoOperacion<T>> {
    const clave = intencion.clavePara(contenido);
    return this.ejecutarConClave(clave, peticion).pipe(
      map((resultado) => {
        if (
          resultado.estado === 'exito' ||
          resultado.estado === 'exito-verificado' ||
          resultado.estado === 'rechazada'
        ) {
          intencion.cerrar();
        }
        return resultado;
      }),
    );
  }

  /** Ejecuta con una clave dada. Si la respuesta se pierde, consulta `/operaciones/{clave}`. */
  ejecutarConClave<T>(
    clave: string,
    peticion: (cabeceras: HttpHeaders) => Observable<T>,
  ): Observable<ResultadoOperacion<T>> {
    const cabeceras = new HttpHeaders({ [CABECERA_IDEMPOTENCIA]: clave });
    return peticion(cabeceras).pipe(
      map((datos): ResultadoOperacion<T> => ({ estado: 'exito', datos })),
      catchError((error: unknown) => {
        if (esRespuestaPerdida(error)) {
          return this.consultar<T>(clave);
        }
        return of<ResultadoOperacion<T>>({
          estado: 'rechazada',
          error: this.errores.traducir(error),
        });
      }),
    );
  }

  /** `GET /operaciones/{clave}`: averigua qué pasó con una operación cuya respuesta se perdió. */
  consultar<T>(clave: string): Observable<ResultadoOperacion<T>> {
    return this.http.get<Operacion>(api(`/operaciones/${encodeURIComponent(clave)}`)).pipe(
      map((operacion): ResultadoOperacion<T> => {
        if (operacion?.estado === 'COMPLETADA') {
          return { estado: 'exito-verificado', operacion };
        }
        if (operacion?.estado === 'RECHAZADA') {
          return { estado: 'rechazada', error: this.errores.desdeOperacion(operacion) };
        }
        return { estado: 'sin-confirmar', clave };
      }),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return of<ResultadoOperacion<T>>({ estado: 'no-registrada', clave });
        }
        return of<ResultadoOperacion<T>>({ estado: 'sin-confirmar', clave });
      }),
    );
  }
}

/** Mensaje para los resultados en los que no se sabe si la operación se guardó. */
export function mensajeResultadoIncierto(estado: 'no-registrada' | 'sin-confirmar'): string {
  return estado === 'no-registrada'
    ? 'No recibimos respuesta y comprobamos que la operación no llegó a registrarse. Puedes reintentarla con seguridad.'
    : 'No recibimos respuesta y aún no sabemos si la operación se guardó. Reintenta: si ya se había guardado, no se duplicará.';
}
