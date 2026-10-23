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
import { Subscription, combineLatest } from 'rxjs';
import { CacheService } from '../../../core/cache/cache.service';
import { CatalogoService } from '../../../core/catalogos/catalogo.service';
import { ErrorService } from '../../../core/errores/error.service';
import { IdempotenciaService } from '../../../core/idempotencia/idempotencia.service';
import {
  CitaDetalle,
  CuerpoCancelacion,
  EventoLineaTiempo,
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
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  MensajeAccion,
  esCitaNoEncontrada,
  mensajeIncierto,
  mensajeRechazo,
} from '../../../shared/utils/mensaje-accion';
import { claveCita, registrarAccionEnCache } from '../compartido/cita-cache';
import { ResumenCitaComponent } from '../compartido/resumen-cita/resumen-cita';
import { PacienteApiService } from '../data/paciente-api.service';

export const ADVERTENCIA_CANCELACION = 'Se cerrará la cita; no admite llegada ni atención.';
export const TEXTO_CASILLA_CANCELACION = 'Comprendo que esta cita se cerrará';

/**
 * LF05 · Cancelación: tarjeta centrada que explica la consecuencia antes de la acción,
 * con motivo obligatorio y casilla de comprensión.
 */
@Component({
  selector: 'app-cancelar-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
  templateUrl: './cancelar-cita.html',
  styleUrl: './cancelar-cita.css',
})
export class CancelarCitaComponent implements OnInit {
  private readonly api = inject(PacienteApiService);
  private readonly catalogo = inject(CatalogoService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly idempotencia = inject(IdempotenciaService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tituloResultado = viewChild<ElementRef<HTMLElement>>('tituloResultado');
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');

  readonly id = input.required<string>();

  protected readonly textoAdvertencia = ADVERTENCIA_CANCELACION;
  protected readonly textoCasilla = TEXTO_CASILLA_CANCELACION;

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

  protected readonly motivoCodigo = signal('');
  protected readonly comprendo = signal(false);
  protected readonly enviando = signal(false);
  protected readonly mensaje = signal<MensajeAccion | null>(null);

  /** Cita ya cancelada (vista de resultado; reemplaza al formulario). */
  protected readonly cancelada = signal<CitaDetalle | null>(null);
  protected readonly canceladaEn = signal<string | null>(null);

  protected readonly permitido = computed(
    () => this.cita()?.accionesPermitidas.includes('CANCELAR') ?? false,
  );
  protected readonly migas = computed<Miga[]>(() => [
    { texto: 'Mis citas', ruta: '/paciente/citas' },
    { texto: this.cita()?.codigo ?? 'Detalle de la cita', ruta: ['/paciente/citas', this.id()] },
    { texto: 'Cancelar' },
  ]);
  protected readonly subtitulo = computed(() => {
    const c = this.cita();
    return c ? `${c.codigo} · ${c.especialidad.nombre}` : null;
  });
  protected readonly motivoElegido = computed(
    () => this.motivos().find((m) => m.codigo === this.motivoCodigo()) ?? null,
  );
  protected readonly faltante = computed(() => {
    const faltan: string[] = [];
    if (!this.motivoElegido()) faltan.push('elige un motivo');
    if (!this.comprendo()) faltan.push(`marca «${TEXTO_CASILLA_CANCELACION}»`);
    return faltan.length ? `Para cancelar, ${faltan.join(' y ')}.` : '';
  });

  private readonly intencion = this.idempotencia.nuevaIntencion();
  private carga?: Subscription;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    const clave = claveCita(this.id());
    // Esqueleto solo si no hay nada guardado; si lo hay, se pinta al instante y se revalida.
    if (!this.cache.leer(clave)) this.estadoCarga.set('cargando');
    this.desactualizada.set(false);
    this.carga?.unsubscribe();
    this.carga = combineLatest({
      cita: this.cache.swr(clave, () => this.api.obtenerCita(this.id())),
      motivos: this.catalogo.motivos('CANCELACION'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ cita: resultado, motivos }) => {
          this.revalidando.set(resultado.revalidando);
          if (resultado.error !== undefined) {
            if (esCitaNoEncontrada(this.errores.traducir(resultado.error))) {
              this.cache.invalidar(clave);
              this.estadoCarga.set('no-encontrada');
              return;
            }
            this.desactualizada.set(true);
          }
          this.cita.set(resultado.datos);
          this.motivos.set(motivos ?? []);
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

  elegirMotivo(evento: Event): void {
    this.motivoCodigo.set((evento.target as HTMLSelectElement).value);
  }

  cambiarComprendo(evento: Event): void {
    this.comprendo.set((evento.target as HTMLInputElement).checked);
  }

  cancelar(): void {
    const cita = this.cita();
    const motivo = this.motivoElegido();
    // Con datos guardados aún sin revalidar, se espera a la versión fresca (versionAgenda).
    if (!cita || !motivo || !this.comprendo() || this.enviando() || this.revalidando()) return;

    const cuerpo: CuerpoCancelacion = {
      versionAgenda: cita.versionAgenda,
      motivoCodigo: motivo.codigo,
    };
    this.enviando.set(true);
    this.mensaje.set(null);
    this.idempotencia
      .ejecutar(this.intencion, { cita: cita.id, cuerpo }, (h) =>
        this.api.cancelar(cita.id, cuerpo, h),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        switch (r.estado) {
          case 'exito':
            this.enviando.set(false);
            registrarAccionEnCache(this.cache, cita.id, r.datos);
            this.mostrarResultado(r.datos);
            break;
          case 'exito-verificado':
            // La respuesta se perdió pero la operación se completó: pedimos la cita actualizada.
            this.api
              .obtenerCita(cita.id)
              .pipe(takeUntilDestroyed(this.destroyRef))
              .subscribe({
                next: (actualizada) => {
                  this.enviando.set(false);
                  registrarAccionEnCache(this.cache, cita.id, actualizada);
                  this.mostrarResultado(actualizada);
                },
                error: () => {
                  this.enviando.set(false);
                  registrarAccionEnCache(this.cache, cita.id, null);
                  this.mostrarResultado({
                    ...cita,
                    estado: 'CANCELADA',
                    estadoEtiqueta: 'Cancelada',
                    accionesPermitidas: [],
                    ventanaLlegada: null,
                    motivoCancelacion: motivo,
                  });
                },
              });
            break;
          case 'rechazada':
            this.enviando.set(false);
            this.mensaje.set(mensajeRechazo(r.error));
            enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
            break;
          default:
            this.enviando.set(false);
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

  private mostrarResultado(cita: CitaDetalle): void {
    this.cancelada.set(cita);
    enfocarTrasRenderizar(this.inyector, () => this.tituloResultado());
    // El instante de la cancelación está en el evento CANCELADA de la línea de tiempo.
    this.api
      .lineaTiempo(cita.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (eventos: EventoLineaTiempo[]) => {
          const evento = [...(eventos ?? [])]
            .sort((a, b) => b.secuencia - a.secuencia)
            .find((e) => e.tipo === 'CANCELADA');
          this.canceladaEn.set(evento?.ocurridoEn ?? null);
        },
        error: () => this.canceladaEn.set(null),
      });
  }
}
