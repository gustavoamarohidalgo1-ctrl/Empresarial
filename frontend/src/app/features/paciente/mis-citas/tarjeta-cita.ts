import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CitaResumen } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoCitaComponent } from '../../../shared/ui/estado-cita/estado-cita';
import { FichaFechaComponent } from '../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { cuentaRegresiva } from './cuenta-regresiva';

/**
 * Tarjeta de una cita en la lista: ficha de fecha, estado, especialidad (h3), hora, profesional
 * y sede. Toda la tarjeta es clicable gracias a `.enlace-extendido` (sin anidar interactivos).
 * Con `cita = null` pinta su esqueleto con la misma caja.
 */
@Component({
  selector: 'app-tarjeta-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    EsqueletoComponent,
    EstadoCitaComponent,
    FichaFechaComponent,
    IconoComponent,
    FechaLimaPipe,
  ],
  template: `
    @if (cita(); as c) {
      <article class="tarjeta tarjeta--interactiva cita" [attr.aria-labelledby]="'cita-' + c.id">
        <h3 class="cita__titulo" [id]="'cita-' + c.id">{{ c.especialidad.nombre }}</h3>
        <div class="cita__ficha"><app-ficha-fecha [fecha]="c.inicio" /></div>
        <div class="cita__estado">
          <app-estado-cita [estado]="c.estado" [etiqueta]="c.estadoEtiqueta" tamano="sm" />
        </div>
        <p class="cita__hora">
          <app-icono nombre="clock" />
          <span
            ><time [attr.datetime]="c.inicio">{{ c.inicio | fechaLima: 'hora' }}</time> a
            <time [attr.datetime]="c.fin">{{ c.fin | fechaLima: 'hora' }}</time></span
          >
          @if (cuenta(); as t) {
            <span class="cita__cuenta">· {{ t }}</span>
          }
        </p>
        <ul class="cita__datos">
          <li>
            <app-icono nombre="user" /><span
              ><span class="solo-lectores">Profesional: </span>{{ c.profesional.nombre }}</span
            >
          </li>
          <li>
            <app-icono nombre="building" /><span
              ><span class="solo-lectores">Sede: </span>{{ c.sede.nombre }}</span
            >
          </li>
        </ul>
        <div class="cita__pie">
          <span class="cita__codigo"
            ><span class="solo-lectores">Código: </span>{{ c.codigo }}</span
          >
          <a class="enlace-extendido cita__enlace" [routerLink]="['/paciente/citas', c.id]"
            >Ver detalle<span class="solo-lectores"> de la cita {{ c.codigo }}</span
            ><app-icono nombre="chevron-right" />
          </a>
        </div>
      </article>
    } @else {
      <div class="tarjeta cita" aria-hidden="true">
        <div class="cita__titulo"><app-esqueleto forma="titulo" ancho="70%" /></div>
        <div class="cita__ficha">
          <app-esqueleto forma="bloque" ancho="3.75rem" alto="4.75rem" />
        </div>
        <div class="cita__estado">
          <app-esqueleto forma="pildora" ancho="6rem" alto="1.375rem" />
        </div>
        <div class="cita__hora"><app-esqueleto ancho="55%" /></div>
        <div class="cita__datos"><app-esqueleto [lineas]="2" /></div>
        <div class="cita__pie">
          <app-esqueleto ancho="4rem" />
          <app-esqueleto ancho="6rem" />
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
    }

    /* Ficha a la izquierda; el h3 va primero en el DOM para navegar por encabezados. */
    .cita {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      grid-template-rows: auto auto auto 1fr auto;
      grid-template-areas:
        'ficha estado'
        'ficha titulo'
        'ficha hora'
        'ficha datos'
        'pie pie';
      column-gap: var(--e-4);
      height: 100%;
    }

    .cita__ficha {
      grid-area: ficha;
      display: flex;
    }

    .cita__estado {
      grid-area: estado;
      display: flex;
      margin-bottom: var(--e-2);
    }

    .cita__titulo {
      grid-area: titulo;
      margin: 0;
      font-size: var(--t-18);
      font-weight: 650;
      line-height: 1.3;
    }

    .cita__hora {
      grid-area: hora;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0 var(--e-2);
      margin: var(--e-1) 0 0;
      font-size: var(--t-14);
      font-weight: 600;
    }

    .cita__hora,
    .cita__datos {
      --icono-tamano: 1rem;
    }

    .cita__hora app-icono,
    .cita__datos app-icono {
      color: var(--c-texto-2);
    }

    .cita__cuenta {
      color: var(--c-acento);
    }

    .cita__datos {
      grid-area: datos;
      display: grid;
      align-content: start;
      gap: var(--e-1);
      margin: var(--e-3) 0 0;
      padding: 0;
      list-style: none;
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .cita__datos li {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      min-width: 0;
    }

    .cita__pie {
      grid-area: pie;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--e-3);
      margin-top: var(--e-4);
      padding-top: var(--e-3);
      border-top: 1px solid var(--c-borde);
      font-size: var(--t-14);
    }

    .cita__codigo {
      color: var(--c-texto-2);
      font-weight: 600;
      letter-spacing: 0.02em;
      font-variant-numeric: tabular-nums;
    }

    .cita__enlace {
      display: inline-flex;
      align-items: center;
      gap: var(--e-1);
      font-weight: 650;
      text-decoration: none;
      --icono-tamano: 1rem;
    }

    .cita__enlace app-icono {
      transition: transform var(--dur-1) var(--curva);
    }

    .cita:hover .cita__enlace {
      text-decoration: underline;
    }

    .cita:hover .cita__enlace app-icono {
      transform: translateX(2px);
    }

    .cita__pie app-esqueleto {
      flex: none;
    }
  `,
})
export class TarjetaCitaComponent {
  /** La cita, o `null` para pintar el esqueleto. */
  readonly cita = input<CitaResumen | null>(null);
  readonly ahora = input<Date>(new Date());
  /** Muestra «· en 3 días» junto a la hora (solo en Próximas). */
  readonly conCuenta = input(false, { transform: booleanAttribute });

  protected readonly cuenta = computed(() => {
    const c = this.cita();
    return c && this.conCuenta() ? cuentaRegresiva(c.inicio, c.estado, this.ahora()) : null;
  });
}
