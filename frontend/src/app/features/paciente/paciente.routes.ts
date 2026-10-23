import { Routes } from '@angular/router';

/** Rutas del paciente. La guarda de rol (`PACIENTE`) está en la ruta padre `/paciente`. */
export const PACIENTE_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'citas' },
  {
    path: 'citas',
    title: 'Mis citas',
    loadComponent: () => import('./mis-citas/mis-citas').then((m) => m.MisCitasComponent),
  },
  {
    path: 'citas/:id',
    title: 'Detalle de cita',
    loadComponent: () => import('./detalle-cita/detalle-cita').then((m) => m.DetalleCitaComponent),
  },
  {
    path: 'citas/:id/reprogramar',
    title: 'Reprogramar cita',
    loadComponent: () =>
      import('./reprogramar-cita/reprogramar-cita').then((m) => m.ReprogramarCitaComponent),
  },
  {
    path: 'citas/:id/cancelar',
    title: 'Cancelar cita',
    loadComponent: () =>
      import('./cancelar-cita/cancelar-cita').then((m) => m.CancelarCitaComponent),
  },
  {
    path: 'citas/:id/pre-check-in',
    title: 'Pre-check-in',
    loadComponent: () => import('./pre-check-in/pre-check-in').then((m) => m.PreCheckInComponent),
  },
  {
    path: 'reservar',
    title: 'Reservar cita',
    loadComponent: () => import('./reservar/reservar').then((m) => m.ReservarCitaComponent),
  },
  {
    path: 'notificaciones',
    title: 'Notificaciones',
    loadComponent: () =>
      import('./notificaciones/notificaciones').then((m) => m.NotificacionesComponent),
  },
  {
    path: 'perfil',
    title: 'Mi perfil',
    loadComponent: () => import('./perfil/perfil').then((m) => m.PerfilComponent),
  },
];
