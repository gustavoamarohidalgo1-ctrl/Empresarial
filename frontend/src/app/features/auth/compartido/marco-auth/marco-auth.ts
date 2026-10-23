import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { IconoComponent } from '../../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../../shared/ui/icono/iconos';
import { MarcaComponent } from '../../../../shared/ui/marca/marca';

export interface PanelAuth {
  titulo: string;
  puntos: readonly { icono: NombreIcono; titulo: string; texto: string }[];
  nota?: string;
}

/**
 * Marco de las pantallas de cuenta (crear cuenta, recuperar y restablecer contraseña):
 * tarjeta con la marca, antetítulo, título (h1, enfocable para mover el foco tras una acción)
 * e introducción, y el contenido proyectado. Con `panel`, en pantallas anchas se añade un
 * panel de marca con beneficios, como en el inicio de sesión.
 */
@Component({
  selector: 'app-marco-auth',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, MarcaComponent],
  template: `
    <div class="ma" [class.ma--panel]="!!panel()">
      <section class="ma__principal" [attr.aria-labelledby]="idTitulo()">
        <div class="ma__contenido">
          <app-marca class="ma__marca" tamano="lg" [conTexto]="false" />
          @if (antetitulo(); as a) {
            <p class="ma__antetitulo">{{ a }}</p>
          }
          <h1 #encabezado class="ma__titulo" [id]="idTitulo()" tabindex="-1">{{ titulo() }}</h1>
          @if (intro(); as i) {
            <p class="ma__intro">{{ i }}</p>
          }
          <ng-content />
        </div>
      </section>

      @if (panel(); as p) {
        <aside class="ma__panel" [attr.aria-labelledby]="idTitulo() + '-panel'">
          <app-marca class="ma__marca-panel" subtitulo="Atención ambulatoria" />
          <div>
            <h2 class="ma__panel-titulo" [id]="idTitulo() + '-panel'">{{ p.titulo }}</h2>
            <ul class="ma__puntos">
              @for (punto of p.puntos; track punto.titulo) {
                <li>
                  <span class="ma__punto-icono"><app-icono [nombre]="punto.icono" /></span>
                  <span>
                    <strong>{{ punto.titulo }}</strong>
                    <span class="ma__punto-texto">{{ punto.texto }}</span>
                  </span>
                </li>
              }
            </ul>
          </div>
          @if (p.nota; as nota) {
            <p class="ma__nota">
              <app-icono nombre="shield-check" /> <span>{{ nota }}</span>
            </p>
          }
        </aside>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .ma {
      display: grid;
      max-width: 32rem;
      margin-inline: auto;
      overflow: hidden;
      border: 1px solid var(--c-borde);
      border-radius: var(--r-bloque);
      background: var(--c-superficie);
      box-shadow: var(--sombra-2);
    }

    .ma__principal {
      padding: var(--e-8) var(--e-5);
    }

    .ma__contenido {
      width: 100%;
      max-width: 34rem;
      margin-inline: auto;
    }

    .ma__marca {
      margin-bottom: var(--e-5);
    }

    .ma__antetitulo {
      margin: 0 0 var(--e-1);
      color: var(--c-primario);
      font-size: var(--t-14);
      font-weight: 600;
    }

    .ma__titulo {
      margin-bottom: var(--e-2);
    }

    .ma__titulo:focus-visible {
      outline-offset: 4px;
      border-radius: var(--r-sm);
    }

    .ma__intro {
      margin-bottom: var(--e-6);
      color: var(--c-texto-2);
    }

    .ma__panel {
      display: none;
    }

    @media (min-width: 48rem) {
      .ma__principal {
        padding: var(--e-10) var(--e-8);
      }

      .ma--panel {
        max-width: 44rem;
      }
    }

    @media (min-width: 60rem) {
      .ma--panel {
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
        max-width: 68rem;
      }

      .ma--panel .ma__marca {
        display: none;
      }

      /* Texto blanco sobre el violeta de la marca, como el panel del inicio de sesión. */
      .ma__panel {
        --c-texto: var(--marca-simbolo);
        --c-texto-2: color-mix(in srgb, var(--marca-simbolo) 88%, var(--marca-fondo));
        --translucido: color-mix(in srgb, var(--marca-simbolo) 14%, transparent);
        order: -1;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        gap: var(--e-8);
        padding: var(--e-10) var(--e-8);
        color: var(--c-texto);
        background-color: var(--marca-fondo);
        background-image:
          radial-gradient(
            circle at 100% 0%,
            color-mix(in srgb, var(--marca-acento) 20%, transparent),
            transparent 45%
          ),
          radial-gradient(circle at 0% 100%, var(--translucido), transparent 50%),
          linear-gradient(180deg, transparent 40%, var(--c-velo));
      }
    }

    .ma__marca-panel {
      --marca-fondo: var(--translucido);
    }

    .ma__panel-titulo {
      max-width: 20ch;
      margin-bottom: var(--e-6);
      font-size: var(--t-24);
    }

    .ma__puntos {
      display: grid;
      gap: var(--e-5);
      margin: 0;
      padding: 0;
      list-style: none;
      font-size: var(--t-14);
    }

    .ma__puntos li {
      display: flex;
      align-items: flex-start;
      gap: var(--e-3);
    }

    .ma__puntos strong {
      display: block;
      font-size: var(--t-16);
    }

    .ma__punto-texto {
      color: var(--c-texto-2);
    }

    .ma__punto-icono {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.5rem;
      height: 2.5rem;
      border: 1px solid var(--translucido);
      border-radius: var(--r-control);
      background: var(--translucido);
    }

    .ma__nota {
      display: flex;
      align-items: flex-start;
      gap: var(--e-2);
      margin: 0;
      padding-top: var(--e-4);
      border-top: 1px solid var(--translucido);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      --icono-tamano: 1rem;
    }
  `,
})
export class MarcoAuthComponent {
  readonly titulo = input.required<string>();
  readonly idTitulo = input('auth-titulo');
  readonly antetitulo = input<string | null>(null);
  readonly intro = input<string | null>(null);
  readonly panel = input<PanelAuth | null>(null);

  private readonly tituloRef = viewChild.required<ElementRef<HTMLHeadingElement>>('encabezado');

  /** Lleva el foco al título (p. ej. cuando el contenido cambia tras enviar). */
  enfocarTitulo(): void {
    this.tituloRef().nativeElement.focus();
  }
}
