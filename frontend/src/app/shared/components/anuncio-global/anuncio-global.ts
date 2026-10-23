import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injector, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnuncioService } from '../../../core/sistema/anuncio.service';
import { AvisoComponent } from '../../ui/aviso/aviso';
import { IconoComponent } from '../../ui/icono/icono';
import { enfocarTrasRenderizar } from '../../utils/foco';

/**
 * Anuncio global de la app (`AnuncioService`, p. ej. la bienvenida tras crear la cuenta):
 * aviso con título, texto, acción opcional y «Cerrar aviso». Al cerrarlo, el foco va al
 * contenido principal (el botón desaparece).
 *
 * La app lo crea en diferido dentro de su región `aria-live` la primera vez que hay un anuncio:
 * es raro (no hace falta en el primer render) y así no pesa en el bundle inicial.
 */
@Component({
  selector: 'app-anuncio-global',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AvisoComponent, IconoComponent],
  template: `
    @if (anuncio(); as a) {
      <app-aviso class="anuncio-global__aviso" [tipo]="a.tipo">
        <div class="anuncio-global__cuerpo">
          <p class="anuncio-global__titulo">{{ a.titulo }}</p>
          <p>{{ a.texto }}</p>
          @if (a.accion; as accion) {
            <div class="acciones">
              <a class="btn btn--sm btn--primario" [routerLink]="accion.ruta">{{ accion.texto }}</a>
            </div>
          }
        </div>
        <button
          type="button"
          class="btn btn--fantasma btn--icono btn--sm anuncio-global__cerrar"
          (click)="cerrar()"
        >
          <app-icono nombre="x" />
          <span class="solo-lectores">Cerrar aviso</span>
        </button>
      </app-aviso>
    }
  `,
  styles: `
    :host {
      display: contents;
    }

    .anuncio-global__aviso {
      position: relative;
      display: block;
      margin-bottom: var(--e-2);
      animation: anuncio-aparece var(--dur-2) var(--curva);
    }

    .anuncio-global__cuerpo {
      padding-inline-end: var(--e-10);
    }

    .anuncio-global__titulo {
      margin-bottom: var(--e-1);
      color: var(--aviso-color);
      font-weight: 700;
    }

    .anuncio-global__cerrar {
      position: absolute;
      top: var(--e-2);
      right: var(--e-2);
    }

    @keyframes anuncio-aparece {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
  `,
})
export class AnuncioGlobalComponent {
  private readonly anuncios = inject(AnuncioService);
  private readonly documento = inject(DOCUMENT);
  private readonly inyector = inject(Injector);

  protected readonly anuncio = this.anuncios.visible;

  /** Cierra el anuncio y deja el foco en el contenido principal. */
  cerrar(): void {
    this.anuncios.descartar();
    enfocarTrasRenderizar(this.inyector, () => this.documento.getElementById('contenido'));
  }
}
