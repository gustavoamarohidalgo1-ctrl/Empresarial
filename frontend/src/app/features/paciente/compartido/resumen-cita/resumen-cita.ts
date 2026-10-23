import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { CitaResumen } from '../../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../../shared/pipes/fecha-lima.pipe';
import { FichaFechaComponent } from '../../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../../shared/ui/icono/icono';

/**
 * Resumen compacto de una cita para las pantallas de acción (cancelar, pre-check-in):
 * ficha de calendario, horario y especialidad, profesional y sede con icono.
 * Fechas y horas SIEMPRE en America/Lima. Alto fijo de la ficha (md: 4.75rem) para el esqueleto.
 *
 * Uso: `<app-resumen-cita [cita]="c" />`
 */
@Component({
  selector: 'app-resumen-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FechaLimaPipe, FichaFechaComponent, IconoComponent],
  template: `
    @let c = cita();
    <app-ficha-fecha [fecha]="c.inicio" destacada />
    <div class="rc__cuerpo">
      <p class="rc__hora">
        <span
          ><time [attr.datetime]="c.inicio">{{ c.inicio | fechaLima: 'hora' }}</time
          ><span aria-hidden="true"> – </span><span class="solo-lectores"> a </span
          ><time [attr.datetime]="c.fin">{{ c.fin | fechaLima: 'hora' }}</time></span
        >
        <span class="rc__zona"> (hora de Lima)</span>
      </p>
      <ul class="rc__datos">
        <li>
          <app-icono nombre="stethoscope" /><span class="solo-lectores">Especialidad: </span
          >{{ c.especialidad.nombre }}
        </li>
        <li>
          <app-icono nombre="user" /><span class="solo-lectores">Profesional: </span
          >{{ c.profesional.nombre }}
        </li>
        <li>
          <app-icono nombre="building" /><span class="solo-lectores">Sede: </span
          >{{ c.sede.nombre }}
        </li>
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--e-4);
      min-width: 0;
    }

    .rc__cuerpo {
      flex: 1 1 auto;
      min-width: 0;
    }

    .rc__hora {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 var(--e-2);
      margin: 0 0 var(--e-1);
      color: var(--c-texto);
      font-size: var(--t-20);
      font-weight: 700;
      letter-spacing: -0.01em;
      line-height: 1.3;
    }

    .rc__zona {
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 500;
      letter-spacing: 0;
    }

    .rc__datos {
      display: flex;
      flex-wrap: wrap;
      gap: var(--e-1) var(--e-4);
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--c-texto-2);
      font-size: var(--t-14);
      --icono-tamano: 1rem;
    }

    .rc__datos li {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
      min-width: 0;
      overflow-wrap: anywhere;
    }
  `,
})
export class ResumenCitaComponent {
  readonly cita = input.required<CitaResumen>();
}
