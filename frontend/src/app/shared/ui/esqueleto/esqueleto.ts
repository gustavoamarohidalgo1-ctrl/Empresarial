import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type FormaEsqueleto = 'texto' | 'titulo' | 'bloque' | 'circulo' | 'pildora' | 'boton';

/**
 * Marcador de carga con brillo sutil (sin brillo si se prefiere movimiento reducido).
 * Reserva el tamaño final del contenido para que nada salte al cargar (CLS ≈ 0).
 * Es invisible para lectores de pantalla: el contenedor debe llevar `aria-busy="true"` y un
 * texto de estado (`<p class="solo-lectores" role="status">Cargando…</p>`).
 *
 * Uso: `<app-esqueleto forma="titulo" ancho="40%" />` · `<app-esqueleto [lineas]="3" />`
 *      · `<app-esqueleto forma="bloque" alto="9rem" />` · `<app-esqueleto forma="circulo" alto="3rem" />`
 */
@Component({
  selector: 'app-esqueleto',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': '"esqueleto esqueleto--" + forma()',
    '[style.width]': 'anchoHost()',
  },
  template: `@for (i of indices(); track i; let ultima = $last) {
    <span
      class="esqueleto__bloque"
      [style.height]="alto()"
      [style.width]="ultima && indices().length > 1 ? '65%' : null"
    ></span>
  }`,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.55em;
      width: 100%;
      max-width: 100%;
    }

    .esqueleto__bloque {
      display: block;
      height: 0.8em;
      border-radius: var(--r-sm);
      background-color: var(--c-esqueleto);
      background-image: linear-gradient(
        90deg,
        transparent 0%,
        var(--c-esqueleto-brillo) 50%,
        transparent 100%
      );
      background-size: 200% 100%;
      background-repeat: no-repeat;
      animation: esqueleto-brillo 1.6s ease-in-out infinite;
    }

    /* Texto: la altura de una línea de cuerpo (1.55) repartida entre bloque y separación. */
    :host(.esqueleto--texto) {
      padding-block: 0.375em;
      gap: 0.75em;
    }

    :host(.esqueleto--titulo) .esqueleto__bloque {
      height: 1.5rem;
      border-radius: var(--r-control);
    }

    :host(.esqueleto--bloque) .esqueleto__bloque {
      height: 6rem;
      border-radius: var(--r-tarjeta);
    }

    :host(.esqueleto--circulo) {
      width: auto;
    }

    :host(.esqueleto--circulo) .esqueleto__bloque {
      height: 2.5rem;
      aspect-ratio: 1;
      border-radius: 50%;
    }

    :host(.esqueleto--pildora) .esqueleto__bloque {
      height: 1.75rem;
      border-radius: var(--r-pildora);
    }

    :host(.esqueleto--boton) .esqueleto__bloque {
      height: var(--alto-control);
      border-radius: var(--r-control);
    }

    @keyframes esqueleto-brillo {
      from {
        background-position: 150% 0;
      }
      to {
        background-position: -50% 0;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .esqueleto__bloque {
        animation: none;
        background-image: none;
      }
    }
  `,
})
export class EsqueletoComponent {
  readonly forma = input<FormaEsqueleto>('texto');
  /** Ancho CSS (`'60%'`, `'12rem'`). Por defecto ocupa todo el ancho (círculo: su alto). */
  readonly ancho = input<string | null>(null);
  /** Alto CSS de cada bloque. Por defecto depende de la forma. */
  readonly alto = input<string | null>(null);
  /** Número de líneas (solo tiene sentido en `texto`); la última es más corta. */
  readonly lineas = input(1);

  protected readonly indices = computed(() =>
    Array.from({ length: Math.max(1, Math.floor(this.lineas())) }, (_, i) => i),
  );
  protected readonly anchoHost = computed(() => this.ancho());
}
