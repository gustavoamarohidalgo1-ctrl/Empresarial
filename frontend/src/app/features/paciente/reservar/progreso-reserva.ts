import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconoComponent } from '../../../shared/ui/icono/icono';

export interface PasoProgreso {
  numero: number;
  titulo: string;
}

/**
 * Indicador de progreso del asistente («Paso X de N»). Es una lista ordenada dentro de un
 * `nav`: el paso actual lleva `aria-current="step"`; los completados son botones para volver
 * a ellos sin perder lo elegido. En móvil solo se ve la etiqueta del paso actual.
 */
@Component({
  selector: 'app-progreso-reserva',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <nav class="progreso" aria-label="Progreso de la reserva">
      <p class="progreso__texto">
        Paso <strong>{{ actual() }}</strong> de {{ pasos().length }}
        <span aria-hidden="true"> · </span
        ><span class="progreso__actual">{{ tituloActual() }}</span>
      </p>
      <ol class="progreso__pasos">
        @for (p of pasos(); track p.numero) {
          @let estado =
            p.numero < actual() ? 'completado' : p.numero === actual() ? 'actual' : 'pendiente';
          <li
            [class]="'progreso__paso progreso__paso--' + estado"
            [attr.aria-current]="estado === 'actual' ? 'step' : null"
          >
            @if (estado === 'completado' && !bloqueado()) {
              <button type="button" class="progreso__boton" (click)="irA.emit(p.numero)">
                <span class="progreso__marca" aria-hidden="true"
                  ><app-icono nombre="check" [trazo]="2.5"
                /></span>
                <span class="progreso__etiqueta"
                  >{{ p.titulo
                  }}<span class="solo-lectores">: completado, volver a este paso</span></span
                >
              </button>
            } @else {
              <span class="progreso__boton">
                <span class="progreso__marca" aria-hidden="true">
                  @if (estado === 'completado') {
                    <app-icono nombre="check" [trazo]="2.5" />
                  } @else {
                    {{ p.numero }}
                  }
                </span>
                <span class="progreso__etiqueta"
                  >{{ p.titulo
                  }}<span class="solo-lectores">{{
                    estado === 'actual'
                      ? ': paso actual'
                      : estado === 'completado'
                        ? ': completado'
                        : ': pendiente'
                  }}</span></span
                >
              </span>
            }
          </li>
        }
      </ol>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--e-6);
    }

    .progreso__texto {
      margin: 0 0 var(--e-3);
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .progreso__texto strong {
      color: var(--c-texto);
    }

    .progreso__actual {
      color: var(--c-texto);
      font-weight: 600;
    }

    .progreso__pasos {
      display: grid;
      grid-template-columns: repeat(var(--pasos, 4), minmax(0, 1fr));
      gap: var(--e-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .progreso__paso {
      position: relative;
      min-width: 0;
    }

    /* Línea de avance bajo cada paso: llena si está completado o es el actual. */
    .progreso__paso::after {
      content: '';
      position: absolute;
      inset: auto 0 0;
      height: 4px;
      border-radius: var(--r-pildora);
      background: var(--c-superficie-3);
    }

    .progreso__paso--completado::after,
    .progreso__paso--actual::after {
      background: var(--c-primario);
    }

    .progreso__boton {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      width: 100%;
      min-height: var(--alto-control);
      padding: 0 0 var(--e-3);
      border: 0;
      background: none;
      color: var(--c-texto-2);
      font: inherit;
      font-size: var(--t-14);
      font-weight: 600;
      text-align: left;
    }

    button.progreso__boton {
      cursor: pointer;
      border-radius: var(--r-sm);
    }

    button.progreso__boton:hover .progreso__etiqueta {
      color: var(--c-primario);
      text-decoration: underline;
      text-underline-offset: 0.2em;
    }

    .progreso__marca {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 1.75rem;
      height: 1.75rem;
      border: 2px solid var(--c-borde-control);
      border-radius: 50%;
      background: var(--c-superficie);
      font-size: var(--t-13);
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      --icono-tamano: 0.875rem;
    }

    .progreso__paso--actual .progreso__marca {
      border-color: var(--c-primario);
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
    }

    .progreso__paso--completado .progreso__marca {
      border-color: var(--c-primario);
      background: var(--c-primario);
      color: var(--c-sobre-primario);
    }

    .progreso__paso--actual .progreso__boton,
    .progreso__paso--completado .progreso__boton {
      color: var(--c-texto);
    }

    .progreso__etiqueta {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Móvil: solo marcas y barras; el título del paso actual va en el texto de arriba. */
    @media (max-width: 47.99rem) {
      .progreso__etiqueta {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    @media (min-width: 48rem) {
      .progreso__texto {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    }

    @media (forced-colors: active) {
      .progreso__paso::after {
        background: GrayText;
      }

      .progreso__paso--completado::after,
      .progreso__paso--actual::after {
        background: Highlight;
      }
    }
  `,
  host: { '[style.--pasos]': 'pasos().length' },
})
export class ProgresoReservaComponent {
  readonly pasos = input.required<readonly PasoProgreso[]>();
  readonly actual = input.required<number>();
  /** Mientras se envía la reserva no se puede volver a otro paso. */
  readonly bloqueado = input(false);
  readonly irA = output<number>();

  protected readonly tituloActual = computed(
    () => this.pasos().find((p) => p.numero === this.actual())?.titulo ?? '',
  );
}
