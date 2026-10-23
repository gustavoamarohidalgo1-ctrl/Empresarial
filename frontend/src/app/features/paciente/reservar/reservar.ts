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
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService, ErrorUsuario } from '../../../core/errores/error.service';
import { IdempotenciaService } from '../../../core/idempotencia/idempotencia.service';
import {
  CitaDetalle,
  CuerpoReserva,
  Especialidad,
  HorarioReserva,
  ProfesionalCatalogo,
  SedeCatalogo,
} from '../../../core/modelos/contrato';
import { NotificacionesService } from '../../../core/notificaciones/notificaciones.service';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import {
  EncabezadoPaginaComponent,
  Miga,
} from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import {
  claveDiaLima,
  formatearFechaHora,
  formatearFechaSinHora,
  hoyEnLima,
  sumarDias,
} from '../../../shared/utils/fecha-lima';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  MensajeAccion,
  mensajeIncierto,
  mensajeRechazo,
} from '../../../shared/utils/mensaje-accion';
import { claveCita, registrarAccionEnCache } from '../compartido/cita-cache';
import { PacienteApiService } from '../data/paciente-api.service';
import { PasoConfirmarComponent } from './paso-confirmar';
import { EstadoCargaPaso, PasoEspecialidadComponent } from './paso-especialidad';
import { PasoHorarioComponent } from './paso-horario';
import { PasoProfesionalComponent } from './paso-profesional';
import { PasoProgreso, ProgresoReservaComponent } from './progreso-reserva';
import { ReservaApiService } from './reserva-api.service';
import { ReservaExitoComponent } from './reserva-exito';
import {
  CUALQUIER_PROFESIONAL,
  DIAS_VENTANA,
  ResumenProfesional,
  VENTANAS_MAXIMAS,
  nombreSinTratamiento,
  resumirPorProfesional,
} from './reserva-utils';

export type PasoReserva = 1 | 2 | 3 | 4;

type Carga<T> =
  { estado: 'cargando' } | { estado: 'listo'; datos: T } | { estado: 'error'; mensaje: string };

/** Mensaje de resultado del envío, con las acciones propias de la reserva. */
export interface MensajeReserva extends MensajeAccion {
  /** 422 LIMITE_CITAS: enlace a Mis citas y «Elegir otra fecha». */
  limite?: boolean;
  /** Rechazo que se resuelve eligiendo otro horario. */
  otroHorario?: boolean;
}

interface Exito {
  id: string;
  cita: CitaDetalle | null;
  /** Respuesta perdida pero operación completada: se está pidiendo la cita para su código. */
  cargando: boolean;
}

export const PASOS_RESERVA: readonly PasoProgreso[] = [
  { numero: 1, titulo: 'Especialidad' },
  { numero: 2, titulo: 'Profesional' },
  { numero: 3, titulo: 'Fecha y hora' },
  { numero: 4, titulo: 'Confirmar' },
];

const ENCABEZADOS: Readonly<Record<PasoReserva, { titulo: string; ayuda: string }>> = {
  1: {
    titulo: '¿Qué especialidad necesitas?',
    ayuda: 'Elige la especialidad de tu consulta. Puedes buscarla por nombre.',
  },
  2: {
    titulo: 'Elige a tu profesional',
    ayuda: 'Elige a un profesional en particular o mira los horarios de todo el equipo.',
  },
  3: {
    titulo: 'Elige fecha y hora',
    ayuda: 'Solo ves horarios libres. Todas las horas están en hora de Lima.',
  },
  4: {
    titulo: 'Revisa y confirma tu cita',
    ayuda: 'Comprueba los datos. El horario queda reservado cuando confirmas.',
  },
};

/** Respaldo de 409 HORARIO_NO_DISPONIBLE cuando el servidor no explica el motivo. */
export const TEXTO_HORARIO_NO_DISPONIBLE =
  'Puede que otra persona lo haya reservado o que ya no cumpla las 2 horas de anticipación. Actualizamos los horarios: elige otro.';

