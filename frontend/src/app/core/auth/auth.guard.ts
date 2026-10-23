import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { AuthService } from './auth.service';
import { rutaInicioPorRol } from './roles';

/** Exige sesión válida (`GET /auth/sesion`). Sin sesión, redirige a `/login`. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .verificarSesion()
    .pipe(map((usuario) => (usuario ? true : router.createUrlTree(['/login']))));
};

/** Para `/login`: si ya hay sesión, lleva al inicio del rol. */
export const invitadoGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .verificarSesion()
    .pipe(
      map((usuario) => (usuario ? router.createUrlTree([rutaInicioPorRol(usuario.rol)]) : true)),
    );
};

/** Para la raíz `/`: redirige al inicio del rol o a `/login`. */
export const inicioPorRolGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .verificarSesion()
    .pipe(
      map((usuario) => router.createUrlTree([usuario ? rutaInicioPorRol(usuario.rol) : '/login'])),
    );
};
