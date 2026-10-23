import { ChangeDetectionStrategy, Component, booleanAttribute, input } from '@angular/core';

/**
 * Marca de SIGA-SP: isotipo (cruz de salud con punto de acento) + logotipo opcional.
 * Los colores salen de `--marca-*`, así que funciona en ambos temas. El SVG es decorativo:
 * el nombre accesible lo da el texto «SIGA-SP» (o el enlace que la contenga).
 *
 * Uso: `<app-marca />` · `<app-marca tamano="lg" subtitulo="Atención ambulatoria" />`
 *      · `<app-marca [conTexto]="false" />` (solo isotipo; pon el nombre accesible fuera).
 */
@Component({
  selector: 'app-marca',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': '"marca marca--" + tamano()' },
  template: `
    <svg class="marca__isotipo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect class="marca__fondo" width="32" height="32" rx="9" />
      <path
        class="marca__brillo"
        d="M9 0h14a9 9 0 0 1 9 9v2.5C21 15.5 11 15.5 0 11.5V9a9 9 0 0 1 9-9z"
      />
      <path
        class="marca__cruz"
        d="M13.5 10a2.5 2.5 0 0 1 5 0v3.5H22a2.5 2.5 0 0 1 0 5h-3.5V22a2.5 2.5 0 0 1-5 0v-3.5H10a2.5 2.5 0 0 1 0-5h3.5z"
      />
      <circle class="marca__punto" cx="24.5" cy="7.5" r="3" />
    </svg>
    @if (conTexto()) {
      <span class="marca__texto">
        <span class="marca__nombre">SIGA-SP</span>
        @if (subtitulo(); as s) {
          <span class="marca__subtitulo">{{ s }}</span>
        }
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: var(--e-3);
      --marca-lado: 2.25rem;
    }

    :host(.marca--sm) {
      --marca-lado: 1.75rem;
      gap: var(--e-2);
    }

    :host(.marca--lg) {
      --marca-lado: 3rem;
    }

    .marca__isotipo {
      flex: none;
      width: var(--marca-lado);
      height: var(--marca-lado);
      border-radius: 28%;
      box-shadow: var(--sombra-1);
    }

    .marca__fondo {
      fill: var(--marca-fondo);
    }

    .marca__brillo {
      fill: var(--marca-simbolo);
      opacity: 0.1;
    }

    .marca__cruz {
      fill: var(--marca-simbolo);
    }

    .marca__punto {
      fill: var(--marca-acento);
      stroke: var(--marca-fondo);
      stroke-width: 1.5;
    }

    .marca__texto {
      display: flex;
      flex-direction: column;
      line-height: 1.1;
    }

    .marca__nombre {
      color: var(--c-texto);
      font-size: var(--t-18);
      font-weight: 750;
      letter-spacing: -0.02em;
    }

    :host(.marca--lg) .marca__nombre {
      font-size: var(--t-24);
    }

    .marca__subtitulo {
      color: var(--c-texto-2);
      font-size: var(--t-12);
      font-weight: 500;
      letter-spacing: 0.01em;
    }
  `,
})
export class MarcaComponent {
  readonly tamano = input<'sm' | 'md' | 'lg'>('md');
  readonly conTexto = input(true, { transform: booleanAttribute });
  readonly subtitulo = input<string | null>(null);
}
