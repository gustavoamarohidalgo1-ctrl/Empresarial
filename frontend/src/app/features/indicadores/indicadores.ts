import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, map } from 'rxjs';
import { CacheService } from '../../core/cache/cache.service';
import { ErrorService } from '../../core/errores/error.service';
import {
  Especialidad,
  ProfesionalCatalogo,
  ResumenIndicadores,
  SedeCatalogo,
} from '../../core/modelos/contrato';
import { AvisoComponent } from '../../shared/ui/aviso/aviso';
import { EncabezadoPaginaComponent } from '../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../shared/ui/icono/icono';
import { formatearFechaHora, hoyEnLima } from '../../shared/utils/fecha-lima';
import { enfocarTrasRenderizar } from '../../shared/utils/foco';
import { IndicadoresApiService } from './data/indicadores-api.service';
import { FiltrosIndicadoresComponent } from './filtros/filtros-indicadores';
import { GraficoDiasComponent } from './graficos/grafico-dias';
import { GraficoEspecialidadesComponent } from './graficos/grafico-especialidades';
import { GraficoEstadosComponent } from './graficos/grafico-estados';
import { MetodologiaComponent } from './metodologia/metodologia';
import { plural } from './modelo/formato';
import {
  FiltroIndicadores,
  PRESET_POR_DEFECTO,
  claveFiltro,
  etiquetaPreset,
  leerFiltro,
  parametrosDeFiltro,
  resolverPreset,
  textoRango,
} from './modelo/periodo';
import { construirTarjetas, tarjetasCargando } from './modelo/tarjetas';
import { TarjetaIndicadorComponent } from './tarjeta-indicador/tarjeta-indicador';

/** Clave de caché (memoria de la sesión) del resumen de un filtro. */
export const claveResumen = (filtro: FiltroIndicadores) =>
  `indicadores:resumen:${claveFiltro(filtro)}`;

const mismoFiltro = (a: FiltroIndicadores, b: FiltroIndicadores) =>
  a.periodo === b.periodo && claveFiltro(a) === claveFiltro(b);

/**
 * LF08 · Tablero de indicadores (RESPONSABLE y ADMINISTRADOR), `GET /analitica/resumen`.
 *
 * - El filtro vive en la URL (`queryParams`) para poder compartir la vista; al cambiarlo se
 *   aplica al instante y luego se refleja en la URL (atrás/adelante también funcionan).
 * - Primera carga con esqueletos del tamaño final; al cambiar el filtro se conserva lo
 *   anterior atenuado (sin saltos) hasta que llega lo nuevo. Error con reintento.
 * - El resumen se guarda en memoria (`indicadores:resumen:<filtro>`) y se revalida siempre:
 *   el corte es el instante de la consulta.
 */
