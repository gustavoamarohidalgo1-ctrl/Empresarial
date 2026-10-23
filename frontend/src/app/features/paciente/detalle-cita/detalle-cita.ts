import { HttpHeaders } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, Subscription } from 'rxjs';
import { AvisoFlash, AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService } from '../../../core/errores/error.service';
import {
  IdempotenciaService,
  IntencionIdempotente,
} from '../../../core/idempotencia/idempotencia.service';
import {
  AccionPaciente,
  CitaDetalle,
  CuerpoConfirmacion,
  CuerpoLlegada,
  EventoLineaTiempo,
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
import { FichaFechaComponent } from '../../../shared/ui/ficha-fecha/ficha-fecha';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { LineaTiempoComponent } from '../../../shared/ui/linea-tiempo/linea-tiempo';
import { diasHastaLima } from '../../../shared/utils/fecha-lima';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  MensajeAccion,
  esCitaNoEncontrada,
  mensajeIncierto,
  mensajeRechazo,
} from '../../../shared/utils/mensaje-accion';
import { PacienteApiService } from '../data/paciente-api.service';
import { capitalizar, cuentaRegresiva } from '../mis-citas/cuenta-regresiva';
import { PreparacionCitaComponent } from './preparacion-cita';
import { VentanaLlegadaComponent } from './ventana-llegada';

type AccionDirecta = Extract<AccionPaciente, 'CONFIRMAR' | 'REGISTRAR_LLEGADA'>;

const EXITO: Readonly<Record<AccionDirecta, string>> = {
  CONFIRMAR: 'Tu cita quedó confirmada. Recuerda: confirmar no registra tu llegada.',
  REGISTRAR_LLEGADA: 'Registramos tu llegada. Espera a que te llamen en la sede.',
};

/** Presentación de cada acción: icono, texto, nota (enlazada con `aria-describedby`) y ruta. */
interface PresentacionAccion {
  icono: NombreIcono;
  texto: string;
  nota: string;
  idNota: string;
  /** Segmento de la pantalla de la acción; sin ruta es una acción directa (botón). */
  ruta?: string;
  peligro?: boolean;
}

const PRESENTACION: Readonly<Record<AccionPaciente, PresentacionAccion>> = {
  CONFIRMAR: {
    icono: 'check-circle',
    texto: 'Confirmar',
    nota: 'Confirmar no registra tu llegada.',
    idNota: 'nota-confirmar',
  },
  REGISTRAR_LLEGADA: {
    icono: 'map-pin',
    texto: 'Registrar llegada',
    nota: 'Úsalo cuando ya estés en la sede. Es independiente del pre-check-in.',
    idNota: 'nota-llegada',
  },
  PRE_CHECK_IN: {
    icono: 'clipboard-check',
    texto: 'Completar pre-check-in',
    nota: 'Revisa tus datos antes de la cita. No acredita tu presencia física.',
    idNota: 'nota-precheckin',
    ruta: 'pre-check-in',
  },
  REPROGRAMAR: {
    icono: 'calendar-clock',
    texto: 'Reprogramar',
    nota: 'Elige otro día u horario disponible.',
    idNota: 'nota-reprogramar',
    ruta: 'reprogramar',
  },
  CANCELAR: {
    icono: 'calendar-x',
    texto: 'Cancelar cita',
    nota: 'Libera el horario si no podrás asistir.',
    idNota: 'nota-cancelar',
    ruta: 'cancelar',
    peligro: true,
  },
};

/** Orden de las acciones en la lista. */
const ORDEN: readonly AccionPaciente[] = [
  'CONFIRMAR',
  'REGISTRAR_LLEGADA',
  'PRE_CHECK_IN',
  'REPROGRAMAR',
  'CANCELAR',
];

/** Candidatas a acción principal (destacada), de la más a la menos urgente. */
const PRIORIDAD_PRINCIPAL: readonly AccionPaciente[] = [
  'REGISTRAR_LLEGADA',
  'CONFIRMAR',
  'PRE_CHECK_IN',
];

/**
 * LF03 · Detalle de cita, línea de tiempo y acciones según `accionesPermitidas`.
 * El detalle y la línea de tiempo usan *stale-while-revalidate* (`CacheService`): al volver se
 * ven al instante y se actualizan en segundo plano, sin mover el foco ni anunciar nada.
 */