/** Respaldo de 422 LIMITE_CITAS cuando el servidor no explica cuál de las reglas se aplicó. */
export const TEXTO_LIMITE_CITAS =
  'Puedes tener hasta 5 citas activas, solo una de la misma especialidad por día y ninguna que se cruce con otra cita. Revisa tus citas: puedes cancelar o reprogramar alguna, o elegir otra fecha u hora.';

function estadoDe<T>(carga: Carga<T>): EstadoCargaPaso {
  return carga.estado;
}

/**
 * Reserva de citas (`/paciente/reservar`): asistente de 4 pasos — especialidad, profesional,
 * fecha y hora, y confirmación. Volver atrás conserva lo elegido; `?especialidad=CODE`
 * preselecciona el paso 1. El envío usa `Idempotency-Key` por intención (`IdempotenciaService`):
 * 201 → pantalla de éxito; 409 HORARIO_NO_DISPONIBLE → vuelve al paso 3 con los horarios
 * recargados; 422 LIMITE_CITAS → aviso con enlace a Mis citas; respuesta perdida → verificación.
 */
@Component({
  selector: 'app-reservar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    IconoComponent,
    PasoConfirmarComponent,
    PasoEspecialidadComponent,
    PasoHorarioComponent,
    PasoProfesionalComponent,
    ProgresoReservaComponent,
    ReservaExitoComponent,
  ],
  templateUrl: './reservar.html',
  styleUrl: './reservar.css',
})
export class ReservarCitaComponent implements OnInit {
  private readonly api = inject(ReservaApiService);
  private readonly pacienteApi = inject(PacienteApiService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly idempotencia = inject(IdempotenciaService);
  private readonly notificaciones = inject(NotificacionesService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');

  /** `?especialidad=CODE` (enlace desde otra pantalla): preselecciona el paso 1. */
  readonly especialidad = input<string | null | undefined>(null);

  protected readonly pasos = PASOS_RESERVA;
  protected readonly migas: Miga[] = [
    { texto: 'Mis citas', ruta: '/paciente/citas' },
    { texto: 'Reservar cita' },
  ];

  protected readonly paso = signal<PasoReserva>(1);
  /** Paso más avanzado al que se llegó (para el resumen lateral). */
  protected readonly pasoMaximo = signal<PasoReserva>(1);
  protected readonly ahora = signal(new Date());

  // ----- Datos -----
  protected readonly especialidades = signal<Carga<Especialidad[]>>({ estado: 'cargando' });
  protected readonly profesionales = signal<Carga<ProfesionalCatalogo[]>>({ estado: 'cargando' });
  /** Disponibilidad de toda la especialidad en las próximas dos semanas (paso 2). */
  protected readonly disponibilidadGeneral = signal<Carga<HorarioReserva[]>>({
    estado: 'cargando',
  });
  protected readonly horarios = signal<Carga<HorarioReserva[]>>({ estado: 'cargando' });
  private readonly sedes = signal<SedeCatalogo[]>([]);

  // ----- Selección -----
  protected readonly especialidadCodigo = signal<string | null>(null);
  protected readonly profesionalCodigo = signal<string>(CUALQUIER_PROFESIONAL);
  protected readonly horario = signal<HorarioReserva | null>(null);
  /** Primer día (Lima) de la ventana de horarios consultada. */
  protected readonly desde = signal(hoyEnLima());
  protected readonly diaElegido = signal<string | null>(null);
  protected readonly sedeFiltro = signal<string | null>(null);

  // ----- Envío -----
  protected readonly enviando = signal(false);
  protected readonly mensaje = signal<MensajeReserva | null>(null);
  protected readonly exito = signal<Exito | null>(null);

  private readonly intencion = this.idempotencia.nuevaIntencion();
  private readonly cargas = new Map<string, Subscription>();

  // ----- Derivados -----
  protected readonly encabezado = computed(() => ENCABEZADOS[this.paso()]);
  protected readonly estadoEspecialidades = computed(() => estadoDe(this.especialidades()));
  protected readonly estadoProfesionales = computed(() => estadoDe(this.profesionales()));
  protected readonly estadoHorarios = computed(() => estadoDe(this.horarios()));

  protected readonly listaEspecialidades = computed(
    () => this.datosDe(this.especialidades()) ?? [],
  );
  protected readonly listaProfesionales = computed(() => this.datosDe(this.profesionales()) ?? []);
  protected readonly listaHorarios = computed(() => this.datosDe(this.horarios()) ?? []);
  protected readonly errorEspecialidades = computed(() => this.errorDe(this.especialidades()));
  protected readonly errorProfesionales = computed(() => this.errorDe(this.profesionales()));
  protected readonly errorHorarios = computed(() => this.errorDe(this.horarios()));

  protected readonly especialidadElegida = computed(
    () => this.listaEspecialidades().find((e) => e.codigo === this.especialidadCodigo()) ?? null,
  );
  protected readonly cualquiera = computed(
    () => this.profesionalCodigo() === CUALQUIER_PROFESIONAL,
  );
  protected readonly profesionalElegido = computed(() =>
    this.cualquiera()
      ? null
      : (this.listaProfesionales().find((p) => p.codigo === this.profesionalCodigo()) ?? null),
  );

  /** Resumen por profesional para el paso 2; `null` mientras se consulta. */
  protected readonly resumenProfesionales = computed<ReadonlyMap<
    string,
    ResumenProfesional
  > | null>(() => {
    const carga = this.disponibilidadGeneral();
    if (carga.estado === 'cargando') return null;
    return carga.estado === 'listo' ? resumirPorProfesional(carga.datos) : new Map();
  });
  protected readonly errorResumen = computed(() => this.disponibilidadGeneral().estado === 'error');

  private readonly hoy = computed(() => hoyEnLima(this.ahora()));
  protected readonly hasta = computed(() => sumarDias(this.desde(), DIAS_VENTANA - 1));
  protected readonly puedeRetroceder = computed(() => this.desde() > this.hoy());
  protected readonly puedeAvanzar = computed(
    () => this.desde() < sumarDias(this.hoy(), DIAS_VENTANA * (VENTANAS_MAXIMAS - 1)),
  );
  protected readonly rango = computed(
    () => `del ${formatearFechaSinHora(this.desde())} al ${formatearFechaSinHora(this.hasta())}`,
  );

  /** Sede del horario elegido según el catálogo (con dirección), si se cargó. */
  protected readonly sedeElegida = computed(
    () => this.sedes().find((s) => s.codigo === this.horario()?.sede.codigo) ?? null,
  );

  /** Por qué «Continuar» está deshabilitado ('' si se puede continuar). */
  protected readonly faltante = computed(() => {
    switch (this.paso()) {
      case 1:
        return this.especialidadElegida() ? '' : 'Elige una especialidad para continuar.';
      case 2: {
        const carga = this.profesionales();
        if (carga.estado === 'cargando') return 'Espera a que carguen los profesionales.';
        if (carga.estado === 'error') return 'No pudimos cargar los profesionales. Reintenta.';
        if (!carga.datos.length)
          return 'Esta especialidad no tiene profesionales con reserva en línea.';
        return '';
      }
      case 3:
        return this.horario() ? '' : 'Elige un día y una hora para continuar.';
      default:
        return '';
    }
  });

  // ----- Resumen lateral -----
  protected readonly textoProfesional = computed(() => {
    if (this.pasoMaximo() < 2) return null;
    const p = this.profesionalElegido();
    if (p) return p.nombre;
    return this.horario()?.profesional.nombre ?? 'Cualquier profesional disponible';
  });
  protected readonly textoHorario = computed(() => {
    const h = this.horario();
    return h ? `${formatearFechaHora(h.inicio)}` : null;
  });

  ngOnInit(): void {
    this.cargarEspecialidades();
  }

  // ===================== Navegación =====================

  continuar(): void {
    if (this.faltante() || this.enviando()) return;
    const actual = this.paso();
    if (actual < 4) this.irA((actual + 1) as PasoReserva);
  }

  atras(): void {
    if (this.enviando()) return;
    const actual = this.paso();
    if (actual > 1) this.irA((actual - 1) as PasoReserva);
  }

  /** Cambia de paso (solo hacia atrás o al siguiente), carga sus datos y enfoca su título. */
  irA(destino: number, opciones: { enfocar?: boolean } = {}): void {
    if (this.enviando() || destino < 1 || destino > 4) return;
    const paso = destino as PasoReserva;
    this.mensaje.set(null);
    this.paso.set(paso);
    if (paso > this.pasoMaximo()) this.pasoMaximo.set(paso);
    this.prepararPaso(paso);
    if (opciones.enfocar !== false) this.enfocar('#titulo-paso');
  }

  // ===================== Selección =====================

  elegirEspecialidad(codigo: string): void {
    if (codigo === this.especialidadCodigo()) return;
    this.especialidadCodigo.set(codigo);
    this.profesionalCodigo.set(CUALQUIER_PROFESIONAL);
    this.reiniciarHorario();
    this.pasoMaximo.set(1);
  }

  elegirProfesional(codigo: string): void {
    if (codigo === this.profesionalCodigo()) return;
    this.profesionalCodigo.set(codigo);
    const h = this.horario();
    if (h && codigo !== CUALQUIER_PROFESIONAL && h.profesional.codigo !== codigo) {
      this.horario.set(null);
    }
    this.diaElegido.set(null);
    this.sedeFiltro.set(null);
  }

  elegirHorario(horario: HorarioReserva): void {
    this.horario.set(horario);
    this.diaElegido.set(claveDiaLima(horario.inicio));
  }

  elegirDia(clave: string): void {
    this.diaElegido.set(clave);
  }

  elegirSede(codigo: string | null): void {
    this.sedeFiltro.set(codigo);
    this.diaElegido.set(null);
  }

  /** Mueve la ventana de fechas del paso 3 (dos semanas hacia atrás o hacia adelante). */
  cambiarVentana(delta: number): void {
    if ((delta < 0 && !this.puedeRetroceder()) || (delta > 0 && !this.puedeAvanzar())) return;
    const minimo = this.hoy();
    const destino = sumarDias(this.desde(), delta * DIAS_VENTANA);
    this.desde.set(destino < minimo ? minimo : destino);
    this.diaElegido.set(null);
    this.cargarHorarios();
  }

  /** «Actualizar»: vuelve a pedir los horarios sin usar lo guardado. */
  actualizarHorarios(): void {
    this.api.olvidarDisponibilidad();
    this.cargarHorarios();
  }

  /** Tras un rechazo que se resuelve con otro horario: vuelve al paso 3 con datos frescos. */
  elegirOtroHorario(): void {
    this.api.olvidarDisponibilidad();
    this.irA(3);
  }

  // ===================== Envío =====================

  confirmar(): void {
    const especialidad = this.especialidadElegida();
    const horario = this.horario();
    if (!especialidad || !horario || this.enviando()) return;

    const cuerpo: CuerpoReserva = {
      horarioId: horario.horarioId,
      especialidadCodigo: especialidad.codigo,
    };
    this.enviando.set(true);
    this.mensaje.set(null);
    this.idempotencia
      .ejecutar(this.intencion, { reserva: cuerpo }, (cabeceras) =>
        this.api.reservar(cuerpo, cabeceras),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        this.enviando.set(false);
        switch (r.estado) {
          case 'exito':
            this.registrarExito(r.datos.id, r.datos);
            return;
          case 'exito-verificado':
            this.registrarExito(r.operacion.recursoId, null);
            return;
          case 'rechazada':
            if (r.error.codigo === 'HORARIO_NO_DISPONIBLE') {
              this.horario.set(null);
              this.api.olvidarDisponibilidad();
              this.irA(3, { enfocar: false });
              this.mensaje.set({
                tipo: 'advertencia',
                titulo: 'Ese horario ya no está disponible',
                // El servidor dice el motivo: ya pasó, no cumple la anticipación o alguien lo tomó.
                texto: this.textoDelServidor(r.error) ?? TEXTO_HORARIO_NO_DISPONIBLE,
              });
            } else if (r.error.codigo === 'LIMITE_CITAS') {
              this.mensaje.set({
                tipo: 'advertencia',
                titulo: 'No puedes reservar esta cita',
                texto: this.textoDelServidor(r.error) ?? TEXTO_LIMITE_CITAS,
                limite: true,
              });
            } else {
              const base = mensajeRechazo(r.error);
              this.mensaje.set({
                ...base,
                titulo: 'No pudimos reservar la cita',
                actualizar: false,
                otroHorario: [400, 404, 409, 422].includes(r.error.status),
              });
            }
            break;
          default:
            this.mensaje.set(mensajeIncierto(r.estado));
        }
        // El botón pulsado puede desaparecer (p. ej. al volver al paso 3): foco al aviso.
        enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
      });
  }

  // ===================== Carga de datos =====================

  cargarEspecialidades(): void {
    this.especialidades.set({ estado: 'cargando' });
    this.suscribir('especialidades', this.api.especialidades(), {
      next: (lista) => {
        const datos = [...(lista ?? [])].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
        this.especialidades.set({ estado: 'listo', datos });
        this.aplicarPreseleccion(datos);
      },
      error: (mensaje) => this.especialidades.set({ estado: 'error', mensaje }),
    });
  }

  cargarProfesionales(): void {
    const especialidad = this.especialidadCodigo();
    if (!especialidad) return;
    this.profesionales.set({ estado: 'cargando' });
    this.suscribir('profesionales', this.api.profesionales(especialidad), {
      next: (lista) => {
        const datos = [...(lista ?? [])].sort((a, b) =>
          nombreSinTratamiento(a.nombre).localeCompare(nombreSinTratamiento(b.nombre), 'es'),
        );
        this.profesionales.set({ estado: 'listo', datos });
        // Si el profesional elegido ya no atiende la especialidad, se vuelve a «Cualquiera».
        const codigo = this.profesionalCodigo();
        if (codigo !== CUALQUIER_PROFESIONAL && !datos.some((p) => p.codigo === codigo)) {
          this.elegirProfesional(CUALQUIER_PROFESIONAL);
        }
      },
      error: (mensaje) => this.profesionales.set({ estado: 'error', mensaje }),
    });

    this.disponibilidadGeneral.set({ estado: 'cargando' });
    const desde = this.hoy();
    this.suscribir(
      'general',
      this.api.disponibilidad({ especialidad, desde, hasta: sumarDias(desde, DIAS_VENTANA - 1) }),
      {
        next: (datos) => this.disponibilidadGeneral.set({ estado: 'listo', datos: datos ?? [] }),
        error: (mensaje) => this.disponibilidadGeneral.set({ estado: 'error', mensaje }),
      },
    );
  }

  cargarHorarios(): void {
    const especialidad = this.especialidadCodigo();
    if (!especialidad) return;
    const elegido = this.horario();
    this.horarios.set({ estado: 'cargando' });
    this.suscribir(
      'horarios',
      this.api.disponibilidad({
        especialidad,
        desde: this.desde(),
        hasta: this.hasta(),
        profesional: this.cualquiera() ? null : this.profesionalCodigo(),
      }),
      {
        next: (lista) => {
          const datos = lista ?? [];
          this.horarios.set({ estado: 'listo', datos });
          // Si el horario elegido cae en estas fechas y ya no aparece, alguien lo tomó.
          if (
            elegido &&
            this.horario() === elegido &&
            this.enVentana(elegido) &&
            !datos.some((h) => h.horarioId === elegido.horarioId)
          ) {
            this.horario.set(null);
            if (!this.mensaje()) {
              this.mensaje.set({
                tipo: 'advertencia',
                titulo: 'El horario que elegiste ya no está libre',
                texto: 'Se ocupó mientras revisabas las opciones. Elige otro horario.',
              });
            }
          }
        },
        error: (mensaje) => this.horarios.set({ estado: 'error', mensaje }),
      },
    );
  }

  // ===================== Internos =====================

  private prepararPaso(paso: PasoReserva): void {
    this.ahora.set(new Date());
    if (paso === 1 && this.especialidades().estado === 'error') this.cargarEspecialidades();
    if (paso === 2) this.cargarProfesionales();
    if (paso === 3) {
      if (this.desde() < this.hoy()) this.desde.set(this.hoy());
      this.cargarHorarios();
    }
    if (paso === 4) this.cargarSedes();
  }

  private cargarSedes(): void {
    // Opcional: solo aporta la dirección de la sede. Si falla, se muestra el nombre del horario.
    this.suscribir('sedes', this.api.sedes(), {
      next: (sedes) => this.sedes.set(sedes ?? []),
      error: () => undefined,
    });
  }

  private registrarExito(id: string, cita: CitaDetalle | null): void {
    if (id) registrarAccionEnCache(this.cache, id, cita);
    else this.cache.invalidarPrefijo('citas:');
    this.api.olvidarDisponibilidad();
    // El aviso «Reserva registrada» lo crea un oyente asíncrono del servidor: ahora y a los 2,5 s.
    this.notificaciones.refrescarTrasAccion();
    const pedirCita = !cita && !!id;
    this.exito.set({ id, cita, cargando: pedirCita });
    this.enfocar('#titulo-exito');
    if (!pedirCita) return;
    // Respuesta perdida pero reserva completada: pedimos la cita para mostrar su código.
    this.pacienteApi
      .obtenerCita(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detalle) => {
          this.cache.guardar(claveCita(id), detalle);
          this.exito.set({ id, cita: detalle, cargando: false });
        },
        error: () => this.exito.set({ id, cita: null, cargando: false }),
      });
  }

  /**
   * El `detail` concreto del servidor (p. ej. «Ya tienes una cita de Cardiología el …» o «Las
   * citas se reservan con al menos 2 horas de anticipación…»), o `null` si solo hay el texto
   * general que `ErrorService` pone cuando no llega `detail` (como en una operación rechazada
   * consultada en `/operaciones`).
   */
  private textoDelServidor(error: ErrorUsuario): string | null {
    const texto = error.mensaje.trim();
    if (!texto) return null;
    const general = this.errores.desdeOperacion({
      clave: '',
      tipo: 'CITA_RESERVAR',
      recursoId: '',
      estado: 'RECHAZADA',
      httpStatus: error.status,
      codigoError: error.codigo,
      registradaEn: '',
    }).mensaje;
    return texto === general ? null : texto;
  }

  private aplicarPreseleccion(datos: readonly Especialidad[]): void {
    const pedida = this.especialidad()?.trim().toUpperCase();
    if (!pedida || this.especialidadCodigo()) return;
    const encontrada = datos.find((e) => e.codigo.toUpperCase() === pedida);
    if (encontrada) this.elegirEspecialidad(encontrada.codigo);
  }

  private reiniciarHorario(): void {
    this.horario.set(null);
    this.desde.set(this.hoy());
    this.diaElegido.set(null);
    this.sedeFiltro.set(null);
  }

  private enVentana(horario: HorarioReserva): boolean {
    const dia = claveDiaLima(horario.inicio);
    return dia >= this.desde() && dia <= this.hasta();
  }

  /** Suscribe una carga con nombre; cancela la anterior del mismo nombre. */
  private suscribir<T>(
    nombre: string,
    fuente: Observable<T>,
    manejo: { next: (valor: T) => void; error: (mensaje: string) => void },
  ): void {
    this.cargas.get(nombre)?.unsubscribe();
    const sub = fuente.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: manejo.next,
      error: (e: unknown) => manejo.error(this.errores.traducir(e).mensaje),
    });
    this.cargas.set(nombre, sub);
  }

  private datosDe<T>(carga: Carga<T>): T | null {
    return carga.estado === 'listo' ? carga.datos : null;
  }

  private errorDe<T>(carga: Carga<T>): string {
    return carga.estado === 'error' ? carga.mensaje : '';
  }

  private enfocar(selector: string): void {
    enfocarTrasRenderizar(this.inyector, () =>
      this.host.nativeElement.querySelector<HTMLElement>(selector),
    );
  }
}
