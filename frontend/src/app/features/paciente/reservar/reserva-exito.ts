import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CitaDetalle, HorarioReserva } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { FichaFechaComponent } from '../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../shared/ui/icono/icono';

/**
 * Pantalla de éxito de la reserva: código de la cita, resumen, próximos pasos y los enlaces
 * «Ver mi cita» y «Volver a mis citas». El título (`#titulo-exito`) recibe el foco.
 * Si la respuesta se perdió y solo sabemos el ID, el código se muestra cuando llega la cita.
 */
@Component({
  selector: 'app-reserva-exito',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EsqueletoComponent, FichaFechaComponent, IconoComponent, FechaLimaPipe],
  template: `
    <section class="tarjeta exito" aria-labelledby="titulo-exito">
      <span class="exito__sello" aria-hidden="true"
        ><app-icono nombre="calendar-check" [trazo]="2"
      /></span>
      <h2 id="titulo-exito" class="exito__titulo" tabindex="-1">Tu cita está reservada</h2>
      <p class="exito__texto">
        Guarda el código: lo verás también en Mis citas y en tus recordatorios.
      </p>

      <div class="codigo" [attr.aria-busy]="!cita()">
        <span class="codigo__etiqueta">Código de la cita</span>
        @if (cita(); as c) {
          <strong class="codigo__valor tabular">{{ c.codigo }}</strong>
        } @else if (cargandoCita()) {
          <app-esqueleto forma="titulo" ancho="11rem" />
          <span class="solo-lectores" role="status">Obteniendo el código de la cita…</span>
        } @else {
          <span class="codigo__pendiente">Lo verás en el detalle de la cita.</span>
        }
      </div>

      @if (horario(); as h) {
        <div class="cita">
          <app-ficha-fecha [fecha]="cita()?.inicio ?? h.inicio" destacada />
          <div class="cita__textos">
            <p class="cita__hora">
              {{ cita()?.inicio ?? h.inicio | fechaLima: 'dia' }} ·
              {{ cita()?.inicio ?? h.inicio | fechaLima: 'hora' }}
              <span class="cita__zona">(hora de Lima)</span>
            </p>
            <p class="cita__dato">
              <app-icono nombre="stethoscope" />{{
                cita()?.especialidad.nombre ?? especialidadNombre()
              }}
            </p>
            <p class="cita__dato">
              <app-icono nombre="user" />{{ cita()?.profesional.nombre ?? h.profesional.nombre }}
            </p>
            <p class="cita__dato">
              <app-icono nombre="building" />{{ cita()?.sede.nombre ?? h.sede.nombre }}
            </p>
          </div>
        </div>
      }

      <h3 class="pasos__titulo">Próximos pasos</h3>
      <ol class="pasos">
        <li>
          <app-icono nombre="check-circle" />
          <span
            ><strong>Confírmala</strong> desde el detalle de la cita para asegurar tu
            atención.</span
          >
        </li>
        <li>
          <app-icono nombre="clipboard-check" />
          <span
            >Completa el <strong>pre-check-in</strong> antes de tu cita y evita filas en la
            sede.</span
          >
        </li>
        <li>
          <app-icono nombre="bell" />
          <span
            >Te avisaremos en <strong>Notificaciones</strong> antes de la fecha o si algo
            cambia.</span
          >
        </li>
      </ol>

      <div class="acciones exito__acciones">
        <a class="btn btn--primario" [routerLink]="['/paciente/citas', citaId()]">
          <app-icono nombre="calendar" /> Ver mi cita
        </a>
        <a class="btn" routerLink="/paciente/citas"
          ><app-icono nombre="arrow-left" /> Volver a mis citas</a
        >
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .exito {
      max-width: 42rem;
      margin-inline: auto;
      text-align: center;
    }

    .exito__sello {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 4rem;
      height: 4rem;
      margin-bottom: var(--e-4);
      border-radius: 50%;
      background: var(--c-exito-suave);
      color: var(--c-exito);
      box-shadow: 0 0 0 8px var(--c-acento-suave);
      --icono-tamano: 2rem;
    }

    .tarjeta .exito__titulo {
      margin: 0 0 var(--e-2);
      font-size: var(--t-24);
    }

    .exito__texto {
      margin: 0 0 var(--e-5);
      color: var(--c-texto-2);
    }

    .codigo {
      display: grid;
      justify-items: center;
      gap: var(--e-1);
      min-height: 4.5rem;
      margin-bottom: var(--e-5);
      padding: var(--e-3) var(--e-4);
      border: 1px dashed var(--c-primario-borde);
      border-radius: var(--r-tarjeta);
      background: var(--c-primario-tenue);
    }

    .codigo__etiqueta {
      color: var(--c-texto-2);
      font-size: var(--t-12);
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .codigo__valor {
      color: var(--c-primario-fuerte);
      font-size: var(--t-24);
      letter-spacing: 0.04em;
    }

    .codigo__pendiente {
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .cita {
      display: flex;
      align-items: center;
      gap: var(--e-4);
      margin-bottom: var(--e-6);
      padding: var(--e-4);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-tarjeta);
      text-align: left;
    }

    .cita__textos {
      display: grid;
      gap: var(--e-1);
      min-width: 0;
    }

    .cita__textos p {
      margin: 0;
    }

    .cita__hora {
      font-weight: 650;
    }

    .cita__zona {
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 400;
    }

    .cita__dato {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      color: var(--c-texto-2);
      font-size: var(--t-14);
      overflow-wrap: anywhere;
      --icono-tamano: 1rem;
    }

    .pasos__titulo {
      margin: 0 0 var(--e-3);
      text-align: left;
    }

    .pasos {
      display: grid;
      gap: var(--e-3);
      margin: 0;
      padding: 0;
      list-style: none;
      text-align: left;
    }

    .pasos li {
      display: flex;
      align-items: flex-start;
      gap: var(--e-3);
      font-size: var(--t-14);
      --icono-tamano: 1.125rem;
    }

    .pasos app-icono {
      margin-top: 0.1em;
      color: var(--c-acento);
    }

    .exito__acciones {
      justify-content: center;
      margin-top: var(--e-6);
      padding-top: var(--e-5);
      border-top: 1px solid var(--c-borde);
    }
  `,
})
export class ReservaExitoComponent {
  readonly citaId = input.required<string>();
  /** La cita creada; `null` si la respuesta se perdió y aún no la tenemos. */
  readonly cita = input<CitaDetalle | null>(null);
  readonly cargandoCita = input(false);
  /** Horario reservado (para mostrar el resumen aunque falte la cita). */
  readonly horario = input<HorarioReserva | null>(null);
  readonly especialidadNombre = input('');
}
