import { Routes } from '@angular/router';

/** Rutas del operador. La guarda de rol (`OPERADOR`) está en la ruta padre `/operador`. */
export const OPERADOR_ROUTES: Routes = [
  {
    path: '',
    title: 'Panel del operador',
    loadComponent: () => import('./panel/panel-operador').then((m) => m.PanelOperadorComponent),
  },
];
