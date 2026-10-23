import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { codigoDe } from '../errores/problema';

/** Rutas donde un 401/403 lo maneja quien hizo la petición (login, verificación de sesión). */
const RUTAS_AUTENTICACION = ['/auth/login', '/auth/logout', '/auth/sesion', '/auth/csrf'];

function esRutaDeAutenticacion(url: string): boolean {
  return RUTAS_AUTENTICACION.some((ruta) => url.includes(ruta));
}

/**
 * Reacciones globales a errores de sesión:
 * - 401 fuera del login: limpia la sesión local y vuelve a `/login`.
 * - 403 `CSRF_INVALIDO`: renueva el token CSRF (quien llamó muestra el mensaje).
 * - Otro 403 (`ACCESO_DENEGADO`): vuelve a verificar `/auth/sesion` (el rol pudo cambiar en otra
 *   pestaña; así no se forma un bucle con el usuario en caché) y muestra la página de acceso denegado.
 * El error se propaga siempre para que el componente decida qué mostrar.
 */
export const sesionInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && !esRutaDeAutenticacion(req.url)) {
        if (error.status === 401) {
          auth.limpiarSesion();
          void router.navigate(['/login'], { queryParams: { sesion: 'expirada' } });
        } else if (error.status === 403) {
          if (codigoDe(error) === 'CSRF_INVALIDO') {
            auth.obtenerCsrf().subscribe({ error: () => undefined });
          } else {
            auth.revalidarSesion().subscribe(() => void router.navigate(['/acceso-denegado']));
          }
        }
      }
      return throwError(() => error);
    }),
  );
};
