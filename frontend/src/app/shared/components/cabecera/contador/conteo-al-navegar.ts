import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { NotificacionesService } from '../../../../core/notificaciones/notificaciones.service';

/**
 * Pone al día el contador de no leídas del paciente al cambiar de página (p. ej. tras reservar,
 * cuando el aviso «Reserva registrada» se crea después de la respuesta).
 *
 * La primera navegación de cada paciente (la del inicio de sesión o la de la carga de la app) no
 * pide nada: `NotificacionesService` ya consultó el contador al empezar la sesión, y así no se
 * piden dos conteos a la vez. Lo crea el contador de la cabecera; es único en la app.
 */
@Injectable({ providedIn: 'root' })
export class ConteoAlNavegar {
  constructor() {
    const auth = inject(AuthService);
    const notificaciones = inject(NotificacionesService);
    /** Paciente de la navegación anterior; `undefined` antes de la primera. */
    let anterior: string | null | undefined;
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(inject(DestroyRef)),
      )
      .subscribe(() => {
        const usuario = auth.usuario();
        const paciente = usuario?.rol === 'PACIENTE' ? usuario.id : null;
        if (paciente !== null && paciente === anterior) notificaciones.refrescarConteo();
        anterior = paciente;
      });
  }
}
