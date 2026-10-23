import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  Injector,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subscription, combineLatest } from 'rxjs';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { CatalogoService } from '../../../core/catalogos/catalogo.service';
import { ErrorService } from '../../../core/errores/error.service';
import { IdempotenciaService } from '../../../core/idempotencia/idempotencia.service';
import {
  CitaDetalle,
  CuerpoReprogramacion,
  HorarioDisponible,
  Motivo,
} from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import {
  EncabezadoPaginaComponent,
  Miga,
} from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoCitaComponent } from '../../../shared/ui/estado-cita/estado-cita';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import {
  claveDiaLima,
  formatearDiaLargo,
  formatearFechaHora,
  formatearFechaSinHora,
  formatearHora,
  hoyEnLima,
  partesCalendarioLima,
  sumarDias,
} from '../../../shared/utils/fecha-lima';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  MensajeAccion,
  esCitaNoEncontrada,
  mensajeIncierto,
  mensajeRechazo,
} from '../../../shared/utils/mensaje-accion';
import { claveCita, registrarAccionEnCache } from '../compartido/cita-cache';
import { PacienteApiService } from '../data/paciente-api.service';
import { CambioHorarioComponent } from './cambio-horario';

/**
 * Rango de búsqueda de horarios: de hoy a hoy + 14 días, en fechas de Lima, ambos incluidos
 * (el valor por defecto de la API; el máximo que admite es 31 días).
 */
export const DIAS_BUSQUEDA_HORARIOS = 14;

/** Franja del día (hora de Lima) para ordenar la rejilla de horas. */
export type Franja = 'Mañana' | 'Tarde' | 'Noche';

export function franjaDe(inicio: string): Franja {
  const hora = Number(formatearHora(inicio).slice(0, 2));
  return hora < 12 ? 'Mañana' : hora < 18 ? 'Tarde' : 'Noche';
}

interface GrupoFranja {
  franja: Franja;
  horarios: HorarioDisponible[];
}

/** Un día con horarios libres (día de calendario de Lima). */
export interface DiaHorarios {
  /** `YYYY-MM-DD` en Lima. */
  clave: string;
  /** «Viernes, 6 de noviembre de 2026». */
  titulo: string;
  semana: string;
  dia: string;
  mes: string;
  horarios: HorarioDisponible[];
  franjas: GrupoFranja[];
}

