import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CitaResumen } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoCitaComponent } from '../../../shared/ui/estado-cita/estado-cita';
import { FichaFechaComponent } from '../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { diasHastaLima } from '../../../shared/utils/fecha-lima';
import { capitalizar, cuentaRegresiva } from './cuenta-regresiva';

/**
 * Tarjeta destacada con la próxima cita: ficha de fecha, cuenta regresiva, estado, sede,
 * profesional y «Ver y gestionar». Con `cita = null` pinta su esqueleto con la MISMA caja
 * (mismas clases y medidas), para que nada salte al llegar los datos.
 */
@Component({
  selector: 'app-proxima-cita',
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
      <section class="tarjeta tarjeta--destacada proxima" aria-labelledby="titulo-proxima">
        <div class="proxima__cabecera">
          <h2 id="titulo-proxima" class="proxima__antetitulo">Tu próxima cita</h2>
          @if (cuenta(); as t) {
            <p class="cuenta" [class.cuenta--hoy]="esHoy()">
              <app-icono nombre="hourglass" /> {{ t }}
            </p>
          }
        </div>
        <div class="proxima__cuerpo">
          <app-ficha-fecha aria-hidden="true" [fecha]="c.inicio" tamano="lg" destacada />
          <div class="proxima__info">
            <p class="proxima__titulo">{{ c.especialidad.nombre }}</p>
            <p class="proxima__cuando">
              <time [attr.datetime]="c.inicio">{{ c.inicio | fechaLima: 'dia' }}</time>
              <span class="proxima__hora"
                ><app-icono nombre="clock" /><time [attr.datetime]="c.inicio">{{
                  c.inicio | fechaLima: 'hora'
                }}</time>
                a <time [attr.datetime]="c.fin">{{ c.fin | fechaLima: 'hora' }}</time>
                <span class="texto-suave">(hora de Lima)</span></span
              >
            </p>
            <ul class="proxima__datos">
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
          </div>
        </div>
        <div class="proxima__pie">
          <div class="proxima__estado">
            <app-estado-cita [estado]="c.estado" [etiqueta]="c.estadoEtiqueta" />
            <span class="insignia tabular"
              ><span class="solo-lectores">Código: </span>{{ c.codigo }}</span
            >
            @if (c.estado === 'PENDIENTE') {
              <p class="proxima__pista">
                <app-icono nombre="alert-circle" /> Aún no confirmas tu asistencia.
              </p>
            }
          </div>
          <a class="btn btn--primario proxima__boton" [routerLink]="['/paciente/citas', c.id]">
            Ver y gestionar<span class="solo-lectores"> la cita {{ c.codigo }}</span>
            <app-icono nombre="arrow-right" />
          </a>
        </div>
      </section>
    } @else {
      <div class="tarjeta tarjeta--destacada proxima" aria-hidden="true">
        <div class="proxima__cabecera">
          <app-esqueleto ancho="8rem" />
          <app-esqueleto forma="pildora" ancho="7rem" />
        </div>
        <div class="proxima__cuerpo">
          <app-esqueleto forma="bloque" ancho="4.75rem" alto="5.5rem" />
          <div class="proxima__info">
            <app-esqueleto forma="titulo" ancho="55%" />
            <app-esqueleto [lineas]="2" />
          </div>
        </div>
        <div class="proxima__pie">
          <app-esqueleto forma="pildora" ancho="6.5rem" />
          <app-esqueleto class="proxima__esq-boton" forma="boton" />
        </div>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .proxima {
      position: relative;
      display: grid;
      gap: var(--e-5);
      overflow: hidden;
    }

    /* Halo decorativo del acento de salud (solo tokens; funciona en oscuro). */
    .proxima::before {
      content: '';
      position: absolute;
      top: -9rem;
      right: -7rem;
      width: 20rem;
      height: 20rem;
      border-radius: 50%;
      background: radial-gradient(closest-side, var(--c-acento-suave), transparent);
      pointer-events: none;
    }

    .proxima > * {
      position: relative;
    }

    .proxima__cabecera,
    .proxima__pie,
    .proxima__estado {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-2) var(--e-3);
    }

    .proxima__cabecera {
      justify-content: space-between;
    }

    .proxima__antetitulo {
      margin: 0;
      color: var(--c-primario);
      font-size: var(--t-13);
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .cuenta {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
      margin: 0;
      padding: var(--e-1) var(--e-3);
      border-radius: var(--r-pildora);
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      font-size: var(--t-14);
      font-weight: 650;
      --icono-tamano: 1rem;
    }

    .cuenta--hoy {
      background: var(--c-acento-suave);
      color: var(--c-acento);
      box-shadow: inset 0 0 0 1px var(--c-acento);
    }

    .proxima__cuerpo {
      display: flex;
      align-items: flex-start;
      gap: var(--e-4);
    }

    .proxima__cuerpo > app-esqueleto {
      flex: none;
    }

    .proxima__info {
      flex: 1;
      min-width: 0;
    }

    .proxima__titulo {
      margin: 0 0 var(--e-1);
      font-size: var(--t-20);
      font-weight: 700;
      line-height: 1.2;
      letter-spacing: -0.015em;
    }

    .proxima__cuando {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--e-3);
      margin: 0;
      font-weight: 500;
    }

    .proxima__hora {
      display: inline-flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0 var(--e-1);
      font-weight: 650;
      --icono-tamano: 1rem;
    }

    .proxima__hora app-icono {
      margin-right: var(--e-1);
      color: var(--c-texto-2);
    }

    .proxima__hora .texto-suave {
      font-weight: 500;
    }

    .proxima__datos {
      display: flex;
      flex-wrap: wrap;
      gap: var(--e-1) var(--e-5);
      margin: var(--e-3) 0 0;
      padding: 0;
      list-style: none;
      color: var(--c-texto-2);
      font-size: var(--t-14);
      --icono-tamano: 1rem;
    }

    .proxima__datos li {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
      min-width: 0;
    }

    .proxima__pie {
      padding-top: var(--e-4);
      border-top: 1px solid var(--c-borde);
    }

    .proxima__pista {
      display: inline-flex;
      align-items: center;
      gap: var(--e-1);
      margin: 0;
      color: var(--c-advertencia);
      font-size: var(--t-14);
      font-weight: 600;
      --icono-tamano: 1rem;
    }

    .proxima__boton,
    .proxima__esq-boton {
      width: 100%;
    }

    @media (min-width: 36rem) {
      .proxima__boton {
        width: auto;
        margin-left: auto;
      }

      .proxima__esq-boton {
        width: 11rem;
        margin-left: auto;
      }
    }

    @media (min-width: 48rem) {
      .proxima__titulo {
        font-size: var(--t-24);
      }
    }
  `,
})
export class ProximaCitaComponent {
  /** La próxima cita, o `null` para pintar el esqueleto. */
  readonly cita = input<CitaResumen | null>(null);
  /** Momento de referencia para la cuenta regresiva (lo actualiza la pantalla). */
  readonly ahora = input<Date>(new Date());

  protected readonly cuenta = computed(() => {
    const c = this.cita();
    const t = c ? cuentaRegresiva(c.inicio, c.estado, this.ahora()) : null;
    return t ? capitalizar(t) : null;
  });
  protected readonly esHoy = computed(() => {
    const c = this.cita();
    return !!c && diasHastaLima(c.inicio, this.ahora()) === 0;
  });
}
