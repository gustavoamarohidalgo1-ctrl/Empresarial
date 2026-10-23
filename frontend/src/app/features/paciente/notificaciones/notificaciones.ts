import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { TipoAviso } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService } from '../../../core/errores/error.service';
import { NotificacionPaciente, TipoNotificacion } from '../../../core/modelos/contrato';
import { NotificacionesService } from '../../../core/notificaciones/notificaciones.service';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { ETIQUETA_NOTIFICACION, ICONO_NOTIFICACION, agruparPorDia } from './agrupar-notificaciones';

/** Clave de la lista en la caché en memoria (se reutiliza al volver a la pantalla). */
export const CLAVE_NOTIFICACIONES = 'notificaciones:lista';

/** Cuántas notificaciones se piden (la API admite hasta 100). */
export const LIMITE_NOTIFICACIONES = 50;

export type FiltroNotificaciones = 'todas' | 'no-leidas';

interface Resultado {
  tipo: TipoAviso;
  titulo: string;
  texto: string;
}

/**
 * Centro de notificaciones del paciente (`/paciente/notificaciones`): lista agrupada por día
 * («Hoy», «Ayer», fecha) con icono por tipo, título, mensaje, hora, distintivo de no leída y
 * enlace a la cita. Filtro Todas / No leídas y «Marcar todas como leídas»; abrir una
 * notificación la marca como leída. La lista usa *stale-while-revalidate* (`CacheService`).
 */
@Component({
  selector: 'app-notificaciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    IconoComponent,
    FechaLimaPipe,
  ],
  templateUrl: './notificaciones.html',
  styleUrl: './notificaciones.css',
})
export class NotificacionesComponent implements OnInit {
  private readonly servicio = inject(NotificacionesService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');

  protected readonly carga = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly errorCarga = signal('');
  protected readonly lista = signal<NotificacionPaciente[]>([]);
  /** Hay datos en pantalla y se está pidiendo la versión fresca (SWR). */
  protected readonly actualizando = signal(false);
  /** Falló la revalidación: se muestran los últimos datos guardados. */
  protected readonly desactualizado = signal(false);
  protected readonly filtro = signal<FiltroNotificaciones>('todas');
  protected readonly marcandoTodas = signal(false);
  protected readonly resultado = signal<Resultado | null>(null);
  /** Texto de la región viva: solo cambia al mostrar la lista, no al revalidar. */
  protected readonly resumen = signal('');
  protected readonly ahora = signal(new Date());

  protected readonly noLeidas = computed(() => this.lista().filter((n) => !n.leida).length);
  protected readonly visibles = computed(() =>
    this.filtro() === 'no-leidas' ? this.lista().filter((n) => !n.leida) : this.lista(),
  );
  protected readonly grupos = computed(() => agruparPorDia(this.visibles(), this.ahora()));

  protected readonly subtitulo = computed(() => {
    if (this.carga() !== 'listo') return 'Recordatorios y cambios de tus citas.';
    const n = this.noLeidas();
    if (n === 0) return 'Recordatorios y cambios de tus citas. Estás al día.';
    return n === 1
      ? 'Recordatorios y cambios de tus citas. Tienes 1 sin leer.'
      : `Recordatorios y cambios de tus citas. Tienes ${n} sin leer.`;
  });

  private sub?: Subscription;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.sub?.unsubscribe();
    if (!this.cache.leer(CLAVE_NOTIFICACIONES)) {
      this.carga.set('cargando');
      this.resumen.set('');
    }
    this.desactualizado.set(false);
    let primera = true;
    this.sub = this.cache
      .swr(CLAVE_NOTIFICACIONES, () => this.servicio.listar(LIMITE_NOTIFICACIONES))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, revalidando, error }) => {
          this.ahora.set(new Date());
          this.lista.set(datos ?? []);
          this.carga.set('listo');
          this.actualizando.set(revalidando);
          this.desactualizado.set(error !== undefined);
          if (primera) this.resumen.set(this.textoResumen());
          primera = false;
        },
        error: (error: unknown) => {
          this.actualizando.set(false);
          this.errorCarga.set(this.errores.traducir(error).mensaje);
          this.carga.set('error');
        },
      });
    // El contador de la cabecera se pone al día con la lista.
    this.servicio.refrescarConteo();
  }

  filtrar(filtro: FiltroNotificaciones): void {
    this.filtro.set(filtro);
    this.resultado.set(null);
  }

  /**
   * Al abrir una notificación (su enlace a la cita), se marca como leída. La navegación sigue
   * su curso; la petición no se cancela al salir de la pantalla. Si falla, se olvida la lista
   * guardada para que la próxima visita muestre el estado real.
   */
  abrir(notificacion: NotificacionPaciente): void {
    if (notificacion.leida) return;
    this.actualizarLista((lista) =>
      lista.map((n) => (n.id === notificacion.id ? { ...n, leida: true } : n)),
    );
    this.servicio.marcarLeida(notificacion.id).subscribe({
      error: () => this.cache.invalidar(CLAVE_NOTIFICACIONES),
    });
  }

  marcarTodas(): void {
    if (this.marcandoTodas() || this.noLeidas() === 0) return;
    this.marcandoTodas.set(true);
    this.resultado.set(null);
    this.servicio
      .marcarTodas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.marcandoTodas.set(false);
          this.actualizarLista((lista) => lista.map((n) => (n.leida ? n : { ...n, leida: true })));
          this.resultado.set({
            tipo: 'exito',
            titulo: 'Todo al día',
            texto: 'Marcamos todas tus notificaciones como leídas.',
          });
          this.enfocarResultado();
        },
        error: (error: unknown) => {
          this.marcandoTodas.set(false);
          this.resultado.set({
            tipo: 'error',
            titulo: 'No pudimos marcarlas como leídas',
            texto: this.errores.traducir(error).mensaje,
          });
          this.enfocarResultado();
        },
      });
  }

  protected icono(tipo: TipoNotificacion) {
    return ICONO_NOTIFICACION[tipo] ?? 'bell';
  }

  protected etiqueta(tipo: TipoNotificacion): string {
    return ETIQUETA_NOTIFICACION[tipo] ?? 'Aviso';
  }

  private actualizarLista(cambio: (lista: NotificacionPaciente[]) => NotificacionPaciente[]): void {
    const nueva = cambio(this.lista());
    this.lista.set(nueva);
    this.cache.guardar(CLAVE_NOTIFICACIONES, nueva);
  }

  private enfocarResultado(): void {
    enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
  }

  private textoResumen(): string {
    const total = this.lista().length;
    if (total === 0) return 'No tienes notificaciones.';
    const n = this.noLeidas();
    const base = total === 1 ? 'Se muestra 1 notificación' : `Se muestran ${total} notificaciones`;
    if (n === 0) return `${base}. Todas están leídas.`;
    return `${base}, ${n === 1 ? '1 sin leer' : `${n} sin leer`}.`;
  }
}
