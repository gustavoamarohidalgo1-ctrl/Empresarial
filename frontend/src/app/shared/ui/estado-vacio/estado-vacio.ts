import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

export type IlustracionVacio = 'calendario' | 'historial' | 'busqueda' | 'error' | 'ninguna';

/**
 * Estado vacío: ilustración SVG ligera (en línea, con tokens: funciona en modo oscuro),
 * título, texto y acciones. Las ilustraciones son decorativas (`aria-hidden`).
 *
 * Uso:
 * ```html
 * <app-estado-vacio ilustracion="calendario" titulo="No tienes citas próximas"
 *                   texto="Cuando tengas una cita registrada, aparecerá aquí.">
 *   <a acciones class="btn" routerLink="/paciente/perfil">Revisar mis datos</a>
 * </app-estado-vacio>
 * ```
 */
@Component({
  selector: 'app-estado-vacio',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.vacio--compacto]': 'compacto()' },
  template: `
    @if (ilustracion() !== 'ninguna') {
      <svg class="vacio__ilustracion" viewBox="0 0 160 120" aria-hidden="true" focusable="false">
        <ellipse class="i-halo" cx="80" cy="64" rx="66" ry="50" />
        @switch (ilustracion()) {
          @case ('calendario') {
            <rect class="i-hoja" x="40" y="26" width="80" height="70" rx="12" />
            <path class="i-marca" d="M52 26h56a12 12 0 0 1 12 12v8H40v-8a12 12 0 0 1 12-12z" />
            <rect class="i-anillo" x="58" y="18" width="7" height="15" rx="3.5" />
            <rect class="i-anillo" x="95" y="18" width="7" height="15" rx="3.5" />
            <circle class="i-punto" cx="58" cy="62" r="4" />
            <circle class="i-punto" cx="74" cy="62" r="4" />
            <circle class="i-punto" cx="90" cy="62" r="4" />
            <circle class="i-punto" cx="58" cy="78" r="4" />
            <circle class="i-punto" cx="74" cy="78" r="4" />
            <circle class="i-acento" cx="116" cy="88" r="15" />
            <path class="i-trazo-claro" d="M116 81v14M109 88h14" />
          }
          @case ('historial') {
            <rect
              class="i-suave"
              x="50"
              y="22"
              width="64"
              height="76"
              rx="10"
              transform="rotate(-7 82 60)"
            />
            <rect class="i-hoja" x="46" y="26" width="64" height="76" rx="10" />
            <rect class="i-linea" x="58" y="42" width="40" height="6" rx="3" />
            <rect class="i-linea" x="58" y="56" width="30" height="6" rx="3" />
            <rect class="i-linea" x="58" y="70" width="36" height="6" rx="3" />
            <circle class="i-marca" cx="110" cy="88" r="16" />
            <path class="i-trazo-claro" d="M110 80v8l6 4" />
          }
          @case ('busqueda') {
            <rect class="i-hoja" x="34" y="28" width="76" height="64" rx="10" />
            <rect class="i-linea" x="46" y="42" width="44" height="6" rx="3" />
            <rect class="i-linea" x="46" y="56" width="52" height="6" rx="3" />
            <rect class="i-linea" x="46" y="70" width="32" height="6" rx="3" />
            <circle class="i-lupa" cx="108" cy="72" r="16" />
            <path class="i-mango" d="M120 84l12 12" />
          }
          @case ('error') {
            <path
              class="i-hoja"
              d="M50 86a18 18 0 0 1-2-35.9A26 26 0 0 1 98 44a20 20 0 0 1 14 42z"
            />
            <circle class="i-alerta" cx="108" cy="84" r="15" />
            <path class="i-trazo-alerta" d="M108 77v8M108 91h.01" />
          }
        }
      </svg>
    }
    @if (nivel() === 3) {
      <h3 class="vacio__titulo">{{ titulo() }}</h3>
    } @else {
      <h2 class="vacio__titulo">{{ titulo() }}</h2>
    }
    @if (texto(); as t) {
      <p class="vacio__texto">{{ t }}</p>
    }
    <ng-content />
    <div class="vacio__acciones"><ng-content select="[acciones]" /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: var(--e-10) var(--e-4);
      color: var(--c-texto-2);
      text-align: center;
    }

    :host(.vacio--compacto) {
      padding-block: var(--e-6);
    }

    .vacio__ilustracion {
      width: 10rem;
      height: 7.5rem;
      margin-bottom: var(--e-4);
    }

    :host(.vacio--compacto) .vacio__ilustracion {
      width: 7.5rem;
      height: 5.625rem;
    }

    .vacio__titulo {
      margin: 0 0 var(--e-2);
      color: var(--c-texto);
      font-size: var(--t-18);
      font-weight: 650;
    }

    .vacio__texto {
      max-width: 34rem;
      margin: 0 auto var(--e-2);
    }

    .vacio__acciones {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--e-3);
      margin-top: var(--e-4);
    }

    .vacio__acciones:empty {
      display: none;
    }

    .i-halo {
      fill: var(--c-primario-tenue);
    }

    .i-hoja {
      fill: var(--c-superficie);
      stroke: var(--c-borde);
      stroke-width: 1.5;
    }

    .i-suave {
      fill: var(--c-primario-suave);
    }

    .i-marca {
      fill: var(--c-primario);
    }

    .i-anillo {
      fill: var(--c-primario-borde);
    }

    .i-punto,
    .i-linea {
      fill: var(--c-superficie-3);
    }

    .i-acento {
      fill: var(--c-acento);
    }

    .i-trazo-claro {
      fill: none;
      stroke: var(--c-superficie);
      stroke-width: 3;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .i-lupa {
      fill: var(--c-superficie);
      stroke: var(--c-primario);
      stroke-width: 5;
    }

    .i-mango {
      stroke: var(--c-primario);
      stroke-width: 7;
      stroke-linecap: round;
    }

    .i-alerta {
      fill: var(--c-advertencia-suave);
      stroke: var(--c-advertencia);
      stroke-width: 2;
    }

    .i-trazo-alerta {
      fill: none;
      stroke: var(--c-advertencia);
      stroke-width: 3;
      stroke-linecap: round;
    }
  `,
})
export class EstadoVacioComponent {
  readonly titulo = input.required<string>();
  readonly texto = input<string | null>(null);
  readonly ilustracion = input<IlustracionVacio>('calendario');
  /** Nivel del encabezado (2 por defecto; 3 si va dentro de una sección con h2). */
  readonly nivel = input<2 | 3>(2);
  /** Menos aire y una ilustración más pequeña (dentro de tarjetas). */
  readonly compacto = input(false, { transform: booleanAttribute });
}
