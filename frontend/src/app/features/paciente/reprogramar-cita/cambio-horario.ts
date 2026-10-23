import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CitaResumen, HorarioDisponible } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { FichaFechaComponent } from '../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../shared/ui/icono/icono';

/**
 * Resumen «de → a» de una reprogramación: horario actual y nuevo horario (o un hueco con
 * «Elige un día y una hora»). Lado a lado si hay espacio; apilado con flecha hacia abajo si no
 * (consulta de contenedor). Fechas en America/Lima; el hueco reserva el alto de la ficha.
 */
@Component({
  selector: 'app-cambio-horario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FechaLimaPipe, FichaFechaComponent, IconoComponent],
  template: `
    <div class="cambio" role="group" aria-label="Cambio de horario">
      <div class="cambio__lado">
        <p class="cambio__etiqueta">Horario actual</p>
        <div class="cambio__dato">
          <app-ficha-fecha [fecha]="actual().inicio" tamano="sm" />
          <div class="cambio__texto">
            <p class="cambio__hora">
              <time [attr.datetime]="actual().inicio">{{ actual().inicio | fechaLima: 'hora' }}</time>
            </p>
            <p class="cambio__sede">{{ actual().sede.nombre }}</p>
          </div>
        </div>
      </div>
      <span class="cambio__flecha" aria-hidden="true"><app-icono nombre="arrow-right" /></span>
      <div class="cambio__lado cambio__lado--nuevo">
        <p class="cambio__etiqueta">Nuevo horario</p>
        @if (nuevo(); as h) {
          <div class="cambio__dato">
            <app-ficha-fecha [fecha]="h.inicio" tamano="sm" destacada />
            <div class="cambio__texto">
              <p class="cambio__hora">
                <time [attr.datetime]="h.inicio">{{ h.inicio | fechaLima: 'hora' }}</time>
              </p>
              <p class="cambio__sede">{{ h.sede.nombre }}</p>
            </div>
          </div>
        } @else {
          <p class="cambio__vacio">Elige un día y una hora</p>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
      margin-bottom: var(--e-5);
    }

    .cambio {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
      gap: var(--e-2);
    }

    .cambio__lado {
      min-width: 0;
      padding: var(--e-3);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-control);
      background: var(--c-superficie-2);
    }

    .cambio__lado--nuevo {
      border-color: var(--c-primario-borde);
      background: var(--c-primario-tenue);
    }

    .cambio__etiqueta {
      margin: 0 0 var(--e-2);
      color: var(--c-texto-2);
      font-size: var(--t-12);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .cambio__lado--nuevo .cambio__etiqueta {
      color: var(--c-primario-fuerte);
    }

    .cambio__dato {
      display: flex;
      align-items: center;
      gap: var(--e-3);
    }

    .cambio__texto {
      min-width: 0;
    }

    .cambio__texto p {
      margin: 0;
    }

    .cambio__hora {
      font-size: var(--t-20);
      font-weight: 700;
      line-height: 1.2;
    }

    .cambio__sede {
      color: var(--c-texto-2);
      font-size: var(--t-13);
      overflow-wrap: anywhere;
    }

    .cambio__vacio {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 4.5rem;
      margin: 0;
      padding: var(--e-2);
      border: 1px dashed var(--c-borde-control);
      border-radius: var(--r-sm);
      color: var(--c-texto-2);
      font-size: var(--t-14);
      text-align: center;
    }

    .cambio__flecha {
      display: flex;
      align-self: center;
      justify-self: center;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: 1px solid var(--c-borde);
      border-radius: 50%;
      background: var(--c-superficie);
      color: var(--c-primario);
      --icono-tamano: 1rem;
    }

    @container (max-width: 26rem) {
      .cambio {
        grid-template-columns: minmax(0, 1fr);
      }

      .cambio__flecha {
        margin-block: calc(-1 * var(--e-1));
        transform: rotate(90deg);
      }
    }
  `,
})
export class CambioHorarioComponent {
  readonly actual = input.required<CitaResumen>();
  readonly nuevo = input<HorarioDisponible | null>(null);
}
