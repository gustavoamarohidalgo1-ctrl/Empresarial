import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  WritableSignal,
  computed,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService } from '../../../core/errores/error.service';
import { AlcanceCitas, CitaResumen } from '../../../core/modelos/contrato';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { PacienteApiService } from '../data/paciente-api.service';
import { ESTADOS_ACTIVOS } from './cuenta-regresiva';
import { ProximaCitaComponent } from './proxima-cita';
import { TarjetaCitaComponent } from './tarjeta-cita';

interface Pestana {
  alcance: AlcanceCitas;
  texto: string;
  icono: NombreIcono;
}

type Carga =
  | { estado: 'cargando' }
  | { estado: 'listo'; citas: CitaResumen[] }
  | { estado: 'error'; mensaje: string };

/** Estado de la lista de un alcance (Próximas o Historial). */
interface EstadoAlcance {
  readonly carga: WritableSignal<Carga>;
  /** Hay datos en pantalla y se está pidiendo la versión fresca (SWR). */
  readonly actualizando: WritableSignal<boolean>;
  /** Falló la revalidación: se muestran los últimos datos guardados. */
  readonly desactualizado: WritableSignal<boolean>;
  sub?: Subscription;
}

function nuevoEstado(): EstadoAlcance {
  return {
    carga: signal<Carga>({ estado: 'cargando' }),
    actualizando: signal(false),
    desactualizado: signal(false),
  };
}

/** Ordena por inicio: 1 = más antigua primero, -1 = más reciente primero. */
function ordenar(citas: readonly CitaResumen[], signo: 1 | -1): CitaResumen[] {
  return [...citas].sort((a, b) => signo * (Date.parse(a.inicio) - Date.parse(b.inicio)));
}

/**
 * LF02 · Mis citas: tarjeta destacada con la próxima cita, pestañas Próximas e Historial
 * (`alcance`) y lista de tarjetas. Los datos usan *stale-while-revalidate* (`CacheService`):
 * al volver se ven al instante y se actualizan en segundo plano, sin mover el foco ni anunciar.
 */
@Component({
  selector: 'app-mis-citas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    IconoComponent,
    ProximaCitaComponent,
    TarjetaCitaComponent,
  ],
  templateUrl: './mis-citas.html',
  styleUrl: './mis-citas.css',
})
export class MisCitasComponent {
  private readonly api = inject(PacienteApiService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly botonesPestana = viewChildren<ElementRef<HTMLButtonElement>>('pestana');

  protected readonly usuario = inject(AuthService).usuario;
  protected readonly pestanas: readonly Pestana[] = [
    { alcance: 'proximas', texto: 'Próximas', icono: 'calendar' },
    { alcance: 'historial', texto: 'Historial', icono: 'clock' },
  ];

  protected readonly alcance = signal<AlcanceCitas>('proximas');
  /** Momento de referencia para las cuentas regresivas («en 3 días»). */
  protected readonly ahora = signal(new Date());
  /** Texto de la región `aria-live`: solo cambia al mostrar una lista, no al revalidar. */
  protected readonly resumen = signal('');

  private readonly estados: Readonly<Record<AlcanceCitas, EstadoAlcance>> = {
    proximas: nuevoEstado(),
    historial: nuevoEstado(),
  };

  protected readonly carga = computed(() => this.estados[this.alcance()].carga());
  protected readonly actualizando = computed(() => this.estados[this.alcance()].actualizando());
  protected readonly desactualizado = computed(() => this.estados[this.alcance()].desactualizado());
  protected readonly mensajeError = computed(() => {
    const c = this.carga();
    return c.estado === 'error' ? c.mensaje : '';
  });

  /** Próximas citas, de la más cercana a la más lejana. */
  private readonly proximas = computed(() => {
    const c = this.estados.proximas.carga();
    return c.estado === 'listo' ? ordenar(c.citas, 1) : [];
  });
  /** La cita activa más cercana (tarjeta destacada), o `null`. */
  protected readonly proxima = computed(
    () => this.proximas().find((c) => ESTADOS_ACTIVOS.has(c.estado)) ?? null,
  );
  protected readonly cargandoProxima = computed(
    () => this.estados.proximas.carga().estado === 'cargando',
  );

  /** Lista del panel: en Próximas, todas menos la destacada; en Historial, la más reciente primero. */
  protected readonly lista = computed(() => {
    if (this.alcance() === 'proximas') {
      const destacada = this.proxima();
      return this.proximas().filter((c) => c !== destacada);
    }
    const c = this.estados.historial.carga();
    return c.estado === 'listo' ? ordenar(c.citas, -1) : [];
  });

  protected readonly tituloLista = computed(() => {
    if (this.alcance() === 'historial') return 'Citas anteriores';
    return this.proxima() ? 'Más adelante' : 'Próximas citas';
  });

  protected readonly subtitulo = computed(() => {
    const nombre = this.usuario()?.nombre?.trim().split(/\s+/)[0];
    const frase =
      this.alcance() === 'proximas'
        ? 'Estas son tus próximas citas.'
        : 'Este es el historial de tus citas.';
    return nombre ? `Hola, ${nombre}. ${frase}` : frase;
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        map((p): AlcanceCitas => (p.get('alcance') === 'historial' ? 'historial' : 'proximas')),
        takeUntilDestroyed(),
      )
      .subscribe((alcance) => {
        this.alcance.set(alcance);
        this.cargarAlcance(alcance);
        // La tarjeta destacada sale de Próximas, también cuando se entra por Historial.
        if (alcance === 'historial' && !this.estados.proximas.sub) this.cargarAlcance('proximas');
      });

    // Mantiene al día «hoy a las…» / «mañana…» si la pantalla queda abierta.
    const reloj = setInterval(() => this.ahora.set(new Date()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(reloj));
  }

  /** Reintenta la lista visible (y la próxima cita si también había fallado). */
  cargar(): void {
    this.cargarAlcance(this.alcance());
    if (this.alcance() === 'historial' && this.estados.proximas.carga().estado === 'error') {
      this.cargarAlcance('proximas');
    }
  }

  seleccionar(alcance: AlcanceCitas): void {
    if (alcance === this.alcance()) return;
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { alcance: alcance === 'historial' ? 'historial' : null },
      replaceUrl: true,
    });
  }

