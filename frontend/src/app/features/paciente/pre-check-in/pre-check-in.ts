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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription, combineLatest, map, startWith } from 'rxjs';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService } from '../../../core/errores/error.service';
import { IdempotenciaService } from '../../../core/idempotencia/idempotencia.service';
import { CitaDetalle, CuerpoPreCheckIn, PerfilPaciente } from '../../../core/modelos/contrato';
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
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  MensajeAccion,
  esCitaNoEncontrada,
  mensajeIncierto,
  mensajeRechazo,
} from '../../../shared/utils/mensaje-accion';
import {
  MENSAJES_CONTACTO,
  validadoresEmail,
  validadoresTelefono,
} from '../../../shared/validadores/contacto';
import { CLAVE_PERFIL, claveCita, registrarAccionEnCache } from '../compartido/cita-cache';
import { ResumenCitaComponent } from '../compartido/resumen-cita/resumen-cita';
import { PacienteApiService } from '../data/paciente-api.service';

export const AVISO_PRESENCIA =
  'Completar el pre-check-in no acredita tu presencia física. El día de la cita, registra tu llegada por separado al estar en la sede.';

/**
 * LF06 · Pre-check-in: tarjeta centrada con pasos numerados (revisar datos de contacto
 * prellenados desde el perfil, confirmarlos) y la aclaración de que no acredita presencia
 * antes de la acción.
 */