@Component({
  selector: 'app-detalle-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoCitaComponent,
    EstadoVacioComponent,
    FichaFechaComponent,
    IconoComponent,
    LineaTiempoComponent,
    PreparacionCitaComponent,
    VentanaLlegadaComponent,
    FechaLimaPipe,
  ],
  templateUrl: './detalle-cita.html',
  styleUrl: './detalle-cita.css',
})
export class DetalleCitaComponent implements OnInit {
  private readonly api = inject(PacienteApiService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly idempotencia = inject(IdempotenciaService);
  private readonly flash = inject(AvisoFlashService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');

  /** Parámetro de ruta `:id`. */
  readonly id = input.required<string>();

  protected readonly cita = signal<CitaDetalle | null>(null);
  protected readonly estadoCarga = signal<'cargando' | 'listo' | 'error' | 'no-encontrada'>(
    'cargando',
  );
  protected readonly errorCarga = signal('');
  /** Recarga pedida (Actualizar vista, éxito verificado): la cita sigue en pantalla. */
  protected readonly refrescando = signal(false);
  /** Revalidación silenciosa de lo guardado en caché (SWR). */
  protected readonly revalidando = signal(false);
  /** Falló la revalidación: se muestra lo último que se cargó. */
  protected readonly desactualizado = signal(false);
  /** Momento de referencia para la cuenta regresiva y la ventana de llegada. */
  protected readonly ahora = signal(new Date());

  protected readonly eventos = signal<EventoLineaTiempo[]>([]);
  protected readonly estadoLinea = signal<'cargando' | 'listo' | 'error'>('cargando');

  protected readonly accionEnCurso = signal<AccionDirecta | null>(null);
  protected readonly ultimaAccion = signal<AccionDirecta | null>(null);
  protected readonly mensaje = signal<MensajeAccion | null>(null);

  protected readonly presentacion = PRESENTACION;
  protected readonly acciones = computed(() => new Set(this.cita()?.accionesPermitidas ?? []));
  protected readonly ocupado = computed(() => this.accionEnCurso() !== null);
  protected readonly citaVisible = computed(() =>
    this.estadoCarga() === 'listo' ? this.cita() : null,
  );
  protected readonly titulo = computed(() => {
    switch (this.estadoCarga()) {
      case 'no-encontrada':
        return 'Cita no encontrada';
      case 'listo':
        return `Cita ${this.cita()?.codigo ?? ''}`.trim();
      default:
        return 'Detalle de cita';
    }
  });
  protected readonly migas = computed<Miga[]>(() => [
    { texto: 'Mis citas', ruta: '/paciente/citas' },
    { texto: this.citaVisible()?.codigo ?? 'Detalle' },
  ]);
  protected readonly sincronizando = computed(() => this.refrescando() || this.revalidando());

  /** La acción más urgente se destaca (botón primario grande). */
  protected readonly accionPrincipal = computed(
    () => PRIORIDAD_PRINCIPAL.find((a) => this.acciones().has(a)) ?? null,
  );
  protected readonly accionesSecundarias = computed(() =>
    ORDEN.filter((a) => this.acciones().has(a) && a !== this.accionPrincipal()),
  );

  protected readonly cuenta = computed(() => {
    const c = this.citaVisible();
    const t = c ? cuentaRegresiva(c.inicio, c.estado, this.ahora()) : null;
    return t ? capitalizar(t) : null;
  });
  protected readonly esHoy = computed(() => {
    const c = this.citaVisible();
    return !!c && diasHastaLima(c.inicio, this.ahora()) === 0;
  });

  private readonly intenciones: Record<AccionDirecta, IntencionIdempotente> = {
    CONFIRMAR: this.idempotencia.nuevaIntencion(),
    REGISTRAR_LLEGADA: this.idempotencia.nuevaIntencion(),
  };
  /** Aviso que llega de otra pantalla; se muestra cuando la región `aria-live` ya existe. */
  private avisoPendiente: AvisoFlash | null = null;
  private cargaDetalle?: Subscription;
  private cargaLinea?: Subscription;

  constructor() {
    // Mantiene al día la cuenta regresiva y el estado de la ventana si la pantalla queda abierta.
    const reloj = setInterval(() => this.ahora.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(reloj));
  }

  ngOnInit(): void {
    this.avisoPendiente = this.flash.consumir();
    this.cargar();
  }

  protected puede(accion: AccionPaciente): boolean {
    return this.acciones().has(accion);
  }

  protected textoAccion(accion: AccionPaciente): string {
    if (accion === 'CONFIRMAR' && this.accionEnCurso() === 'CONFIRMAR') return 'Confirmando…';
    if (accion === 'REGISTRAR_LLEGADA' && this.accionEnCurso() === 'REGISTRAR_LLEGADA') {
      return 'Registrando…';
    }
    return PRESENTACION[accion].texto;
  }

  protected ejecutarDirecta(accion: AccionPaciente): void {
    if (accion === 'CONFIRMAR') this.confirmar();
    else if (accion === 'REGISTRAR_LLEGADA') this.registrarLlegada();
  }

  cargar(): void {
    this.cargarDetalle(false);
    this.cargarLineaTiempo();
  }

  /** Recarga la vista conservando la cita en pantalla mientras llega la nueva. */
  actualizar(): void {
    this.mensaje.set(null);
    this.revalidar();
  }

  /** Pide datos frescos sin tocar el aviso de resultado (p. ej. tras «Mostramos lo último…»). */
  revalidar(): void {
    this.cargarDetalle(true);
    this.cargarLineaTiempo(true);
  }

  private get claveCita(): string {
    return `cita:${this.id()}`;
  }

  private get claveLinea(): string {
    return `cita:${this.id()}:linea-tiempo`;
  }

  /**
   * `silencioso`: la persona pidió datos frescos con la cita ya en pantalla (se descarta lo
   * guardado y se marca `refrescando`). Si no, *stale-while-revalidate*: lo guardado se pinta
   * al instante (sin esqueleto) y se revalida en segundo plano.
   */
  private cargarDetalle(silencioso: boolean): void {
    this.cargaDetalle?.unsubscribe();
    const clave = this.claveCita;
    if (silencioso) this.cache.invalidar(clave);
    if (silencioso && this.cita()) {
      this.refrescando.set(true);
    } else if (!this.cache.leer(clave)) {
      this.estadoCarga.set('cargando');
    }
    this.desactualizado.set(false);
    this.cargaDetalle = this.cache
      .swr(clave, () => this.api.obtenerCita(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, revalidando, error }) => {
          this.ahora.set(new Date());
          this.revalidando.set(revalidando);
          if (error !== undefined) {
            this.revalidacionFallida(error);
            return;
          }
          this.cita.set(datos);
          this.estadoCarga.set('listo');
          this.refrescando.set(false);
          this.mostrarAvisoPendiente();
        },
        error: (error: unknown) => {
          this.refrescando.set(false);
          this.revalidando.set(false);
          const traducido = this.errores.traducir(error);
          if (esCitaNoEncontrada(traducido)) {
            this.cita.set(null);
            this.estadoCarga.set('no-encontrada');
          } else if (this.cita() && silencioso) {
            const actual = this.mensaje();
            if (actual?.tipo === 'exito') {
              // No se sobrescribe un éxito ya confirmado: el fallo de recarga va como texto secundario.
              this.mensaje.set({
                ...actual,
                detalle: `No pudimos actualizar los datos en pantalla. ${traducido.mensaje}`,
                actualizar: true,
              });
            } else {
              this.mensaje.set({
                tipo: 'error',
                titulo: 'No pudimos actualizar la cita',
                texto: traducido.mensaje,
                actualizar: true,
              });
            }
          } else {
            this.errorCarga.set(traducido.mensaje);
            this.estadoCarga.set('error');
          }
          this.mostrarAvisoPendiente();
        },
      });
  }

