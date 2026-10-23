import { HttpErrorResponse } from '@angular/common/http';
import { ProblemDetail } from '../modelos/contrato';

/*
 * Lectura del cuerpo problem+json (RFC 9457). Separado de `error.service.ts` para que el
 * interceptor y la sesión (carga inicial) no arrastren los mensajes de error al bundle inicial.
 */

/** Devuelve el cuerpo `application/problem+json` si la respuesta lo trae. */
export function problemaDe(error: unknown): ProblemDetail | null {
  if (!(error instanceof HttpErrorResponse)) return null;
  const cuerpo: unknown = error.error;
  if (cuerpo && typeof cuerpo === 'object') {
    const p = cuerpo as ProblemDetail;
    if (
      typeof p.codigo === 'string' ||
      typeof p.detail === 'string' ||
      typeof p.title === 'string'
    ) {
      return p;
    }
  }
  if (typeof cuerpo === 'string' && cuerpo.trim().startsWith('{')) {
    try {
      return JSON.parse(cuerpo) as ProblemDetail;
    } catch {
      return null;
    }
  }
  return null;
}

/** Código de error del contrato (`codigo`) o `null`. */
export function codigoDe(error: unknown): string | null {
  return problemaDe(error)?.codigo ?? null;
}
