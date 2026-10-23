import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, switchMap, tap, throwError } from 'rxjs';
import { codigoDe } from '../errores/problema';
import { api } from '../http/api';
import {
  CuerpoCambioContrasena,
  CuerpoRegistro,
  CuerpoRestablecer,
  UsuarioSesion,
} from '../modelos/contrato';
import { AuthService } from './auth.service';

function esCsrfInvalido(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 403 &&
    codigoDe(error) === 'CSRF_INVALIDO'
  );
}

/**
 * Operaciones de cuenta de la ampliación v1.1 (docs/api.md § «Cuenta»): registro,
 * recuperación y restablecimiento de contraseña (públicas, con CSRF) y cambio de contraseña
 * (con sesión). Igual que el login, se asegura el token CSRF antes de enviar y, si el servidor
 * responde `CSRF_INVALIDO`, se renueva y se intenta una sola vez más.
 */
@Injectable({ providedIn: 'root' })
export class CuentaService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * `POST /auth/registro` → 201 `UsuarioSesion` (rol `PACIENTE`). El servidor deja la sesión
   * iniciada, así que el usuario devuelto pasa a ser el de la sesión local.
   */
  registrar(cuerpo: CuerpoRegistro): Observable<UsuarioSesion> {
    return this.conCsrf(() => this.http.post<UsuarioSesion>(api('/auth/registro'), cuerpo)).pipe(
      tap((usuario) => this.auth.establecerSesion(usuario)),
    );
  }

  /** `POST /auth/recuperacion` → 202 siempre (no revela si el correo tiene cuenta). */
  solicitarRecuperacion(email: string): Observable<void> {
    return this.conCsrf(() => this.http.post<unknown>(api('/auth/recuperacion'), { email })).pipe(
      map(() => undefined),
    );
  }

  /** `POST /auth/restablecer` → 204. 422 `ENLACE_INVALIDO` si el enlace venció o ya se usó. */
  restablecer(cuerpo: CuerpoRestablecer): Observable<void> {
    return this.conCsrf(() => this.http.post<unknown>(api('/auth/restablecer'), cuerpo)).pipe(
      map(() => undefined),
    );
  }

  /**
   * `POST /cuenta/contrasena` (cualquier rol) → 204. 422 `CONTRASENA_INCORRECTA` si la actual no
   * coincide; 429 `DEMASIADOS_INTENTOS` durante el bloqueo por intentos fallidos.
   */
  cambiarContrasena(cuerpo: CuerpoCambioContrasena): Observable<void> {
    return this.conCsrf(() => this.http.post<unknown>(api('/cuenta/contrasena'), cuerpo)).pipe(
      map(() => undefined),
    );
  }

  private conCsrf<T>(enviar: () => Observable<T>): Observable<T> {
    return this.auth.asegurarCsrf().pipe(
      switchMap(() => enviar()),
      catchError((error: unknown) =>
        esCsrfInvalido(error)
          ? this.auth.obtenerCsrf().pipe(switchMap(() => enviar()))
          : throwError(() => error),
      ),
    );
  }
}
