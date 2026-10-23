import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { HorarioReserva } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { EstadoCargaPaso } from './paso-especialidad';
import { DiaReserva, agruparPorDia, sedesDe } from './reserva-utils';

/** Regla del servidor: solo se reservan horarios que empiezan al menos 2 horas después. */
export const NOTA_ANTICIPACION = 'Puedes reservar con al menos 2 horas de anticipación.';

/**
 * Paso 3 · Fecha y hora. Mismo lenguaje visual que «Reprogramar»: chips de días con el número
 * de horarios libres y una rejilla de horas por franja (mañana, tarde, noche). Con «Cualquier
 * profesional», cada hora muestra su profesional y su sede. Permite moverse por ventanas de dos
 * semanas y, si hay varias sedes, filtrar por sede. Una nota discreta recuerda la anticipación
 * mínima de 2 horas (el servidor solo ofrece y acepta esos horarios).
 */
@Component({
  selector: 'app-paso-horario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    IconoComponent,
    FechaLimaPipe,
  ],
  template: `
    <div class="barra">
      <p class="barra__rango">
        <app-icono nombre="calendar" /><span>{{ rango() }}</span>
      </p>
      <div class="barra__botones" role="group" aria-label="Cambiar fechas">
        <button
          type="button"
          class="btn btn--sm"
          [disabled]="!puedeRetroceder() || estado() === 'cargando'"
          (click)="cambiarVentana.emit(-1)"
        >
          <app-icono nombre="chevron-left" /> Anteriores
        </button>
        <button
          type="button"
          class="btn btn--sm"
          [disabled]="!puedeAvanzar() || estado() === 'cargando'"
          (click)="cambiarVentana.emit(1)"
        >
          Siguientes <app-icono nombre="chevron-right" />
        </button>
        <button
          type="button"
          class="btn btn--sm btn--fantasma"
          [class.btn--cargando]="estado() === 'cargando'"
          [disabled]="estado() === 'cargando'"
          (click)="actualizar.emit()"
        >
          <app-icono nombre="refresh-cw" /> Actualizar
        </button>
      </div>
    </div>

    <p class="nota-anticipacion">
      <app-icono nombre="clock" /><span>{{ notaAnticipacion }}</span>
    </p>

    <p class="solo-lectores" aria-live="polite">{{ anuncio() }}</p>

    <div class="horarios" [attr.aria-busy]="estado() === 'cargando'">
      @switch (estado()) {
        @case ('cargando') {
          <p class="solo-lectores" role="status">Buscando horarios disponibles…</p>
          <div aria-hidden="true">
            <app-esqueleto class="esqueleto-leyenda" ancho="3rem" />
            <div class="dias__lista esqueleto-dias">
              @for (i of [1, 2, 3, 4, 5]; track i) {
                <app-esqueleto forma="bloque" ancho="4.5rem" alto="6.5rem" />
              }
            </div>
            <app-esqueleto class="esqueleto-leyenda" ancho="45%" />
            <div class="horas__rejilla" [class.horas__rejilla--detalle]="mostrarProfesional()">
              @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                <app-esqueleto forma="bloque" [alto]="mostrarProfesional() ? '6rem' : '4rem'" />
              }
            </div>
          </div>
        }
        @case ('error') {
          <app-aviso tipo="error" titulo="No pudimos cargar los horarios">
            <p>{{ error() }}</p>
            <div class="acciones">
              <button type="button" class="btn" (click)="actualizar.emit()">
                <app-icono nombre="refresh-cw" /> Reintentar
              </button>
            </div>
          </app-aviso>
        }
        @case ('listo') {
          @if (diaActivo(); as dia) {
            @if (sedes().length > 1) {
              <div class="chips filtro" role="group" aria-label="Filtrar por sede">
                <button
                  type="button"
                  class="chip"
                  [attr.aria-pressed]="!sedeEfectiva()"
                  (click)="elegirSede.emit(null)"
                >
                  Todas las sedes
                </button>
                @for (s of sedes(); track s.codigo) {
                  <button
                    type="button"
                    class="chip"
                    [attr.aria-pressed]="sedeEfectiva() === s.codigo"
                    (click)="elegirSede.emit(s.codigo)"
                  >
                    <app-icono nombre="building" /> {{ s.nombre }}
                  </button>
                }
              </div>
            }

            <fieldset class="dias">
              <legend class="grupo__titulo">Día</legend>
              <div class="dias__lista">
                @for (d of dias(); track d.clave) {
                  <label class="chip dia">
                    <input
                      type="radio"
                      name="dia-reserva"
                      [value]="d.clave"
                      [checked]="d.clave === dia.clave"
                      (change)="elegirDia.emit(d.clave)"
                    />
                    <span class="dia__semana" aria-hidden="true">{{ d.semana }}</span>
                    <span class="dia__numero" aria-hidden="true">{{ d.dia }}</span>
                    <span class="dia__mes" aria-hidden="true">{{ d.mes }}</span>
                    <span class="solo-lectores dia__titulo">{{ d.titulo }}, </span>
                    <span class="chip__contador"
                      >{{ d.horarios.length
                      }}<span class="solo-lectores">
                        {{ d.horarios.length === 1 ? 'horario libre' : 'horarios libres' }}</span
                      ></span
                    >
                  </label>
                }
              </div>
            </fieldset>

            <fieldset class="horas">
              <legend class="grupo__titulo">
                Hora <span class="horas__dia">· {{ dia.titulo }}</span>
              </legend>
              @for (f of dia.franjas; track f.franja) {
                <div class="franja" role="group" [attr.aria-label]="f.franja">
                  <p class="franja__titulo" aria-hidden="true">{{ f.franja }}</p>
                  <div
                    class="horas__rejilla"
                    [class.horas__rejilla--detalle]="mostrarProfesional()"
                  >
                    @for (h of f.horarios; track h.horarioId) {
                      <label class="hora">
                        <input
                          type="radio"
                          name="horario-reserva"
                          [value]="h.horarioId"
                          [checked]="seleccionado() === h.horarioId"
                          (change)="elegir.emit(h)"
                        />
                        <span class="hora__inicio">{{ h.inicio | fechaLima: 'hora' }}</span>
                        <span class="hora__fin"> – {{ h.fin | fechaLima: 'hora' }}</span>
                        @if (mostrarProfesional()) {
                          <span class="hora__extra hora__profesional"
                            ><span class="solo-lectores">, con </span
                            >{{ h.profesional.nombre }}</span
                          >
                        }
                        @if (mostrarProfesional() || (sedes().length > 1 && !sedeEfectiva())) {
                          <span class="hora__extra"
                            ><span class="solo-lectores">, en </span>{{ h.sede.nombre }}</span
                          >
                        }
                        <app-icono class="hora__marca" nombre="check-circle" />
                      </label>
                    }
                  </div>
                </div>
              }
            </fieldset>
          } @else {
            <app-estado-vacio
              compacto
              [nivel]="3"
              ilustracion="calendario"
              titulo="No hay horarios en estas fechas"
              texto="Busca en otras fechas o elige otro profesional."
            >
              <div acciones class="acciones">
                @if (puedeAvanzar()) {
                  <button type="button" class="btn btn--primario" (click)="cambiarVentana.emit(1)">
                    Ver fechas siguientes <app-icono nombre="arrow-right" />
                  </button>
                }
                <button type="button" class="btn" (click)="cambiarProfesional.emit()">
                  <app-icono nombre="user" /> Cambiar profesional
                </button>
              </div>
            </app-estado-vacio>
          }
        }
      }
    </div>
  `,
  styleUrl: './paso-horario.css',
})
export class PasoHorarioComponent {
  readonly horarios = input<readonly HorarioReserva[]>([]);
  readonly estado = input<EstadoCargaPaso>('cargando');
  readonly error = input('');
  readonly seleccionado = input<string | null>(null);
  readonly diaElegido = input<string | null>(null);
  readonly sede = input<string | null>(null);
  /** «Cualquier profesional»: cada hora muestra el profesional y la sede. */
  readonly mostrarProfesional = input(false);
  /** «del 23 oct 2026 al 05 nov 2026». */
  readonly rango = input('');
  readonly puedeRetroceder = input(false);
  readonly puedeAvanzar = input(true);