@Component({
  selector: 'app-indicadores',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    FiltrosIndicadoresComponent,
    GraficoDiasComponent,
    GraficoEspecialidadesComponent,
    GraficoEstadosComponent,
    IconoComponent,
    MetodologiaComponent,
    TarjetaIndicadorComponent,
  ],
  templateUrl: './indicadores.html',
  styleUrl: './indicadores.css',
})
export class IndicadoresComponent {
  private readonly api = inject(IndicadoresApiService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly tituloResultados = viewChild<ElementRef<HTMLElement>>('tituloResultados');

  /** «Hoy» en Lima al abrir la página (base de los atajos de periodo). */
  protected readonly hoy = hoyEnLima();

  private readonly lecturaUrl = toSignal(
    this.route.queryParamMap.pipe(map((p) => leerFiltro((n) => p.get(n), this.hoy))),
    { initialValue: leerFiltro((n) => this.route.snapshot.queryParamMap.get(n), this.hoy) },
  );

  /** Filtro efectivo: el de la URL, o el recién elegido mientras la URL se actualiza. */
  protected readonly filtro = linkedSignal<FiltroIndicadores, FiltroIndicadores>({
    source: () => this.lecturaUrl().filtro,
    computation: (f) => f,
    equal: mismoFiltro,
  });
  protected readonly avisoEnlace = computed(() => this.lecturaUrl().aviso);

  // ----- Catálogos de los filtros -----
  protected readonly sedes = signal<SedeCatalogo[]>([]);
  protected readonly especialidades = signal<Especialidad[]>([]);
  protected readonly profesionales = signal<ProfesionalCatalogo[]>([]);
  protected readonly errorCatalogos = signal(false);

  // ----- Resumen -----
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly resumen = signal<ResumenIndicadores | null>(null);
  /** Hay una consulta en curso con datos (anteriores o guardados) en pantalla. */
  protected readonly actualizando = signal(false);
  /** La última actualización falló: se muestra lo último que se cargó. */
  protected readonly desactualizado = signal(false);
  protected readonly errorCarga = signal('');
  /** Mensaje para lectores de pantalla tras cada carga. */
  protected readonly anuncio = signal('');

  protected readonly tarjetas = computed(() => {
    const r = this.resumen();
    return r ? construirTarjetas(r) : tarjetasCargando();
  });
  protected readonly sinCitas = computed(() => this.resumen()?.totalCitas === 0);
  protected readonly hayFiltrosExtra = computed(() => {
    const f = this.filtro();
    return f.periodo !== PRESET_POR_DEFECTO || !!(f.sede || f.especialidad || f.profesional);
  });

  protected readonly contexto = computed(() => {
    const f = this.filtro();
    const r = this.resumen();
    return {
      rango: textoRango(f.desde, f.hasta),
      preset: f.periodo === 'personalizado' ? 'Periodo personalizado' : etiquetaPreset(f.periodo),
      total: r ? plural(r.totalCitas, 'cita', 'citas') : null,
      corte: r ? { iso: r.corte, texto: formatearFechaHora(r.corte) } : null,
    };
  });

  protected readonly urlCsv = computed(() => this.api.urlCsv(this.filtro()));
  protected readonly nombreCsv = computed(() => {
    const f = this.filtro();
    return `indicadores-${f.desde}_${f.hasta}.csv`;
  });

  private carga?: Subscription;

  constructor() {
    effect(() => {
      const filtro = this.filtro();
      untracked(() => this.cargar(filtro));
    });
    this.cargarCatalogos();
  }

  /** La barra de filtros eligió otro filtro: se aplica ya y se refleja en la URL. */
  protected aplicarFiltro(filtro: FiltroIndicadores): void {
    this.filtro.set(filtro);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: parametrosDeFiltro(filtro),
    });
  }

  /** «Actualizar»: nuevo corte con el mismo filtro. */
  protected actualizar(): void {
    if (this.actualizando()) return;
    this.cargar(this.filtro());
  }

  /** «Reintentar» del estado de error: el botón desaparece, el foco va al título. */
  protected reintentar(): void {
    this.cargar(this.filtro());
    enfocarTrasRenderizar(this.inyector, () => this.tituloResultados());
  }

  /** Estado vacío: quitar los filtros (o mirar el mes anterior si no había ninguno). */
  protected salirDelVacio(): void {
    const base = { sede: null, especialidad: null, profesional: null };
    if (this.hayFiltrosExtra()) {
      this.aplicarFiltro({
        periodo: PRESET_POR_DEFECTO,
        ...resolverPreset(PRESET_POR_DEFECTO, this.hoy),
        ...base,
      });
    } else {
      this.aplicarFiltro({
        periodo: 'mes-anterior',
        ...resolverPreset('mes-anterior', this.hoy),
        ...base,
      });
    }
    enfocarTrasRenderizar(this.inyector, () => this.tituloResultados());
  }

  protected cargarCatalogos(): void {
    this.errorCatalogos.set(false);
    const fallo = () => this.errorCatalogos.set(true);
    this.api
      .sedes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (v) => this.sedes.set(v), error: fallo });
    this.api
      .especialidades()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (v) => this.especialidades.set(v), error: fallo });
    this.api
      .profesionales()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (v) => this.profesionales.set(v), error: fallo });
  }

  private cargar(filtro: FiltroIndicadores): void {
    const clave = claveResumen(filtro);
    this.carga?.unsubscribe();
    const guardado = this.cache.leer<ResumenIndicadores>(clave);
    if (guardado) {
      this.mostrar(guardado);
    } else if (!this.resumen()) {
      this.estado.set('cargando');
    }
    this.actualizando.set(true);
    this.carga = this.cache
      .swr(clave, () => this.api.resumen(filtro))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, revalidando, error }) => {
          if (revalidando) return;
          this.actualizando.set(false);
          if (error) {
            this.desactualizado.set(true);
            this.anuncio.set(
              'No pudimos actualizar los indicadores. Mostramos lo último que cargamos.',
            );
            return;
          }
          this.mostrar(datos);
          this.anuncio.set(
            `Indicadores actualizados: ${plural(datos.totalCitas, 'cita', 'citas')}, ${textoRango(filtro.desde, filtro.hasta)}.`,
          );
        },
        error: (e: unknown) => {
          this.actualizando.set(false);
          this.resumen.set(null);
          this.errorCarga.set(this.errores.traducir(e).mensaje);
          this.estado.set('error');
          this.anuncio.set('No pudimos cargar los indicadores.');
        },
      });
  }

  private mostrar(resumen: ResumenIndicadores): void {
    this.resumen.set(resumen);
    this.desactualizado.set(false);
    this.estado.set('listo');
  }
}
