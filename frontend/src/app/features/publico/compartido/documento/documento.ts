import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  inject,
  input,
} from '@angular/core';
import { IconoComponent } from '../../../../shared/ui/icono/icono';

export interface EntradaIndice {
  /** `id` del `h2` de la sección (con `tabindex="-1"`). */
  id: string;
  texto: string;
}

/** Versión vigente de un documento (p. ej. la política de privacidad que se acepta al registrarse). */
export interface VersionDocumento {
  numero: string;
  /** Fecha en texto, p. ej. «23 de octubre de 2026». */
  vigenteDesde: string;
}

/**
 * Página de contenido largo (Privacidad, Accesibilidad): encabezado con la versión vigente (o la
 * fecha de actualización),
 * índice «En esta página» (lateral y fijo en escritorio; al inicio en móvil) y el contenido
 * proyectado. Los enlaces del índice desplazan a la sección y le pasan el foco (no usan el
 * `<base href>` ni recargan). El estilo del contenido proyectado vive aquí, con el prefijo
 * `.doc`, para que las páginas solo escriban HTML semántico.
 */
@Component({
  selector: 'app-documento',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconoComponent],
  template: `
    <article class="doc" aria-labelledby="doc-titulo">
      <header class="doc__cabecera">
        @if (antetitulo(); as a) {
          <p class="doc__antetitulo">{{ a }}</p>
        }
        <h1 id="doc-titulo" class="doc__titulo">{{ titulo() }}</h1>
        @if (resumen(); as r) {
          <p class="doc__resumen">{{ r }}</p>
        }
        @if (version(); as v) {
          <p class="doc__meta">
            <app-icono nombre="calendar-check" />
            <span>Versión {{ v.numero }} · vigente desde el {{ v.vigenteDesde }}</span>
          </p>
        } @else if (actualizado()) {
          <p class="doc__meta">
            <app-icono nombre="calendar-check" />
            <span>Última actualización: {{ actualizado() }}</span>
          </p>
        }
      </header>

      <div class="doc__cuerpo">
        <nav class="doc__indice" aria-labelledby="doc-indice-titulo">
          <h2 id="doc-indice-titulo" class="doc__indice-titulo">En esta página</h2>
          <ol>
            @for (entrada of indice(); track entrada.id) {
              <li>
                <a [attr.href]="'#' + entrada.id" (click)="ir($event, entrada.id)">{{
                  entrada.texto
                }}</a>
              </li>
            }
          </ol>
        </nav>
        <div class="doc__contenido"><ng-content /></div>
      </div>
    </article>
  `,
  styles: `
    app-documento {
      display: block;
    }

    .doc__cabecera {
      max-width: 48rem;
      margin-bottom: var(--e-8);
    }

    .doc__antetitulo {
      margin-bottom: var(--e-2);
      color: var(--c-primario);
      font-size: var(--t-14);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .doc__titulo {
      font-size: var(--t-36);
    }

    .doc__resumen {
      color: var(--c-texto-2);
      font-size: var(--t-18);
    }

    .doc__meta {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
      margin: var(--e-2) 0 0;
      padding: var(--e-1) var(--e-3);
      border-radius: var(--r-pildora);
      background: var(--c-superficie-2);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      --icono-tamano: 0.875rem;
    }

    .doc__cuerpo {
      display: grid;
      gap: var(--e-8);
    }

    .doc__indice {
      align-self: start;
      padding: var(--e-4) var(--e-5);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-tarjeta);
      background: var(--c-superficie);
    }

    .doc__indice-titulo {
      margin-bottom: var(--e-2);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .doc__indice ol {
      margin: 0;
      padding: 0;
      list-style: none;
      counter-reset: indice;
    }

    .doc__indice li {
      counter-increment: indice;
    }

    .doc__indice a {
      display: flex;
      gap: var(--e-2);
      padding: var(--e-2) 0;
      color: var(--c-texto);
      font-size: var(--t-14);
      text-decoration: none;
    }

    .doc__indice a::before {
      content: counter(indice) '.';
      min-width: 1.25rem;
      color: var(--c-texto-2);
      font-variant-numeric: tabular-nums;
    }

    .doc__indice a:hover {
      color: var(--c-enlace);
      text-decoration: underline;
    }

    @media (min-width: 60rem) {
      .doc__cuerpo {
        grid-template-columns: 16rem minmax(0, 1fr);
        gap: var(--e-12);
      }

      .doc__indice {
        position: sticky;
        top: calc(var(--alto-cabecera) + var(--e-6));
      }
    }

    /* ----- Contenido proyectado ----- */

    .doc__contenido {
      max-width: 46rem;
    }

    .doc__contenido > section {
      padding-bottom: var(--e-8);
      margin-bottom: var(--e-8);
      border-bottom: 1px solid var(--c-borde);
    }

    .doc__contenido > section:last-child {
      margin-bottom: 0;
      border-bottom: 0;
    }

    .doc__contenido h2 {
      font-size: var(--t-24);
      scroll-margin-top: calc(var(--alto-cabecera) + var(--e-6));
    }

    .doc__contenido h2:focus-visible {
      outline-offset: 4px;
      border-radius: var(--r-sm);
    }

    .doc__contenido h3 {
      margin-top: var(--e-6);
      font-size: var(--t-18);
    }

    .doc__contenido p,
    .doc__contenido li {
      color: var(--c-texto);
    }

    .doc__contenido ul,
    .doc__contenido ol {
      margin: 0 0 var(--e-4);
      padding-left: var(--e-6);
    }

    .doc__contenido li + li {
      margin-top: var(--e-2);
    }

    .doc__contenido .doc__lista-iconos {
      display: grid;
      gap: var(--e-3);
      padding: 0;
      list-style: none;
    }

    .doc__contenido .doc__lista-iconos li {
      display: flex;
      align-items: flex-start;
      gap: var(--e-3);
      margin: 0;
    }

    .doc__contenido .doc__lista-iconos app-icono {
      flex: none;
      margin-top: 0.2em;
      color: var(--c-acento);
    }

    .doc__destacado {
      margin: var(--e-5) 0;
      padding: var(--e-4) var(--e-5);
      border-left: 4px solid var(--c-primario);
      border-radius: var(--r-sm);
      background: var(--c-primario-tenue);
    }

    .doc__destacado > :last-child {
      margin-bottom: 0;
    }

    .doc__contenido .doc__rejilla {
      display: grid;
      gap: var(--e-3);
      margin: var(--e-4) 0;
      padding: 0;
      list-style: none;
    }

    @media (min-width: 40rem) {
      .doc__contenido .doc__rejilla {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .doc__contenido .doc__rejilla > li {
      margin: 0;
      padding: var(--e-4);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-tarjeta);
      background: var(--c-superficie);
    }

    .doc__contenido .doc__rejilla strong {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      margin-bottom: var(--e-1);
      color: var(--c-primario-fuerte);
    }

    .doc__contenido .doc__rejilla p {
      margin: 0;
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }
  `,
})
export class DocumentoComponent {
  private readonly documento = inject(DOCUMENT);

  readonly titulo = input.required<string>();
  readonly antetitulo = input<string | null>(null);
  readonly resumen = input<string | null>(null);
  /** Fecha legible, p. ej. «23 de octubre de 2026» (si no se indica la versión). */
  readonly actualizado = input<string>('');
  /** Versión vigente; si se indica, se muestra en lugar de la fecha de actualización. */
  readonly version = input<VersionDocumento | null>(null);
  readonly indice = input<readonly EntradaIndice[]>([]);

  /** Desplaza a la sección y le pasa el foco (respeta «reducir movimiento»). */
  ir(evento: Event, id: string): void {
    const destino = this.documento.getElementById(id);
    if (!destino) return;
    evento.preventDefault();
    const reducido =
      this.documento.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    destino.scrollIntoView?.({ behavior: reducido ? 'auto' : 'smooth', block: 'start' });
    destino.focus({ preventScroll: true });
  }
}
