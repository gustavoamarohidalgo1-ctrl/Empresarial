import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { NotificacionesService } from '../../../../core/notificaciones/notificaciones.service';
import { ConteoAlNavegar } from './conteo-al-navegar';

/** Texto del contador de no leídas: «3», o «9+» a partir de 10. */
export function textoContador(total: number): string {
  return total > 9 ? '9+' : String(total);
}

/**
 * Indicador de notificaciones sin leer del paciente (`NotificacionesService.noLeidas`).
 * - `numero`: insignia con la cifra («9+» desde 10) y «, N sin leer» para lectores de pantalla.
 * - `punto`: punto decorativo y «, tienes notificaciones sin leer» para lectores de pantalla
 *   (p. ej. dentro del botón del menú móvil, cuyo nombre accesible completa).
 * Sin no leídas no pinta nada.
 *
 * La cabecera lo carga en diferido (`componenteDiferido`) y solo para el paciente: así `NotificacionesService` (y su
 * sondeo) no forma parte del bundle inicial. También activa `ConteoAlNavegar`.
 */
@Component({
  selector: 'app-contador-no-leidas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      @if (variante() === 'numero') {
        <span class="insignia-numero" aria-hidden="true">{{ texto() }}</span>
        <span class="solo-lectores">, {{ total() }} sin leer</span>
      } @else {
        <span class="insignia-punto" aria-hidden="true"></span>
        <span class="solo-lectores">, tienes notificaciones sin leer</span>
      }
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .insignia-numero {
      display: inline-grid;
      place-items: center;
      min-width: 1.375rem;
      height: 1.375rem;
      padding-inline: var(--e-1);
      border-radius: var(--r-pildora);
      background: var(--c-peligro);
      color: var(--c-sobre-peligro);
      font-size: var(--t-12);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      line-height: 1;
    }

    .insignia-punto {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      width: 0.75rem;
      height: 0.75rem;
      border: 2px solid var(--c-superficie);
      border-radius: 50%;
      background: var(--c-peligro);
    }
  `,
})
export class ContadorNoLeidasComponent {
  readonly variante = input<'numero' | 'punto'>('numero');
  protected readonly total = inject(NotificacionesService).noLeidas;
  protected readonly texto = computed(() => textoContador(this.total()));

  constructor() {
    inject(ConteoAlNavegar);
  }
}
