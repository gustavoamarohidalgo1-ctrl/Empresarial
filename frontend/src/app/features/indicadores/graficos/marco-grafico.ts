import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { IconoComponent } from '../../../shared/ui/icono/icono';

/**
 * Marco común de los gráficos: tarjeta con título (h2), descripción, conmutador
 * «Ver como tabla» (botón de alternancia con `aria-pressed`) y las dos vistas:
 * el gráfico (`[grafico]`) y su tabla equivalente (`[tabla]`). El gráfico usa el título
 * y la descripción como nombre y descripción accesibles (`idBase-titulo`, `idBase-descripcion`).
 */
@Component({
  selector: 'app-marco-grafico',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <section class="tarjeta mg" [attr.aria-labelledby]="idBase() + '-titulo'">
      <div class="mg__cabecera">
        <div class="mg__textos">
          <h2 class="mg__titulo" [id]="idBase() + '-titulo'">{{ titulo() }}</h2>
          <p class="mg__descripcion" [id]="idBase() + '-descripcion'">{{ descripcion() }}</p>
        </div>
        <button
          type="button"
          class="btn btn--sm mg__alternar"
          [attr.aria-pressed]="vistaTabla()"
          [attr.aria-controls]="idBase() + '-contenido'"
          (click)="vistaTabla.set(!vistaTabla())"
        >
          <app-icono nombre="file-text" />
          Ver como tabla
        </button>
      </div>
      <div class="mg__contenido" [id]="idBase() + '-contenido'">
        <div class="mg__vista" [hidden]="vistaTabla()"><ng-content select="[grafico]" /></div>
        <div class="mg__vista" [hidden]="!vistaTabla()"><ng-content select="[tabla]" /></div>
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .mg {
      display: flex;
      flex-direction: column;
      gap: var(--e-4);
      height: 100%;
    }

    .mg__cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--e-2) var(--e-4);
    }

    .mg__textos {
      flex: 1 1 16rem;
      min-width: 0;
    }

    .mg__titulo {
      margin: 0;
      font-size: var(--t-18);
    }

    .mg__descripcion {
      margin: var(--e-1) 0 0;
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .mg__alternar[aria-pressed='true'] {
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
    }

    .mg__contenido,
    .mg__vista {
      min-width: 0;
    }

    .mg__vista[hidden] {
      display: none;
    }
  `,
})
export class MarcoGraficoComponent {
  readonly titulo = input.required<string>();
  readonly descripcion = input.required<string>();
  /** Prefijo único de los `id` (lo genera el gráfico con `idUnico`). */
  readonly idBase = input.required<string>();

  /** `true` muestra la tabla equivalente en lugar del gráfico. */
  readonly vistaTabla = signal(false);
}
