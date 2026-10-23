import { inject } from '@angular/core';
import { CanMatchFn } from '@angular/router';
import { map } from 'rxjs';
import { SistemaService } from './sistema.service';

/**
 * Rutas solo para el entorno de desarrollo (p. ej. `/dev/buzon`). Si `GET /sistema/info` no
 * confirma «desarrollo» (también si falla), la ruta no coincide y el router sigue con la
 * siguiente: la página 404, sin cargar el código de la ruta ni llamar a su API.
 */
export const soloDesarrolloGuard: CanMatchFn = () =>
  inject(SistemaService)
    .obtener()
    .pipe(map((info) => info?.entorno === 'desarrollo'));
