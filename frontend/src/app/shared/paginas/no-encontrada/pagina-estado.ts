import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IlustracionPagina = 'no-encontrada' | 'acceso-denegado';

/**
 * Página de estado completa (404, acceso denegado): ilustración SVG con tokens (funciona en
 * modo oscuro), código opcional, título (h1: es la página entera), texto y acciones.
 * La ilustración es decorativa (`aria-hidden`).
 *
 * Uso:
 * ```html
 * <app-pagina-estado ilustracion="no-encontrada" codigo="Error 404" titulo="Página no encontrada"
 *                    texto="La dirección que abriste no existe en SIGA-SP.">
 *   <a acciones class="btn btn--primario" routerLink="/">Ir al inicio</a>
 * </app-pagina-estado>
 * ```
 *
 * Nota: vive junto a la página 404 porque también la usa «Acceso denegado» (features/auth);
 * puede pasar a `shared/ui` si otra pantalla la necesita.
 */
@Component({
  selector: 'app-pagina-estado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="pe" aria-labelledby="pe-titulo">
      <svg class="pe__ilustracion" viewBox="0 0 200 160" aria-hidden="true" focusable="false">
        <circle class="i-halo" cx="100" cy="84" r="66" />
        <circle class="i-acento" cx="36" cy="50" r="4" />
        <path class="i-chispa" d="M166 30v12M160 36h12" />
        @if (ilustracion() === 'no-encontrada') {
          <rect
            class="i-suave"
            x="58"
            y="30"
            width="76"
            height="98"
            rx="10"
            transform="rotate(-8 96 79)"
          />
          <path
            class="i-hoja"
            d="M70 28h44l20 20v74a8 8 0 0 1-8 8H70a8 8 0 0 1-8-8V36a8 8 0 0 1 8-8z"
          />
          <path class="i-doblez" d="M114 28v13a7 7 0 0 0 7 7h13z" />
          <rect class="i-linea" x="74" y="58" width="40" height="6" rx="3" />
          <rect class="i-linea" x="74" y="72" width="48" height="6" rx="3" />
          <rect class="i-linea" x="74" y="86" width="28" height="6" rx="3" />
          <path class="i-mango" d="M151 119l14 14" />
          <circle class="i-lupa" cx="136" cy="104" r="20" />
          <path class="i-pregunta" d="M130.5 99a5.5 5.5 0 1 1 7.7 5c-1.3.6-2.2 1.5-2.2 3v1.5" />
          <circle class="i-punto" cx="136" cy="114.5" r="2" />
        } @else {
          <path class="i-escudo" d="M100 22l42 14v42c0 28-18 46-42 56-24-10-42-28-42-56V36z" />
          <path class="i-arco" d="M88 78v-8a12 12 0 0 1 24 0v8" />
          <rect class="i-candado" x="80" y="76" width="40" height="32" rx="8" />
          <circle class="i-ojo" cx="100" cy="89" r="4" />
          <rect class="i-ojo" x="98.5" y="90" width="3" height="9" rx="1.5" />
          <circle class="i-alerta" cx="146" cy="116" r="14" />
          <path class="i-trazo-alerta" d="M146 109v8M146 123h.01" />
        }
      </svg>
      @if (codigo(); as c) {
        <p class="pe__codigo">{{ c }}</p>
      }
      <h1 id="pe-titulo" class="pe__titulo">{{ titulo() }}</h1>
      @if (texto(); as t) {
        <p class="pe__texto">{{ t }}</p>
      }
      <ng-content />
      <div class="pe__acciones"><ng-content select="[acciones]" /></div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .pe {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 36rem;
      margin: var(--e-4) auto 0;
      padding: var(--e-8) var(--e-5);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-bloque);
      background:
        radial-gradient(ellipse at 50% 0%, var(--c-primario-tenue), transparent 70%),
        var(--c-superficie);
      box-shadow: var(--sombra-1);
      color: var(--c-texto-2);
      text-align: center;
    }

    @media (min-width: 48rem) {
      .pe {
        margin-top: var(--e-8);
        padding: var(--e-12) var(--e-10);
      }
    }

    .pe__ilustracion {
      width: 12.5rem;
      height: 10rem;
      margin-bottom: var(--e-5);
    }

    .pe__codigo {
      margin: 0 0 var(--e-2);
      padding: 0.125rem var(--e-3);
      border-radius: var(--r-pildora);
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      font-size: var(--t-13);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .pe__titulo {
      margin-bottom: var(--e-3);
    }

    .pe__texto {
      max-width: 30rem;
      margin-bottom: var(--e-2);
    }

    .pe__acciones {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--e-3);
      width: 100%;
      margin-top: var(--e-6);
    }

    .pe__acciones:empty {
      display: none;
    }

    .i-halo {
      fill: var(--c-primario-tenue);
    }

    .i-acento {
      fill: var(--c-acento);
    }

    .i-chispa,
    .i-mango,
    .i-pregunta,
    .i-arco,
    .i-trazo-alerta {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .i-chispa {
      stroke: var(--c-acento);
      stroke-width: 2.5;
    }

    .i-suave,
    .i-doblez {
      fill: var(--c-primario-suave);
    }

    .i-hoja {
      fill: var(--c-superficie);
      stroke: var(--c-borde);
      stroke-width: 1.5;
    }

    .i-linea {
      fill: var(--c-superficie-3);
    }

    .i-lupa {
      fill: var(--c-superficie);
      stroke: var(--c-primario);
      stroke-width: 5;
    }

    .i-mango {
      stroke: var(--c-primario);
      stroke-width: 8;
    }

    .i-pregunta {
      stroke: var(--c-primario);
      stroke-width: 3;
    }

    .i-punto,
    .i-candado {
      fill: var(--c-primario);
    }

    .i-escudo {
      fill: var(--c-primario-suave);
      stroke: var(--c-primario-borde);
      stroke-width: 2;
    }

    .i-arco {
      stroke: var(--c-primario);
      stroke-width: 6;
    }

    .i-ojo {
      fill: var(--c-superficie);
    }

    .i-alerta {
      fill: var(--c-advertencia-suave);
      stroke: var(--c-advertencia);
      stroke-width: 2;
    }

    .i-trazo-alerta {
      stroke: var(--c-advertencia);
      stroke-width: 3;
    }
  `,
})
export class PaginaEstadoComponent {
  readonly titulo = input.required<string>();
  readonly texto = input<string | null>(null);
  /** Rótulo pequeño sobre el título (p. ej. «Error 404»). */
  readonly codigo = input<string | null>(null);
  readonly ilustracion = input<IlustracionPagina>('no-encontrada');
}
