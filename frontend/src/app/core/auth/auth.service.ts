import { HttpClient, HttpErrorResponse, HttpXsrfTokenExtractor } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  map,
  of,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { api } from '../http/api';
import { codigoDe } from '../errores/problema';
import { Credenciales, CsrfRespuesta, UsuarioSesion } from '../modelos/contrato';

function esCsrfInvalido(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    error.status === 403 &&
    codigoDe(error) === 'CSRF_INVALIDO'
  );
}

/**
 * Sesión del usuario. La identidad vive en la cookie HttpOnly del servidor; aquí solo se
 * guarda en memoria (signal) el `UsuarioSesion` devuelto por la API. Nada va a localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly xsrf = inject(HttpXsrfTokenExtractor);

  private readonly usuarioActual = signal<UsuarioSesion | null>(null);
  private verificacionEnCurso: Observable<UsuarioSesion | null> | null = null;

  readonly usuario = this.usuarioActual.asReadonly();
  readonly autenticado = computed(() => this.usuarioActual() !== null);

  /** `GET /auth/csrf`: el servidor escribe la cookie `XSRF-TOKEN`. */
  obtenerCsrf(): Observable<void> {
    return this.http.get<CsrfRespuesta>(api('/auth/csrf')).pipe(map(() => undefined));
  }

  /** Pide el token CSRF solo si la cookie aún no existe. */
  asegurarCsrf(): Observable<void> {
    return this.xsrf.getToken() ? of(undefined) : this.obtenerCsrf();
  }

  /**
   * `POST /auth/login`. El login también exige CSRF: se asegura el token antes y, si el
   * servidor responde `CSRF_INVALIDO`, se renueva y se intenta una sola vez más.
   * El token sigue siendo válido después del login (docs/api.md), así que no se vuelve a pedir.
   */
  login(credenciales: Credenciales): Observable<UsuarioSesion> {
    const enviar = () => this.http.post<UsuarioSesion>(api('/auth/login'), credenciales);
    return this.asegurarCsrf().pipe(
      switchMap(() => enviar()),
      catchError((error: unknown) =>
        esCsrfInvalido(error)
          ? this.obtenerCsrf().pipe(switchMap(() => enviar()))
          : throwError(() => error),
      ),
      tap((usuario) => this.usuarioActual.set(usuario)),
    );
  }

  /**
   * `POST /auth/logout`. La sesión local solo se da por cerrada si el servidor la cerró (2xx)
   * o si ya no existía (401). Ante `CSRF_INVALIDO` renueva el token y reintenta una vez.
   * Cualquier otro error se propaga y la sesión local se conserva: sigue activa en el servidor.
   */
  logout(): Observable<void> {
    const enviar = () => this.http.post<void>(api('/auth/logout'), null);
    return enviar().pipe(
      catchError((error: unknown) =>
        esCsrfInvalido(error)
          ? this.obtenerCsrf().pipe(switchMap(() => enviar()))
          : throwError(() => error),
      ),
      catchError((error: unknown) =>
        error instanceof HttpErrorResponse && error.status === 401
          ? of(null)
          : throwError(() => error),
      ),
      map(() => this.limpiarSesion()),
    );
  }

  /**
   * Devuelve el usuario de la sesión. Si aún no se conoce, consulta `GET /auth/sesion`
   * (una sola petición compartida aunque varias guardas pregunten a la vez).
   * Devuelve `null` si no hay sesión (401) o si no se pudo verificar.
   */
  verificarSesion(): Observable<UsuarioSesion | null> {
    const actual = this.usuarioActual();
    if (actual) return of(actual);
    if (!this.verificacionEnCurso) {
      this.verificacionEnCurso = this.http.get<UsuarioSesion>(api('/auth/sesion')).pipe(
        tap((usuario) => this.usuarioActual.set(usuario)),
        catchError(() => of(null)),
        finalize(() => (this.verificacionEnCurso = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.verificacionEnCurso;
  }

  /**
   * Descarta el usuario en caché y lo vuelve a pedir al servidor (p. ej. tras un 403, por si el
   * rol cambió en otra pestaña).
   */
  revalidarSesion(): Observable<UsuarioSesion | null> {
    this.usuarioActual.set(null);
    return this.verificarSesion();
  }

  limpiarSesion(): void {
    this.usuarioActual.set(null);
  }

  /**
   * Registra en memoria el usuario de una sesión que el servidor acaba de abrir por otra vía
   * (p. ej. `POST /auth/registro`, que responde `UsuarioSesion` con la cookie nueva).
   */
  establecerSesion(usuario: UsuarioSesion): void {
    this.usuarioActual.set(usuario);
  }
}