  /** La revalidación en segundo plano falló: se conserva lo guardado, salvo si ya no existe. */
  private revalidacionFallida(error: unknown): void {
    const traducido = this.errores.traducir(error);
    if (esCitaNoEncontrada(traducido)) {
      this.cache.invalidar(this.claveCita);
      this.cache.invalidar(this.claveLinea);
      this.cita.set(null);
      this.estadoCarga.set('no-encontrada');
    } else {
      this.desactualizado.set(true);
    }
  }

  /** `silencioso`: conserva los eventos en pantalla mientras llegan los nuevos. */
  cargarLineaTiempo(silencioso = false): void {
    this.cargaLinea?.unsubscribe();
    const clave = this.claveLinea;
    const conservar = silencioso && this.estadoLinea() === 'listo';
    if (!conservar && !this.cache.leer(clave)) this.estadoLinea.set('cargando');
    this.cargaLinea = this.cache
      .swr(clave, () => this.api.lineaTiempo(this.id()))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, error }) => {
          if (error !== undefined) {
            // Falló la revalidación: se conservan los eventos guardados, avisando que pueden no estar al día.
            this.desactualizado.set(true);
            return;
          }
          this.eventos.set([...(datos ?? [])].sort((a, b) => a.secuencia - b.secuencia));
          this.estadoLinea.set('listo');
        },
        error: () => this.estadoLinea.set('error'),
      });
  }

  confirmar(): void {
    const cita = this.cita();
    if (!cita) return;
    const cuerpo: CuerpoConfirmacion = { versionAgenda: cita.versionAgenda };
    this.ejecutar('CONFIRMAR', cuerpo, (h) => this.api.confirmar(cita.id, cuerpo, h));
  }

  registrarLlegada(): void {
    const cita = this.cita();
    if (!cita) return;
    const cuerpo: CuerpoLlegada = { versionAgenda: cita.versionAgenda };
    this.ejecutar('REGISTRAR_LLEGADA', cuerpo, (h) =>
      this.api.registrarLlegada(cita.id, cuerpo, h),
    );
  }

  /** Reintenta la última acción con la MISMA clave (el contenido no cambió). */
  reintentar(): void {
    const accion = this.ultimaAccion();
    if (accion === 'CONFIRMAR') this.confirmar();
    else if (accion === 'REGISTRAR_LLEGADA') this.registrarLlegada();
  }

  /** Tras un cambio confirmado: las listas y la línea de tiempo guardadas ya no valen. */
  private invalidarRelacionadas(): void {
    this.cache.invalidarPrefijo('citas:');
    this.cache.invalidar(this.claveLinea);
  }

  private ejecutar(
    accion: AccionDirecta,
    cuerpo: unknown,
    peticion: (h: HttpHeaders) => Observable<CitaDetalle>,
  ): void {
    // Con la cita servida desde la caché, se espera a la versión fresca (accionesPermitidas y
    // versionAgenda pueden haber cambiado): así no se envía una versión obsoleta.
    if (this.ocupado() || this.revalidando()) return;
    this.accionEnCurso.set(accion);
    this.ultimaAccion.set(accion);
    this.mensaje.set(null);
    const contenido = { accion, cita: this.id(), cuerpo };
    this.idempotencia
      .ejecutar(this.intenciones[accion], contenido, peticion)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        this.accionEnCurso.set(null);
        switch (r.estado) {
          case 'exito':
            // La revalidación que siguiera en vuelo traería el estado anterior: se descarta.
            this.cargaDetalle?.unsubscribe();
            this.revalidando.set(false);
            this.refrescando.set(false);
            this.cita.set(r.datos);
            this.cache.guardar(this.claveCita, r.datos);
            this.invalidarRelacionadas();
            this.cargarLineaTiempo(true);
            this.mensaje.set({ tipo: 'exito', titulo: 'Listo', texto: EXITO[accion] });
            break;
          case 'exito-verificado':
            // Se perdió la respuesta, pero el servidor confirma que se completó: recargamos.
            this.mensaje.set({ tipo: 'exito', titulo: 'Listo', texto: EXITO[accion] });
            this.invalidarRelacionadas();
            this.cargarDetalle(true);
            this.cargarLineaTiempo(true);
            break;
          case 'rechazada':
            this.mensaje.set(mensajeRechazo(r.error));
            break;
          default:
            this.mensaje.set(mensajeIncierto(r.estado));
        }
        // El botón pulsado puede desaparecer: el foco va al aviso de resultado.
        enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
      });
  }

  private mostrarAvisoPendiente(): void {
    const aviso = this.avisoPendiente;
    if (!aviso) return;
    this.avisoPendiente = null;
    this.mensaje.set({ tipo: aviso.tipo, titulo: 'Listo', texto: aviso.texto });
  }
}