  readonly elegir = output<HorarioReserva>();
  readonly elegirDia = output<string>();
  readonly elegirSede = output<string | null>();
  readonly cambiarVentana = output<number>();
  readonly actualizar = output<void>();
  readonly cambiarProfesional = output<void>();

  protected readonly notaAnticipacion = NOTA_ANTICIPACION;

  protected readonly sedes = computed(() => sedesDe(this.horarios()));

  /** El filtro de sede solo aplica si esa sede tiene horarios en estas fechas. */
  protected readonly sedeEfectiva = computed(() => {
    const sede = this.sede();
    return sede && this.sedes().some((s) => s.codigo === sede) ? sede : null;
  });

  protected readonly dias = computed<DiaReserva[]>(() => {
    const sede = this.sedeEfectiva();
    const horarios = sede ? this.horarios().filter((h) => h.sede.codigo === sede) : this.horarios();
    return agruparPorDia(horarios);
  });

  /** El día elegido; si no, el del horario elegido; si no, el primero con horarios. */
  protected readonly diaActivo = computed<DiaReserva | null>(() => {
    const dias = this.dias();
    const elegido = this.seleccionado();
    return (
      dias.find((d) => d.clave === this.diaElegido()) ??
      dias.find((d) => d.horarios.some((h) => h.horarioId === elegido)) ??
      dias[0] ??
      null
    );
  });

  protected readonly anuncio = computed(() => {
    if (this.estado() !== 'listo') return '';
    const dias = this.dias();
    if (!dias.length) return `No hay horarios libres ${this.rango()}.`;
    const total = dias.reduce((n, d) => n + d.horarios.length, 0);
    const horarios = total === 1 ? '1 horario libre' : `${total} horarios libres`;
    const enDias = dias.length === 1 ? 'en 1 día' : `en ${dias.length} días`;
    return `${horarios} ${enDias}, ${this.rango()}.`;
  });
}