@Component({
  selector: 'app-pre-check-in',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoCitaComponent,
    EstadoVacioComponent,
    IconoComponent,
    ResumenCitaComponent,
    FechaLimaPipe,
  ],
  templateUrl: './pre-check-in.html',
  styleUrl: './pre-check-in.css',
})
export class PreCheckInComponent implements OnInit {
  private readonly api = inject(PacienteApiService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly idempotencia = inject(IdempotenciaService);
  private readonly flash = inject(AvisoFlashService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');
  private readonly campoEmail = viewChild<ElementRef<HTMLInputElement>>('campoEmail');
  private readonly campoTelefono = viewChild<ElementRef<HTMLInputElement>>('campoTelefono');

  readonly id = input.required<string>();

  protected readonly textoPresencia = AVISO_PRESENCIA;
  protected readonly mensajesCampo = MENSAJES_CONTACTO;

  protected readonly cita = signal<CitaDetalle | null>(null);
  protected readonly perfil = signal<PerfilPaciente | null>(null);
  protected readonly estadoCarga = signal<'cargando' | 'listo' | 'error' | 'no-encontrada'>(
    'cargando',
  );
  protected readonly errorCarga = signal('');
  /** Se muestran datos guardados mientras llega la versión fresca (stale-while-revalidate). */
  protected readonly revalidando = signal(false);
  /** La revalidación falló: se muestra lo último que cargamos. */
  protected readonly desactualizada = signal(false);

  readonly formulario = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: validadoresEmail }),
    telefono: new FormControl('', { nonNullable: true, validators: validadoresTelefono }),
    datosCorrectos: new FormControl(false, { nonNullable: true }),
  });

  protected readonly datosCorrectos = toSignal(
    this.formulario.controls.datosCorrectos.valueChanges.pipe(
      startWith(this.formulario.controls.datosCorrectos.value),
      map(Boolean),
    ),
    { initialValue: false },
  );
  protected readonly intentoEnviar = signal(false);
  protected readonly enviando = signal(false);
  protected readonly mensaje = signal<MensajeAccion | null>(null);
  protected readonly erroresServidor = signal<Record<string, string>>({});

  protected readonly permitido = computed(
    () => this.cita()?.accionesPermitidas.includes('PRE_CHECK_IN') ?? false,
  );
  protected readonly migas = computed<Miga[]>(() => [
    { texto: 'Mis citas', ruta: '/paciente/citas' },
    { texto: this.cita()?.codigo ?? 'Detalle de la cita', ruta: ['/paciente/citas', this.id()] },
    { texto: 'Pre-check-in' },
  ]);
  protected readonly subtitulo = computed(() => {
    const c = this.cita();
    return c ? `${c.codigo} · ${c.especialidad.nombre}` : null;
  });

  private readonly intencion = this.idempotencia.nuevaIntencion();
  private carga?: Subscription;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    const clave = claveCita(this.id());
    // Esqueleto solo si no hay nada guardado; si lo hay, se pinta al instante y se revalida.
    if (!this.cache.leer(clave) || !this.cache.leer(CLAVE_PERFIL)) this.estadoCarga.set('cargando');
    this.desactualizada.set(false);
    this.carga?.unsubscribe();
    let formularioListo = false;
    this.carga = combineLatest({
      cita: this.cache.swr(clave, () => this.api.obtenerCita(this.id())),
      perfil: this.cache.swr(CLAVE_PERFIL, () => this.api.obtenerPerfil()),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ cita, perfil }) => {
          this.revalidando.set(cita.revalidando || perfil.revalidando);
          if (cita.error !== undefined && esCitaNoEncontrada(this.errores.traducir(cita.error))) {
            this.cache.invalidar(clave);
            this.estadoCarga.set('no-encontrada');
            return;
          }
          if (cita.error !== undefined || perfil.error !== undefined) this.desactualizada.set(true);
          this.cita.set(cita.datos);
          this.perfil.set(perfil.datos);
          // Prellenado: al cargar y, al revalidar, solo si la persona aún no tocó el formulario.
          if (!formularioListo || this.formulario.pristine) {
            this.formulario.reset({
              email: perfil.datos.email ?? '',
              telefono: perfil.datos.telefono ?? '',
              datosCorrectos: false,
            });
            formularioListo = true;
          }
          this.estadoCarga.set('listo');
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

  /** Error a mostrar junto al campo: primero el del servidor, luego la validación local. */
  protected errorDe(campo: 'email' | 'telefono'): string | null {
    const servidor = this.erroresServidor()[campo];
    if (servidor) return servidor;
    if (!this.intentoEnviar()) return null;
    const control = this.formulario.controls[campo];
    if (control.hasError('required')) {
      return campo === 'email'
        ? MENSAJES_CONTACTO.emailRequerido
        : MENSAJES_CONTACTO.telefonoRequerido;
    }
    if (control.invalid) {
      return campo === 'email'
        ? MENSAJES_CONTACTO.emailInvalido
        : MENSAJES_CONTACTO.telefonoInvalido;
    }
    return null;
  }

  limpiarErrorServidor(campo: 'email' | 'telefono'): void {
    if (this.erroresServidor()[campo]) {
      const { [campo]: _, ...resto } = this.erroresServidor();
      this.erroresServidor.set(resto);
    }
  }

  enviar(): void {
    const cita = this.cita();
    // Con datos guardados aún sin revalidar, se espera a la versión fresca (versionAgenda).
    if (!cita || this.enviando() || this.revalidando() || !this.datosCorrectos()) return;
    this.intentoEnviar.set(true);
    if (this.formulario.controls.email.invalid || this.formulario.controls.telefono.invalid) {
      const primero = this.formulario.controls.email.invalid
        ? this.campoEmail()
        : this.campoTelefono();
      primero?.nativeElement.focus();
      return;
    }

    const { email, telefono } = this.formulario.getRawValue();
    const cuerpo: CuerpoPreCheckIn = {
      versionAgenda: cita.versionAgenda,
      email: email.trim(),
      telefono: telefono.trim(),
      datosCorrectos: true,
    };
    this.enviando.set(true);
    this.mensaje.set(null);
    this.erroresServidor.set({});
    this.idempotencia
      .ejecutar(this.intencion, { cita: cita.id, cuerpo }, (h) =>
        this.api.preCheckIn(cita.id, cuerpo, h),
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
              texto:
                'Pre-check-in completado. Recuerda: no acredita tu presencia física; registra tu llegada al estar en la sede.',
            });
            void this.router.navigate(['/paciente/citas', cita.id]);
            break;
          case 'rechazada': {
            const porCampo = this.errores.erroresPorCampo(r.error);
            this.erroresServidor.set(porCampo);
            this.mensaje.set(mensajeRechazo(r.error));
            // Con errores por campo, el foco va al primer campo con error; si no, al aviso.
            enfocarTrasRenderizar(this.inyector, () =>
              porCampo['email']
                ? this.campoEmail()
                : porCampo['telefono']
                  ? this.campoTelefono()
                  : this.avisoResultado(),
            );
            break;
          }
          default:
            this.mensaje.set(mensajeIncierto(r.estado));
            enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
        }
      });
  }

  /** Tras un 409/422: recarga la cita sin usar lo guardado. */
  actualizar(): void {
    this.mensaje.set(null);
    this.cache.invalidar(claveCita(this.id()));
    this.cargar();
  }
}
