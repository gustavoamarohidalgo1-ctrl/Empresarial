import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/**
 * Pide el token CSRF (`GET /auth/csrf`) al arrancar, antes del primer POST
 * (el login también lo exige). Si el servidor no responde, la app arranca igual:
 * `AuthService.login()` vuelve a pedir el token cuando haga falta.
 */
export function provideCsrfInicial(): EnvironmentProviders {
  return provideAppInitializer(() => {
    const auth = inject(AuthService);
    return firstValueFrom(
      auth.obtenerCsrf().pipe(
        timeout(5000),
        catchError(() => of(undefined)),
      ),
    );
  });
}