/** LF04 · Reprogramación: días con horarios libres, rejilla de horas, motivo y resumen «de → a». */
@Component({
  selector: 'app-reprogramar-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    CambioHorarioComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoCitaComponent,
    EstadoVacioComponent,
    IconoComponent,
    FechaLimaPipe,
  ],
  templateUrl: './reprogramar-cita.html',
  styleUrl: './reprogramar-cita.css',
})
export class ReprogramarCitaComponent implements OnInit {
  private readonly api = inject(PacienteApiService);
  private readonly catalogo = inject(CatalogoService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly idempotencia = inject(IdempotenciaService);
  private readonly flash = inject(AvisoFlashService);
  private readonly router = inject(Router);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');
  private readonly tituloResumen = viewChild<ElementRef<HTMLElement>>('tituloResumen');
  private readonly tituloElegir = viewChild<ElementRef<HTMLElement>>('tituloElegir');

  readonly id = input.required<string>();

  protected readonly cita = signal<CitaDetalle | null>(null);
  protected readonly motivos = signal<Motivo[]>([]);
  protected readonly estadoCarga = signal<'cargando' | 'listo' | 'error' | 'no-encontrada'>(
    'cargando',
  );
  protected readonly errorCarga = signal('');
  /** Se muestra una cita guardada mientras llega la versión fresca (stale-while-revalidate). */
  protected readonly revalidando = signal(false);
  /** La revalidación falló: se muestra lo último que cargamos. */
  protected readonly desactualizada = signal(false);

  protected readonly horarios = signal<HorarioDisponible[]>([]);
  protected readonly estadoHorarios = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly errorHorarios = signal('');

  protected readonly paso = signal<'elegir' | 'resumen'>('elegir');
  protected readonly diaElegido = signal<string | null>(null);
  protected readonly horarioId = signal<string | null>(null);
  protected readonly motivoCodigo = signal('');
  protected readonly enviando = signal(false);
  protected readonly mensaje = signal<MensajeAccion | null>(null);

  protected readonly permitido = computed(
    () => this.cita()?.accionesPermitidas.includes('REPROGRAMAR') ?? false,
  );

  protected readonly migas = computed<Miga[]>(() => [
    { texto: 'Mis citas', ruta: '/paciente/citas' },
    { texto: this.cita()?.codigo ?? 'Detalle de la cita', ruta: ['/paciente/citas', this.id()] },
    { texto: 'Reprogramar' },
  ]);

  protected readonly subtitulo = computed(() => {
    const c = this.cita();
    return c ? `${c.codigo} · ${c.especialidad.nombre} · ${c.profesional.nombre}` : null;
  });

  /** Días con horarios libres (en Lima), en orden, con sus horas agrupadas por franja. */
  protected readonly dias = computed<DiaHorarios[]>(() => {
    const dias = new Map<string, DiaHorarios>();
    const ordenados = [...this.horarios()].sort((a, b) => a.inicio.localeCompare(b.inicio));
    for (const h of ordenados) {
      const clave = claveDiaLima(h.inicio);
      let dia = dias.get(clave);
      if (!dia) {
        const p = partesCalendarioLima(h.inicio);
        dia = {
          clave,
          titulo: formatearDiaLargo(h.inicio),
          semana: p?.diaSemana ?? '',
          dia: p?.dia ?? '',
          mes: p?.mes ?? '',
          horarios: [],
          franjas: [],
        };
        dias.set(clave, dia);
      }
      dia.horarios.push(h);
      const franja = franjaDe(h.inicio);
      const ultima = dia.franjas.at(-1);
      if (ultima?.franja === franja) ultima.horarios.push(h);
      else dia.franjas.push({ franja, horarios: [h] });
    }
    return [...dias.values()];
  });

  /** Día visible: el elegido si sigue teniendo horarios; si no, el primero disponible. */
  protected readonly diaActivo = computed<DiaHorarios | null>(() => {
    const dias = this.dias();
    return dias.find((d) => d.clave === this.diaElegido()) ?? dias[0] ?? null;
  });

  /** Si hay horarios en más de una sede, cada hora muestra la suya. */
  protected readonly variasSedes = computed(
    () => new Set(this.horarios().map((h) => h.sede.codigo)).size > 1,
  );
  protected readonly sedeUnica = computed(() =>
    this.variasSedes() ? null : (this.horarios()[0]?.sede.nombre ?? null),
  );

  protected readonly horarioElegido = computed(
    () => this.horarios().find((h) => h.id === this.horarioId()) ?? null,
  );
  protected readonly motivoElegido = computed(
    () => this.motivos().find((m) => m.codigo === this.motivoCodigo()) ?? null,
  );
  protected readonly faltante = computed(() => {
    const faltan: string[] = [];
    if (!this.horarioElegido()) faltan.push('un nuevo horario');
    if (!this.motivoElegido()) faltan.push('un motivo');
    return faltan.length ? `Para continuar, elige ${faltan.join(' y ')}.` : '';
  });

  /** Rango consultado; se recalcula en cada carga para no quedarse en el día anterior. */
  protected readonly desde = signal(hoyEnLima());
  protected readonly hasta = computed(() => sumarDias(this.desde(), DIAS_BUSQUEDA_HORARIOS));
  protected readonly rango = computed(
    () => `del ${formatearFechaSinHora(this.desde())} al ${formatearFechaSinHora(this.hasta())}`,
  );
  private readonly intencion = this.idempotencia.nuevaIntencion();
  private cargaCita?: Subscription;
  private cargaHorarios?: Subscription;
  private horariosPedidos = false;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    const clave = claveCita(this.id());
    // Esqueleto solo si no hay nada guardado; si lo hay, se pinta al instante y se revalida.
    if (!this.cache.leer(clave)) this.estadoCarga.set('cargando');
    this.desactualizada.set(false);
    this.horariosPedidos = false;
    this.cargaCita?.unsubscribe();
    this.cargaCita = combineLatest({
      cita: this.cache.swr(clave, () => this.api.obtenerCita(this.id())),
      motivos: this.catalogo.motivos('REPROGRAMACION'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ cita: resultado, motivos }) => {
          if (resultado.error !== undefined) {
            const traducido = this.errores.traducir(resultado.error);
            if (esCitaNoEncontrada(traducido)) {
              this.cache.invalidar(clave);
              this.revalidando.set(false);
              this.estadoCarga.set('no-encontrada');
              return;
            }
            this.desactualizada.set(true);
          }
          const cita = resultado.datos;
          this.cita.set(cita);
          this.revalidando.set(resultado.revalidando);
          this.motivos.set(motivos ?? []);
          this.estadoCarga.set('listo');
          if (!this.horariosPedidos && cita.accionesPermitidas.includes('REPROGRAMAR')) {
            this.cargarHorarios();
          }
        },
        error: (error: unknown) => {
          this.revalidando.set(false);
          const traducido = this.errores.traducir(error);
          if (esCitaNoEncontrada(traducido)) {
            this.estadoCarga.set('no-encontrada');
          } else {
            this.errorCarga.set(traducido.mensaje);
            this.estadoCarga.set('error');
          }
        },
      });
  }

  cargarHorarios(): void {
    this.horariosPedidos = true;
    this.cargaHorarios?.unsubscribe();
    this.estadoHorarios.set('cargando');
    this.desde.set(hoyEnLima());
    this.cargaHorarios = this.api
      .horariosDisponibles(this.id(), this.desde(), this.hasta())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (horarios) => {
          this.horarios.set(horarios ?? []);
          if (!this.horarios().some((h) => h.id === this.horarioId())) {
            this.horarioId.set(null);
          }
          this.estadoHorarios.set('listo');
        },
        error: (error: unknown) => {
          this.errorHorarios.set(this.errores.traducir(error).mensaje);
          this.estadoHorarios.set('error');
        },
      });
  }

  elegirDia(clave: string): void {
    this.diaElegido.set(clave);
  }

  elegirHorario(id: string): void {
    this.horarioId.set(id);
  }

  elegirMotivo(evento: Event): void {
    this.motivoCodigo.set((evento.target as HTMLSelectElement).value);
  }

  continuar(): void {
    if (this.faltante()) return;
    this.mensaje.set(null);
    this.paso.set('resumen');
    this.enfocar(() => this.tituloResumen());
  }

  volverAElegir(): void {
    this.paso.set('elegir');
    this.enfocar(() => this.tituloElegir());
  }

  guardar(): void {
    const cita = this.cita();
    const horario = this.horarioElegido();
    const motivo = this.motivoElegido();
    // Con datos guardados aún sin revalidar, se espera a la versión fresca (versionAgenda).
    if (!cita || !horario || !motivo || this.enviando() || this.revalidando()) return;

    const cuerpo: CuerpoReprogramacion = {
      versionAgenda: cita.versionAgenda,
      horarioId: horario.id,
      motivoCodigo: motivo.codigo,
    };
    this.enviando.set(true);
    this.mensaje.set(null);
    this.idempotencia
      .ejecutar(this.intencion, { cita: cita.id, cuerpo }, (h) =>
        this.api.reprogramar(cita.id, cuerpo, h),
      )
      // Si el usuario sale de la pantalla, no se redirige ni se deja un aviso caducado.
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        this.enviando.set(false);
        switch (r.estado) {
          case 'exito':
          case 'exito-verificado':
            registrarAccionEnCache(this.cache, cita.id, r.estado === 'exito' ? r.datos : null);
            this.flash.publicar({
              tipo: 'exito',
              texto: `Tu cita ${cita.codigo} se reprogramó para el ${formatearFechaHora(horario.inicio)} (hora de Lima). Volvió a estado Pendiente: confírmala cuando puedas.`,
            });
            void this.router.navigate(['/paciente/citas', cita.id]);
            return;
          case 'rechazada':
            if (r.error.codigo === 'HORARIO_NO_DISPONIBLE') {
              this.mensaje.set({
                tipo: 'advertencia',
                titulo: 'Horario no disponible',
                texto: `Ese horario se ocupó antes de guardar. Se conserva tu horario anterior: ${formatearFechaHora(cita.inicio)} (hora de Lima). Actualizamos la lista: elige otro horario.`,
              });
              this.horarioId.set(null);
              this.paso.set('elegir');
              this.cargarHorarios();
            } else {
              this.mensaje.set(mensajeRechazo(r.error));
            }
            break;
          default:
            this.mensaje.set(mensajeIncierto(r.estado));
        }
        // El botón pulsado puede desaparecer (p. ej. vuelve a la elección): foco al aviso.
        enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
      });
  }

  /** Tras un 409/422: recarga la cita (sin usar lo guardado) y los horarios, y vuelve a la elección. */
  actualizar(): void {
    this.mensaje.set(null);
    this.paso.set('elegir');
    this.cache.invalidar(claveCita(this.id()));
    this.cargar();
  }

  private enfocar(objetivo: () => ElementRef<HTMLElement> | undefined): void {
    enfocarTrasRenderizar(this.inyector, objetivo);
  }
}
