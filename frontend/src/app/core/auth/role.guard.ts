import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { Rol } from '../modelos/contrato';
import { AuthService } from './auth.service';

/**
 * Exige que el rol del usuario esté en `data.roles` de la ruta.
 * Sin sesión → `/login`; con otro rol → `/acceso-denegado`.
 * Es independiente de `authGuard` (Angular puede evaluar las guardas en paralelo).
 */
export const roleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const roles = (route.data['roles'] ?? []) as readonly Rol[];
  return auth.verificarSesion().pipe(
    map((usuario) => {
      if (!usuario) return router.createUrlTree(['/login']);
      return roles.includes(usuario.rol) ? true : router.createUrlTree(['/acceso-denegado']);
    }),
  );
};
