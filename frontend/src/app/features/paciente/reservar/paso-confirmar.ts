import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Especialidad, HorarioReserva, SedeCatalogo } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { FichaFechaComponent } from '../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { cuentaRegresivaLima } from '../../../shared/utils/fecha-lima';

/**
 * Paso 4 · Revisar y confirmar: ficha de fecha, hora en Lima, especialidad, profesional y sede
 * (con dirección si el catálogo la trae), y qué podrá hacer después con la cita.
 */
@Component({
  selector: 'app-paso-confirmar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, FichaFechaComponent, IconoComponent, FechaLimaPipe],
  template: `
    @let h = horario();
    <div class="cuando">
      <app-ficha-fecha [fecha]="h.inicio" tamano="lg" destacada />
      <div class="cuando__textos">
        <p class="cuando__dia">{{ h.inicio | fechaLima: 'dia' }}</p>
        <p class="cuando__hora">
          <time [attr.datetime]="h.inicio">{{ h.inicio | fechaLima: 'hora' }}</time
          ><span aria-hidden="true"> – </span><span class="solo-lectores"> a </span
          ><time [attr.datetime]="h.fin">{{ h.fin | fechaLima: 'hora' }}</time>
        </p>
        <p class="cuando__zona">
          <span class="insignia insignia--marca">Hora de Lima</span>
          @if (cuenta(); as c) {
            <span class="cuando__cuenta">{{ c }}</span>
          }
        </p>
      </div>
    </div>

    <dl class="datos">
      <div class="datos__fila">
        <dt><app-icono nombre="stethoscope" /> Especialidad</dt>
        <dd>{{ especialidad().nombre }}</dd>
      </div>
      <div class="datos__fila">
        <dt><app-icono nombre="user" /> Profesional</dt>
        <dd>
          {{ h.profesional.nombre }}
          @if (asignado()) {
            <span class="datos__nota">Asignado según el horario que elegiste</span>
          }
        </dd>
      </div>
      <div class="datos__fila">
        <dt><app-icono nombre="building" /> Sede</dt>
        <dd>
          {{ sede()?.nombre ?? h.sede.nombre }}
          @if (sede()?.direccion; as d) {
            <span class="datos__nota"><app-icono nombre="map-pin" /> {{ d }}</span>
          }
        </dd>
      </div>
      <div class="datos__fila">
        <dt><app-icono nombre="clock" /> Hora</dt>
        <dd>
          {{ h.inicio | fechaLima: 'hora' }} a {{ h.fin | fechaLima: 'hora' }}
          <span class="datos__nota">Hora de Lima (UTC−5)</span>
        </dd>
      </div>
    </dl>

    <app-aviso tipo="info" titulo="Después de reservar">
      <p>
        Tu cita quedará <strong>Pendiente</strong>. Desde Mis citas podrás confirmarla,
        reprogramarla o cancelarla, y te enviaremos un recordatorio antes de la fecha.
      </p>
    </app-aviso>
  `,
  styles: `
    :host {
      display: block;
    }

    .cuando {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-4);
      margin-bottom: var(--e-5);
      padding: var(--e-4);
      border: 1px solid var(--c-primario-borde);
      border-radius: var(--r-tarjeta);
      background: var(--c-primario-tenue);
    }

    .cuando__textos {
      min-width: 0;
    }

    .cuando__textos p {
      margin: 0;
    }

    .cuando__dia {
      font-weight: 600;
    }

    .cuando__hora {
      font-size: var(--t-30);
      font-weight: 700;
      line-height: 1.2;
      font-variant-numeric: tabular-nums;
    }

    .cuando__zona {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-2);
      margin-top: var(--e-1);
    }

    .cuando__cuenta {
      color: var(--c-acento);
      font-size: var(--t-14);
      font-weight: 600;
    }

    .datos {
      display: grid;
      gap: 0;
      margin: 0 0 var(--e-5);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-tarjeta);
    }

    .datos__fila {
      display: grid;
      gap: var(--e-1);
      padding: var(--e-3) var(--e-4);
    }

    .datos__fila + .datos__fila {
      border-top: 1px solid var(--c-borde);
    }

    @media (min-width: 36rem) {
      .datos__fila {
        grid-template-columns: 11rem minmax(0, 1fr);
        gap: var(--e-4);
      }
    }

    .datos dt {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      color: var(--c-texto-2);
      font-size: var(--t-14);
      font-weight: 600;
      --icono-tamano: 1rem;
    }

    .datos dd {
      display: grid;
      gap: var(--e-1);
      margin: 0;
      font-weight: 600;
      overflow-wrap: anywhere;
    }

    .datos__nota {
      display: flex;
      align-items: center;
      gap: var(--e-1);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 400;
      --icono-tamano: 0.875rem;
    }
  `,
})
export class PasoConfirmarComponent {
  readonly especialidad = input.required<Especialidad>();
  readonly horario = input.required<HorarioReserva>();
  /** Sede del catálogo (con dirección), si se pudo cargar. */
  readonly sede = input<SedeCatalogo | null>(null);
  /** Se eligió «Cualquier profesional»: el profesional lo define el horario. */
  readonly asignado = input(false);
  readonly ahora = input<Date>(new Date());

  protected readonly cuenta = computed(() => {
    const texto = cuentaRegresivaLima(this.horario().inicio, this.ahora());
    return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : '';
  });
}
