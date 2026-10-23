import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../icono/icono';

/** Un paso de las migas de pan. El último es la página actual (sin enlace). */
export interface Miga {
  texto: string;
  /** Ruta del `routerLink` (cadena o arreglo de segmentos). */
  ruta?: string | readonly unknown[] | null;
}

/**
 * Encabezado de página: migas de pan, título (h1), subtítulo y acciones.
 *
 * Ranuras de contenido:
 * - `[junto-al-titulo]`: algo al lado del h1 (p. ej. `<app-estado-cita junto-al-titulo …/>`).
 * - `[acciones]`: botones o enlaces alineados a la derecha en escritorio.
 * - contenido sin atributo: texto adicional bajo el subtítulo.
 *
 * Uso:
 * ```html
 * <app-encabezado-pagina titulo="Detalle de cita" subtitulo="Hora de Lima"
 *   [migas]="[{ texto: 'Mis citas', ruta: '/paciente/citas' }, { texto: 'CIT001' }]">
 *   <app-estado-cita junto-al-titulo [estado]="c.estado" />
 *   <a acciones class="btn" routerLink="…">Reprogramar</a>
 * </app-encabezado-pagina>
 * ```
 */
@Component({
  selector: 'app-encabezado-pagina',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent],
  template: `
    @if (migas().length) {
      <nav class="ep__migas" aria-label="Migas de pan">
        <ol>
          @for (m of migas(); track $index; let ultima = $last) {
            <li>
              @if (m.ruta && !ultima) {
                <a [routerLink]="m.ruta">{{ m.texto }}</a>
                <app-icono class="ep__separador" nombre="chevron-right" />
              } @else {
                <span [attr.aria-current]="ultima ? 'page' : null">{{ m.texto }}</span>
              }
            </li>
          }
        </ol>
      </nav>
    }
    <div class="ep__fila">
      <div class="ep__textos">
        <div class="ep__titulo-fila">
          <h1 class="ep__titulo" [attr.id]="tituloId()">{{ titulo() }}</h1>
          <ng-content select="[junto-al-titulo]" />
        </div>
        @if (subtitulo(); as s) {
          <p class="ep__subtitulo">{{ s }}</p>
        }
        <ng-content />
      </div>
      <div class="ep__acciones"><ng-content select="[acciones]" /></div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--e-6);
    }

    .ep__migas ol {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-1);
      margin: 0 0 var(--e-3);
      padding: 0;
      list-style: none;
      font-size: var(--t-14);
    }

    .ep__migas li {
      display: inline-flex;
      align-items: center;
      gap: var(--e-1);
      min-width: 0;
      color: var(--c-texto-2);
    }

    .ep__migas a {
      position: relative;
      display: inline-flex;
      align-items: center;
      min-height: 1.5rem;
      color: var(--c-texto-2);
      font-weight: 500;
      text-decoration: none;
    }

    /* Amplía el área táctil a 44 px de alto sin cambiar el diseño de las migas. */
    .ep__migas a::before {
      content: '';
      position: absolute;
      inset: -0.625rem 0;
    }

    .ep__migas a:hover {
      color: var(--c-enlace);
      text-decoration: underline;
    }

    .ep__migas [aria-current] {
      color: var(--c-texto);
      font-weight: 600;
    }

    .ep__separador {
      --icono-tamano: 0.875rem;
      color: var(--c-texto-2);
    }

    .ep__fila {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--e-4) var(--e-6);
    }

    .ep__textos {
      flex: 1 1 20rem;
      min-width: 0;
    }

    .ep__titulo-fila {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-2) var(--e-3);
    }

    .ep__titulo {
      margin: 0;
    }

    .ep__subtitulo {
      margin: var(--e-2) 0 0;
      color: var(--c-texto-2);
      font-size: var(--t-16);
    }

    .ep__acciones {
      display: flex;
      flex-wrap: wrap;
      gap: var(--e-3);
    }

    .ep__acciones:empty {
      display: none;
    }
  `,
})
export class EncabezadoPaginaComponent {
  readonly titulo = input.required<string>();
  readonly subtitulo = input<string | null>(null);
  readonly migas = input<readonly Miga[]>([]);
  /** `id` del h1, para `aria-labelledby` de la página o de una región. */
  readonly tituloId = input<string | null>(null);
}
