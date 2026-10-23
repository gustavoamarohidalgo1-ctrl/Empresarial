import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconoComponent } from '../../../../shared/ui/icono/icono';
import { presentacionResultado } from '../formato-auditoria';

/**
 * Píldora del resultado de una entrada de auditoría: icono + texto (el color solo refuerza).
 * Se anuncia «Resultado: Denegado».
 */
@Component({
  selector: 'app-resultado-auditoria',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `<span class="ra" [attr.data-tono]="p().tono"
    ><app-icono class="ra__icono" [nombre]="p().icono" [trazo]="2" /><span class="solo-lectores"
      >Resultado: </span
    >{{ p().etiqueta }}</span
  >`,
  styles: `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    .ra {
      --tono: var(--c-exito);
      --tono-fondo: var(--c-exito-suave);
      display: inline-flex;
      align-items: center;
      gap: 0.3125rem;
      padding: 0.125rem 0.625rem 0.125rem 0.4375rem;
      border: 1px solid color-mix(in srgb, var(--tono) 28%, transparent);
      border-radius: var(--r-pildora);
      background: var(--tono-fondo);
      color: var(--tono);
      font-size: var(--t-13);
      font-weight: 600;
      line-height: 1.4;
      white-space: nowrap;
    }

    .ra[data-tono='advertencia'] {
      --tono: var(--c-advertencia);
      --tono-fondo: var(--c-advertencia-suave);
    }

    .ra[data-tono='error'] {
      --tono: var(--c-error);
      --tono-fondo: var(--c-error-suave);
    }

    .ra__icono {
      --icono-tamano: 0.9375rem;
    }

    @media (forced-colors: active) {
      .ra {
        border-color: CanvasText;
      }
    }
  `,
})
export class ResultadoAuditoriaComponent {
  readonly resultado = input.required<string>();
  protected readonly p = computed(() => presentacionResultado(this.resultado()));
}
