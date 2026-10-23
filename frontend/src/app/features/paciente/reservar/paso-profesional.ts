import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ProfesionalCatalogo } from '../../../core/modelos/contrato';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { cuentaRegresivaLima, formatearHora } from '../../../shared/utils/fecha-lima';
import { EstadoCargaPaso } from './paso-especialidad';
import {
  CUALQUIER_PROFESIONAL,
  DIAS_VENTANA,
  ResumenProfesional,
  inicialesProfesional,
} from './reserva-utils';

/**
 * Paso 2 · Profesional: «Cualquier profesional disponible» (recomendado) o uno de la
 * especialidad. Cada opción muestra su sede y su próximo horario libre, que se calculan con la
 * disponibilidad de las próximas dos semanas (el catálogo de profesionales no trae la sede).
 */
@Component({
  selector: 'app-paso-profesional',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvisoComponent, EsqueletoComponent, EstadoVacioComponent, IconoComponent],
  template: `
    <div [attr.aria-busy]="estado() === 'cargando'">
      @switch (estado()) {
        @case ('cargando') {
          <p class="solo-lectores" role="status">Cargando profesionales…</p>
          <div class="lista" aria-hidden="true">
            @for (i of [1, 2, 3]; track i) {
              <div class="opcion opcion--esqueleto">
                <app-esqueleto forma="circulo" ancho="2.75rem" alto="2.75rem" />
                <div class="opcion__textos">
                  <app-esqueleto forma="titulo" ancho="55%" />
                  <app-esqueleto [lineas]="2" />
                </div>
              </div>
            }
          </div>
        }
        @case ('error') {
          <app-aviso tipo="error" titulo="No pudimos cargar los profesionales">
            <p>{{ error() }}</p>
            <div class="acciones">
              <button type="button" class="btn" (click)="reintentar.emit()">
                <app-icono nombre="refresh-cw" /> Reintentar
              </button>
            </div>
          </app-aviso>
        }
        @case ('listo') {
          @if (profesionales().length) {
            <fieldset class="grupo">
              <legend class="solo-lectores">Profesional</legend>
              <div class="lista">
                <label class="opcion opcion--recomendada">
                  <input
                    type="radio"
                    name="profesional"
                    [value]="cualquiera"
                    [checked]="seleccionado() === cualquiera"
                    aria-labelledby="prof-nombre-todos"
                    aria-describedby="prof-detalle-todos"
                    (change)="elegir.emit(cualquiera)"
                  />
                  <span class="avatar avatar--todos" aria-hidden="true"
                    ><app-icono nombre="users"
                  /></span>
                  <span class="opcion__textos">
                    <span class="opcion__cabecera">
                      <span class="opcion__nombre" id="prof-nombre-todos"
                        >Cualquier profesional disponible</span
                      >
                      <span class="insignia insignia--acento">Recomendado</span>
                    </span>
                    <span class="opcion__detalles" id="prof-detalle-todos">
                      <span class="opcion__detalle">
                        Verás los horarios de todos los profesionales de
                        {{ especialidadNombre() }} y podrás elegir el más próximo.
                      </span>
                      @if (resumen() === null) {
                        <span class="opcion__dato opcion__dato--cargando"
                          ><app-esqueleto ancho="12rem"
                        /></span>
                      } @else if (totalGeneral() > 0) {
                        <span class="opcion__dato opcion__dato--acento">
                          <app-icono nombre="clock" />{{ textoTotal(totalGeneral()) }} · próximo
                          {{ textoProximo(proximoGeneral()) }}
                        </span>
                      }
                    </span>
                  </span>
                  <app-icono class="opcion__marca" nombre="check-circle" />
                </label>

                @for (p of profesionales(); track p.codigo) {
                  @let r = resumen()?.get(p.codigo);
                  <label class="opcion">
                    <input
                      type="radio"
                      name="profesional"
                      [value]="p.codigo"
                      [checked]="seleccionado() === p.codigo"
                      [attr.aria-labelledby]="'prof-nombre-' + p.codigo"
                      [attr.aria-describedby]="'prof-detalle-' + p.codigo"
                      (change)="elegir.emit(p.codigo)"
                    />
                    <span class="avatar" aria-hidden="true">{{ iniciales(p.nombre) }}</span>
                    <span class="opcion__textos">
                      <span class="opcion__nombre" [id]="'prof-nombre-' + p.codigo">{{
                        p.nombre
                      }}</span>
                      <span class="opcion__detalles" [id]="'prof-detalle-' + p.codigo">
                        <span class="opcion__detalle">{{ p.especialidad.nombre }}</span>
                        @if (resumen() === null) {
                          <span class="opcion__dato opcion__dato--cargando"
                            ><app-esqueleto ancho="10rem"
                          /></span>
                        } @else if (r) {
                          <span class="opcion__dato">
                            <app-icono nombre="building" /><span class="solo-lectores">Sede: </span
                            >{{ nombresSedes(r) }}
                          </span>
                          <span class="opcion__dato opcion__dato--acento">
                            <app-icono nombre="clock" />Próximo horario:
                            {{ textoProximo(r.proximo) }}
                          </span>
                        } @else if (!resumenError()) {
                          <span class="opcion__dato">
                            <app-icono nombre="calendar-x" />Sin horarios libres en las próximas
                            {{ semanas }} semanas
                          </span>
                        }
                      </span>
                    </span>
                    <app-icono class="opcion__marca" nombre="check-circle" />
                  </label>
                }
              </div>
            </fieldset>
            @if (resumenError()) {
              <p class="nota texto-sm">
                <app-icono nombre="info" />
                <span
                  >No pudimos consultar la disponibilidad de cada profesional; la verás en el
                  siguiente paso.</span
                >
              </p>
            }
          } @else {
            <app-estado-vacio
              compacto
              [nivel]="3"
              ilustracion="busqueda"
              titulo="No hay profesionales para esta especialidad"
              texto="Por ahora nadie atiende esta especialidad con reserva en línea. Elige otra especialidad."
            >
              <button acciones type="button" class="btn" (click)="cambiarEspecialidad.emit()">
                <app-icono nombre="arrow-left" /> Elegir otra especialidad
              </button>
            </app-estado-vacio>
          }
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .grupo {
      min-width: 0;
      margin: 0;
      padding: 0;
      border: 0;
    }

    .lista {
      display: grid;
      gap: var(--e-3);
    }

    @media (min-width: 48rem) {
      .lista {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }

      .opcion--recomendada {
        grid-column: 1 / -1;
      }
    }

    .opcion {
      position: relative;
      display: flex;
      align-items: flex-start;
      gap: var(--e-3);
      min-height: 6rem;
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

    .opcion--recomendada {
      border-style: dashed;
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
      border-style: solid;
      border-color: var(--c-primario);
      background: var(--c-primario-tenue);
      box-shadow: inset 0 0 0 1px var(--c-primario);
    }

    .avatar {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      font-size: var(--t-14);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .avatar--todos {
      background: var(--c-acento-suave);
      color: var(--c-acento);
      --icono-tamano: 1.375rem;
    }

    .opcion__textos {
      display: grid;
      flex: 1;
      gap: var(--e-1);
      min-width: 0;
    }

    .opcion__detalles {
      display: grid;
      gap: var(--e-1);
    }

    .opcion__cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-2);
    }

    .opcion__nombre {
      font-weight: 650;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    .opcion__detalle {
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .opcion__dato {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      overflow-wrap: anywhere;
      --icono-tamano: 0.875rem;
    }

    .opcion__dato--acento {
      color: var(--c-acento);
      font-weight: 600;
    }

    .opcion__dato--cargando {
      min-height: 1.25rem;
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

    .nota {
      display: flex;
      align-items: flex-start;
      gap: var(--e-2);
      margin: var(--e-4) 0 0;
      color: var(--c-texto-2);
      --icono-tamano: 1rem;
    }

    .nota app-icono {
      margin-top: 0.15em;
      color: var(--c-info);
    }

    @media (forced-colors: active) {
      .opcion:has(input:checked) {
        outline: 2px solid Highlight;
      }
    }
  `,
})
export class PasoProfesionalComponent {
  readonly profesionales = input<readonly ProfesionalCatalogo[]>([]);
  readonly estado = input<EstadoCargaPaso>('cargando');
  readonly error = input('');
  readonly especialidadNombre = input('');
  /** Código elegido, o `CUALQUIER_PROFESIONAL`. */
  readonly seleccionado = input<string>(CUALQUIER_PROFESIONAL);
  /** Disponibilidad por profesional; `null` mientras se consulta. */
  readonly resumen = input<ReadonlyMap<string, ResumenProfesional> | null>(null);
  readonly resumenError = input(false);
  /** Momento de referencia para «hoy» y «mañana». */
  readonly ahora = input<Date>(new Date());
  readonly elegir = output<string>();
  readonly reintentar = output<void>();
  readonly cambiarEspecialidad = output<void>();

  protected readonly cualquiera = CUALQUIER_PROFESIONAL;
  protected readonly semanas = DIAS_VENTANA / 7;
  protected readonly iniciales = inicialesProfesional;

  protected readonly totalGeneral = computed(() => {
    let total = 0;
    for (const r of this.resumen()?.values() ?? []) total += r.total;
    return total;
  });

  protected readonly proximoGeneral = computed(() => {
    let proximo: string | null = null;
    for (const r of this.resumen()?.values() ?? []) {
      if (r.proximo && (!proximo || r.proximo < proximo)) proximo = r.proximo;
    }
    return proximo;
  });

  protected textoTotal(n: number): string {
    return n === 1 ? '1 horario libre' : `${n} horarios libres`;
  }

  /** «hoy a las 09:00», «mañana a las 09:00» o «en 3 días, 09:00». */
  protected textoProximo(inicio: string | null): string {
    if (!inicio) return '';
    const texto = cuentaRegresivaLima(inicio, this.ahora());
    return texto.includes(' a las ') ? texto : `${texto}, ${formatearHora(inicio)}`;
  }

  protected nombresSedes(r: ResumenProfesional): string {
    return r.sedes.map((s) => s.nombre).join(' · ');
  }
}
