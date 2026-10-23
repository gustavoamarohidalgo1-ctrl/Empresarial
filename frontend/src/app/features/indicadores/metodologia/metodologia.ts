import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { formatearFechaHora } from '../../../shared/utils/fecha-lima';

/** Definiciones del apartado 13.5 (docs/reglas-dominio.md) en lenguaje claro. */
export const DEFINICIONES_METODOLOGIA: readonly { termino: string; definicion: string }[] = [
  {
    termino: 'Citas del periodo',
    definicion:
      'Se cuentan las citas cuyo horario vigente al momento del corte cae dentro del periodo elegido. Si una cita se reprogramó, cuenta en la fecha de su horario actual, una sola vez.',
  },
  {
    termino: 'Confirmación',
    definicion:
      'Porcentaje de citas del periodo confirmadas para su horario vigente. Una confirmación hecha antes de reprogramar no cuenta: hay que volver a confirmar.',
  },
  {
    termino: 'Cancelación',
    definicion: 'Porcentaje de citas del periodo que estaban canceladas al momento del corte.',
  },
  {
    termino: 'Reprogramación',
    definicion:
      'Porcentaje de citas del periodo que se reprogramaron al menos una vez hasta el corte. Una cita reprogramada varias veces cuenta una sola vez; el total de reprogramaciones se indica aparte.',
  },
  {
    termino: 'Inasistencia',
    definicion:
      'Citas sin asistencia sobre las citas vencidas no canceladas, es decir, las que ya debieron atenderse. Es «Provisional» mientras queden citas vencidas por clasificar.',
  },
  {
    termino: 'Espera promedio',
    definicion:
      'Minutos entre el registro de la llegada del paciente y el inicio de su atención. Se excluyen las atenciones con datos incompletos.',
  },
  {
    termino: 'No calculable',
    definicion:
      'Se muestra cuando no hay citas para calcular la tasa (denominador cero). Nunca se muestra como 0 %.',
  },
];

/**
 * Nota de metodología plegable (`<details>`): definiciones de los indicadores, corte y zona
 * horaria. Cerrada por defecto para no competir con los datos.
 */
@Component({
  selector: 'app-metodologia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <details class="tarjeta tarjeta--suave met">
      <summary class="met__resumen">
        <app-icono nombre="info" />
        <span>Cómo se calculan estos indicadores</span>
        <app-icono class="met__chevron" nombre="chevron-down" />
      </summary>
      <div class="met__cuerpo">
        <dl class="met__lista">
          @for (d of definiciones; track d.termino) {
            <div>
              <dt>{{ d.termino }}</dt>
              <dd>{{ d.definicion }}</dd>
            </div>
          }
        </dl>
        <p class="met__pie">
          @if (corte(); as c) {
            Corte de los datos: <time [attr.datetime]="c.iso">{{ c.texto }}</time> (el instante de
            la consulta).
          }
          Todas las fechas y horas están en hora de Lima ({{ zonaHoraria() }}). Las tasas se
          redondean a un decimal.
        </p>
      </div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }

    .met {
      padding: 0;
    }

    .met__resumen {
      --icono-tamano: 1.125rem;
      display: flex;
      align-items: center;
      gap: var(--e-2);
      min-height: var(--alto-control);
      padding: var(--e-3) var(--e-5);
      border-radius: var(--r-tarjeta);
      font-weight: 600;
      cursor: pointer;
      list-style: none;
    }

    .met__resumen::-webkit-details-marker {
      display: none;
    }

    .met__resumen > app-icono:first-child {
      color: var(--c-primario);
    }

    .met__chevron {
      margin-inline-start: auto;
      color: var(--c-texto-2);
      transition: transform var(--dur-2) var(--curva);
    }

    .met[open] .met__chevron {
      transform: rotate(180deg);
    }

    .met__cuerpo {
      padding: 0 var(--e-5) var(--e-5);
    }

    .met__lista {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
      gap: var(--e-4) var(--e-6);
      margin: 0;
    }

    .met__lista dt {
      font-weight: 600;
    }

    .met__lista dd {
      margin: var(--e-1) 0 0;
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .met__pie {
      margin: var(--e-5) 0 0;
      padding-top: var(--e-4);
      border-top: 1px solid var(--c-borde);
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }
  `,
})
export class MetodologiaComponent {
  /** Instante del corte (ISO UTC) o `null` si aún no hay datos. */
  readonly corteIso = input<string | null>(null);
  readonly zonaHoraria = input('America/Lima');

  protected readonly definiciones = DEFINICIONES_METODOLOGIA;
  protected readonly corte = computed(() => {
    const iso = this.corteIso();
    return iso ? { iso, texto: formatearFechaHora(iso) } : null;
  });
}