  /** Patrón de pestañas WAI-ARIA: flechas, Inicio y Fin cambian de pestaña. */
  teclaPestana(evento: KeyboardEvent, indice: number): void {
    const total = this.pestanas.length;
    let destino: number | null = null;
    if (evento.key === 'ArrowRight') destino = (indice + 1) % total;
    else if (evento.key === 'ArrowLeft') destino = (indice - 1 + total) % total;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = total - 1;
    if (destino === null) return;
    evento.preventDefault();
    this.seleccionar(this.pestanas[destino].alcance);
    this.botonesPestana()[destino]?.nativeElement.focus();
  }

  /**
   * Carga un alcance con *stale-while-revalidate*: el esqueleto solo aparece si no hay nada
   * guardado; con datos guardados se pintan al instante y se revalidan en segundo plano.
   */
  private cargarAlcance(alcance: AlcanceCitas): void {
    const e = this.estados[alcance];
    e.sub?.unsubscribe();
    const clave = `citas:${alcance}`;
    const visible = () => alcance === this.alcance();
    if (!this.cache.leer(clave)) {
      e.carga.set({ estado: 'cargando' });
      if (visible()) this.resumen.set('');
    }
    e.desactualizado.set(false);
    let primera = true;
    e.sub = this.cache
      .swr(clave, () => this.api.listarCitas(alcance))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, revalidando, error }) => {
          this.ahora.set(new Date());
          e.carga.set({ estado: 'listo', citas: datos ?? [] });
          e.actualizando.set(revalidando);
          e.desactualizado.set(error !== undefined);
          // Una revalidación silenciosa no anuncia nada nuevo.
          if (primera && visible()) this.resumen.set(this.textoResumen(alcance));
          primera = false;
        },
        error: (error: unknown) => {
          e.actualizando.set(false);
          e.carga.set({ estado: 'error', mensaje: this.errores.traducir(error).mensaje });
          if (visible()) this.resumen.set('');
        },
      });
  }

  private textoResumen(alcance: AlcanceCitas): string {
    const c = this.estados[alcance].carga();
    const n = c.estado === 'listo' ? c.citas.length : 0;
    if (alcance === 'historial') {
      return n === 1 ? 'Se muestra 1 cita del historial.' : `Se muestran ${n} citas del historial.`;
    }
    return n === 1 ? 'Se muestra 1 cita próxima.' : `Se muestran ${n} citas próximas.`;
  }
}
