import { Routes } from '@angular/router';
import { authGuard, inicioPorRolGuard, invitadoGuard } from './core/auth/auth.guard';
import { roleGuard } from './core/auth/role.guard';
import { Rol } from './core/modelos/contrato';
import { soloDesarrolloGuard } from './core/sistema/desarrollo.guard';

/**
 * Rutas. Las lazy se precargan en tiempo ocioso según el rol (`core/precarga`): las que
 * llevan `data.roles` solo para ese rol; las públicas llevan `data.precarga: false`.
 */
export const routes: Routes = [
  {
    // Página pública de presentación; con sesión iniciada redirige al inicio del rol.
    path: '',
    pathMatch: 'full',
    title: 'Atención ambulatoria sin esperas',
    data: { precarga: false },
    canActivate: [invitadoGuard],
    loadComponent: () =>
      import('./features/publico/landing/landing').then((m) => m.LandingComponent),
  },
  {
    path: 'registro',
    title: 'Crear cuenta',
    data: { precarga: false },
    canActivate: [invitadoGuard],
    loadComponent: () =>
      import('./features/auth/registro/registro').then((m) => m.RegistroComponent),
  },
  {
    path: 'recuperar',
    title: 'Recuperar contraseña',
    data: { precarga: false },
    canActivate: [invitadoGuard],
    loadComponent: () =>
      import('./features/auth/recuperar/recuperar').then((m) => m.RecuperarComponent),
  },
  {
    path: 'restablecer',
    title: 'Restablecer contraseña',
    data: { precarga: false },
    loadComponent: () =>
      import('./features/auth/restablecer/restablecer').then((m) => m.RestablecerComponent),
  },
  {
    path: 'privacidad',
    title: 'Política de privacidad',
    data: { precarga: false },
    loadComponent: () =>
      import('./features/publico/privacidad/privacidad').then((m) => m.PrivacidadComponent),
  },
  {
    path: 'accesibilidad',
    title: 'Accesibilidad',
    data: { precarga: false },
    loadComponent: () =>
      import('./features/publico/accesibilidad/accesibilidad').then(
        (m) => m.AccesibilidadComponent,
      ),
  },
  {
    // Solo en el entorno de desarrollo; en producción no coincide y se ve la página 404 (el
    // backend también responde 404).
    path: 'dev/buzon',
    title: 'Buzón de correo simulado',
    data: { precarga: false },
    canMatch: [soloDesarrolloGuard],
    loadComponent: () => import('./features/dev/buzon/buzon').then((m) => m.BuzonComponent),
  },
  {
    path: 'login',
    title: 'Iniciar sesión',
    canActivate: [invitadoGuard],
    data: { precarga: false },
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'paciente',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['PACIENTE'] satisfies Rol[] },
    loadChildren: () =>
      import('./features/paciente/paciente.routes').then((m) => m.PACIENTE_ROUTES),
  },
  {
    path: 'operador',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['OPERADOR'] satisfies Rol[] },
    loadChildren: () =>
      import('./features/operador/operador.routes').then((m) => m.OPERADOR_ROUTES),
  },
  {
    path: 'indicadores',
    title: 'Indicadores',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['RESPONSABLE', 'ADMINISTRADOR'] satisfies Rol[] },
    loadComponent: () =>
      import('./features/indicadores/indicadores').then((m) => m.IndicadoresComponent),
  },
  {
    // Cualquier rol con sesión: cambio de contraseña. Poco frecuente: se carga al abrirla.
    path: 'cuenta/seguridad',
    title: 'Seguridad de la cuenta',
    canActivate: [authGuard],
    data: { precarga: false },
    loadComponent: () =>
      import('./features/cuenta/seguridad/pagina-seguridad').then(
        (m) => m.PaginaSeguridadComponent,
      ),
  },
  {
    path: 'admin/bitacora',
    title: 'Bitácora',
    canActivate: [authGuard, roleGuard],
    data: { roles: ['ADMINISTRADOR'] satisfies Rol[] },
    loadComponent: () =>
      import('./features/admin/bitacora/bitacora').then((m) => m.BitacoraComponent),
  },
  {
    // Inicio de cada rol (`rutaInicioPorRol`), o `/login` sin sesión. La guarda siempre redirige.
    path: 'inicio',
    pathMatch: 'full',
    canActivate: [inicioPorRolGuard],
    children: [],
  },
  {
    path: 'acceso-denegado',
    title: 'Acceso denegado',
    data: { precarga: false },
    loadComponent: () =>
      import('./features/auth/acceso-denegado/acceso-denegado').then(
        (m) => m.AccesoDenegadoComponent,
      ),
  },
  {
    path: '**',
    title: 'Página no encontrada',
    data: { precarga: false },
    loadComponent: () =>
      import('./shared/paginas/no-encontrada/no-encontrada').then((m) => m.NoEncontradaComponent),
  },
];
