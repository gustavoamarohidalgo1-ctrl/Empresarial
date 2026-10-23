import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Especialidad } from '../../../core/modelos/contrato';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { filtrarEspecialidades, iconoEspecialidad } from './reserva-utils';

export type EstadoCargaPaso = 'cargando' | 'listo' | 'error';

/**
 * Paso 1 · Especialidad: buscador y tarjetas-opción (radios nativos: las flechas recorren el
 * grupo y elegir no cambia de paso por sí solo, WCAG 3.2.2). El resultado de la búsqueda se
 * anuncia de forma educada.
 */
@Component({
  selector: 'app-paso-especialidad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, EsqueletoComponent, EstadoVacioComponent, IconoComponent],
  template: `
    <div class="buscador campo">
      <label for="buscar-especialidad">Buscar especialidad</label>
      <div class="buscador__caja">
        <app-icono class="buscador__icono" nombre="search" />
        <input
          #buscador
          id="buscar-especialidad"
          class="control buscador__control"
          type="search"
          autocomplete="off"
          spellcheck="false"
          placeholder="Por ejemplo, cardiología"
          aria-describedby="buscar-especialidad-ayuda"
          [value]="termino()"
          [disabled]="estado() !== 'listo'"
          (input)="buscar($event)"
        />
      </div>
      <p id="buscar-especialidad-ayuda" class="ayuda">
        Busca por nombre o por lo que necesitas atender.
      </p>
    </div>

    <p class="solo-lectores" aria-live="polite">{{ anuncio() }}</p>

    <div [attr.aria-busy]="estado() === 'cargando'">
      @switch (estado()) {
        @case ('cargando') {
          <p class="solo-lectores" role="status">Cargando especialidades…</p>
          <div class="opciones" aria-hidden="true">
            @for (i of [1, 2, 3, 4, 5, 6]; track i) {
              <div class="opcion opcion--esqueleto">
                <app-esqueleto forma="bloque" ancho="2.75rem" alto="2.75rem" />
                <div class="opcion__textos">
                  <app-esqueleto forma="titulo" ancho="60%" />
                  <app-esqueleto ancho="85%" />
                </div>
              </div>
            }
          </div>
        }
        @case ('error') {
          <app-aviso tipo="error" titulo="No pudimos cargar las especialidades">
            <p>{{ error() }}</p>
            <div class="acciones">
              <button type="button" class="btn" (click)="reintentar.emit()">
                <app-icono nombre="refresh-cw" /> Reintentar
              </button>
            </div>
          </app-aviso>
        }
        @case ('listo') {
          @if (visibles().length) {
            <fieldset class="grupo">
              <legend class="solo-lectores">Especialidad</legend>
              <div class="opciones">
                @for (e of visibles(); track e.codigo) {
                  <label class="opcion">
                    <input
                      type="radio"
                      name="especialidad"
                      [value]="e.codigo"
                      [checked]="e.codigo === seleccionada()"
                      [attr.aria-labelledby]="'esp-nombre-' + e.codigo"
                      [attr.aria-describedby]="e.descripcion ? 'esp-desc-' + e.codigo : null"
                      (change)="elegir.emit(e.codigo)"
                    />
                    <span class="opcion__icono" aria-hidden="true"
                      ><app-icono [nombre]="icono(e)"
                    /></span>
                    <span class="opcion__textos">
                      <span class="opcion__nombre" [id]="'esp-nombre-' + e.codigo">{{
                        e.nombre
                      }}</span>
                      @if (e.descripcion) {
                        <span class="opcion__descripcion" [id]="'esp-desc-' + e.codigo">{{
                          e.descripcion
                        }}</span>
                      }
                    </span>
                    <app-icono class="opcion__marca" nombre="check-circle" />
                  </label>
                }
              </div>
            </fieldset>
          } @else if (termino()) {
            <app-estado-vacio
              compacto
              [nivel]="3"
              ilustracion="busqueda"
              titulo="No encontramos esa especialidad"
              [texto]="
                'Ninguna especialidad coincide con «' +
                termino() +
                '». Revisa la escritura o busca con otra palabra.'
              "
            >
              <button acciones type="button" class="btn" (click)="limpiar()">
                <app-icono nombre="x" /> Limpiar búsqueda
              </button>
            </app-estado-vacio>
          } @else {
            <app-estado-vacio
              compacto
              [nivel]="3"
              ilustracion="calendario"
              titulo="No hay especialidades disponibles"
              texto="Por ahora no hay especialidades abiertas a reserva en línea. Vuelve a intentarlo más tarde."
            />
          }
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .buscador {
      max-width: 28rem;
      margin-bottom: var(--e-5);
    }

    .buscador__caja {
      position: relative;
    }

    .buscador__icono {
      position: absolute;
      top: 50%;
      left: var(--e-3);
      color: var(--c-texto-2);
      transform: translateY(-50%);
      pointer-events: none;
      --icono-tamano: 1.125rem;
    }

    .buscador__control {
      padding-left: var(--e-10);
    }

    .grupo {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }

    .opciones {
      display: grid;
      gap: var(--e-3);
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 15rem), 1fr));
    }

    .opcion {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: var(--e-3);
      min-height: 5.5rem;
      padding: var(--e-4);
      padding-right: var(--e-10);
      border: 1px solid var(--c-borde-control);
      border-radius: var(--r-tarjeta);
      background: var(--c-superficie);
      cursor: pointer;
      transition:
        border-color var(--dur-1) var(--curva),
        background-color var(--dur-1) var(--curva),
        box-shadow var(--dur-1) var(--curva);
    }

    .opcion--esqueleto {
      border-color: var(--c-borde);
      cursor: default;
    }

    .opcion:not(.opcion--esqueleto):hover {
      border-color: var(--c-primario);
      box-shadow: var(--sombra-1);
    }

    .opcion input {
      position: absolute;
      opacity: 0;
      pointer-events: none;
    }

    .opcion:has(input:focus-visible) {
      outline: 3px solid var(--c-foco);
      outline-offset: 2px;
    }

    .opcion:has(input:checked) {
      border-color: var(--c-primario);
      background: var(--c-primario-tenue);
      box-shadow: inset 0 0 0 1px var(--c-primario);
    }

    .opcion__icono {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: var(--r-control);
      background: var(--c-primario-suave);
      color: var(--c-primario);
      --icono-tamano: 1.375rem;
    }

    .opcion:has(input:checked) .opcion__icono {
      background: var(--c-primario);
      color: var(--c-sobre-primario);
    }

    .opcion__textos {
      display: grid;
      flex: 1;
      gap: var(--e-1);
      min-width: 0;
    }

    .opcion__nombre {
      font-weight: 650;
      line-height: 1.3;
    }

    .opcion__descripcion {
      color: var(--c-texto-2);
      font-size: var(--t-14);
      line-height: 1.4;
    }

    .opcion__marca {
      position: absolute;
      top: var(--e-3);
      right: var(--e-3);
      color: var(--c-primario);
      opacity: 0;
      transform: scale(0.6);
      transition:
        opacity var(--dur-1) var(--curva),
        transform var(--dur-2) var(--curva);
      --icono-tamano: 1.25rem;
    }

    .opcion:has(input:checked) .opcion__marca {
      opacity: 1;
      transform: none;
    }

    @media (forced-colors: active) {
      .opcion:has(input:checked) {
        outline: 2px solid Highlight;
      }
    }
  `,
})
export class PasoEspecialidadComponent {
  readonly especialidades = input<readonly Especialidad[]>([]);
  readonly estado = input<EstadoCargaPaso>('cargando');
  readonly error = input('');
  readonly seleccionada = input<string | null>(null);
  readonly elegir = output<string>();
  readonly reintentar = output<void>();

  private readonly buscador = viewChild<ElementRef<HTMLInputElement>>('buscador');

  protected readonly termino = signal('');
  protected readonly visibles = computed(() =>
    filtrarEspecialidades(this.especialidades(), this.termino()),
  );
  /** Solo se anuncia mientras hay una búsqueda escrita. */
  protected readonly anuncio = computed(() => {
    if (!this.termino().trim() || this.estado() !== 'listo') return '';
    const n = this.visibles().length;
    if (n === 0) return 'Ninguna especialidad coincide con la búsqueda.';
    return n === 1 ? '1 especialidad coincide.' : `${n} especialidades coinciden.`;
  });

  protected icono = iconoEspecialidad;

  protected buscar(evento: Event): void {
    this.termino.set((evento.target as HTMLInputElement).value);
  }

  protected limpiar(): void {
    this.termino.set('');
    this.buscador()?.nativeElement.focus();
  }
}
