import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
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
import { ErrorService } from '../../../core/errores/error.service';
import {
  EntradaAuditoria,
  PaginaAuditoria,
  ResultadoAuditoria,
} from '../../../core/modelos/contrato';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { AuditoriaApiService } from '../data/auditoria-api.service';
import { DetalleRegistroComponent, ID_TITULO_DETALLE } from './detalle-registro/detalle-registro';
import {
  ErrorFiltro,
  FILTRO_BITACORA_VACIO,
  FiltroBitacora,
  TAMANOS_PAGINA,
  filtrosActivos,
  leerFiltroBitacora,
  parametrosBitacora,
  validarFiltroBitacora,
} from './filtro-bitacora';
import {
  ORDEN_RESULTADOS,
  RESULTADOS,
  actorSinUsuario,
  etiquetaAccion,
  etiquetaEntidad,
  etiquetaRol,
  fechaHoraLima,
  referenciaCorta,
} from './formato-auditoria';
import { copiarAlPortapapeles } from './portapapeles';
import { ResultadoAuditoriaComponent } from './resultado-auditoria/resultado-auditoria';

/** Fila de la tabla ya formateada. */
interface FilaBitacora {
  entrada: EntradaAuditoria;
  fecha: string;
  hora: string;
  actor: string;
  rol: string;
  /** Icono del actor cuando no es un usuario (visitante o sistema). */
  iconoActor: NombreIcono | null;
  accion: string;
  entidad: string;
  entidadCorta: string;
}

const mismoFiltro = (a: FiltroBitacora, b: FiltroBitacora) =>
  JSON.stringify(a) === JSON.stringify(b);

/** Cuánto dura la confirmación visual «copiado» (ms). */
export const DURACION_COPIADO_MS = 2000;

/**
 * PB25 · Bitácora de auditoría (solo ADMINISTRADOR, solo lectura), `GET /admin/auditoria`.
 *
 * - Filtros por fechas, acción (desplegable con `acciones`), resultado y correo. Fechas,
 *   acción, resultado y página van en la URL; el correo no (dato personal).
 * - Tabla densa con fecha y hora de Lima al segundo, actor y rol, acción legible, entidad,
 *   resultado con icono e ID de solicitud copiable; en móvil, tarjetas.
 * - Panel de detalle al elegir una fila (el foco va al panel y vuelve a la fila al cerrar).
 * - Paginación accesible; al cambiar de página se conserva la tabla atenuada (sin saltos).
 */
@Component({
  selector: 'app-bitacora',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DetalleRegistroComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    IconoComponent,
    ResultadoAuditoriaComponent,
  ],
  templateUrl: './bitacora.html',
  styleUrl: './bitacora.css',
})
export class BitacoraComponent {
  private readonly api = inject(AuditoriaApiService);
  private readonly errores = inject(ErrorService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly documento = inject(DOCUMENT);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly tituloRegistros = viewChild<ElementRef<HTMLElement>>('tituloRegistros');

  protected readonly tamanos = TAMANOS_PAGINA;
  protected readonly resultados = ORDEN_RESULTADOS.map((r) => ({
    id: r,
    etiqueta: RESULTADOS[r].etiqueta,
  }));

  private readonly lecturaUrl = toSignal(
    this.route.queryParamMap.pipe(map((p) => leerFiltroBitacora((n) => p.get(n)))),
    { initialValue: leerFiltroBitacora((n) => this.route.snapshot.queryParamMap.get(n)) },
  );
  /** Correo del filtro: solo en memoria, nunca en la URL. */
  private readonly usuario = signal<string | null>(null);

  /** Filtro aplicado: el de la URL (más el correo), o el recién aplicado. */
  protected readonly filtro = linkedSignal<FiltroBitacora, FiltroBitacora>({
    source: () => ({ ...this.lecturaUrl(), usuario: this.usuario() }),
    computation: (f) => f,
    equal: mismoFiltro,
  });
  /** Lo que se está escribiendo en el formulario (se aplica con «Aplicar filtros»). */
  protected readonly borrador = linkedSignal(() => ({ ...this.filtro() }));
  protected readonly erroresFormulario = signal<ErrorFiltro[]>([]);
  protected readonly cantidadFiltros = computed(() => filtrosActivos(this.filtro()));

  // ----- Datos -----
  protected readonly estado = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly pagina = signal<PaginaAuditoria | null>(null);
  protected readonly actualizando = signal(false);
  protected readonly errorCarga = signal('');
  /** Acciones distintas para el desplegable (se conserva la última lista recibida). */
  protected readonly acciones = signal<string[]>([]);
  protected readonly anuncio = signal('');

  protected readonly opcionesAccion = computed(() => {
    const lista = new Set(this.acciones());
    const elegida = this.filtro().accion;
    if (elegida) lista.add(elegida);
    return [...lista]
      .map((codigo) => ({ codigo, etiqueta: etiquetaAccion(codigo) }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));
  });

  protected readonly filas = computed<FilaBitacora[]>(() =>
    (this.pagina()?.elementos ?? []).map((e) => {
      const { fecha, hora } = fechaHoraLima(e.ocurridoEn);
      // Sin actor: un visitante sin sesión (login fallido, recuperación…) o un proceso del sistema.
      const anonimo = e.actor ? null : actorSinUsuario(e.accion);
      return {
        entrada: e,
        fecha,
        hora,
        actor: e.actor?.nombre ?? anonimo!.nombre,
        rol: e.actor ? etiquetaRol(e.actor.rol) : anonimo!.descripcion,
        iconoActor: anonimo?.icono ?? null,
        accion: etiquetaAccion(e.accion),
        entidad: etiquetaEntidad(e.entidad),
        entidadCorta: referenciaCorta(e.entidadId),
      };
    }),
  );

  protected readonly paginacion = computed(() => {
    const p = this.pagina();
    const f = this.filtro();
    const total = p?.total ?? 0;
    const tamano = p?.tamano || f.tamano;
    const actual = p?.pagina ?? f.pagina;
    const totalPaginas = Math.max(1, Math.ceil(total / tamano));
    return {
      total,
      actual,
      totalPaginas,
      desde: total === 0 ? 0 : actual * tamano + 1,
      hasta: Math.min(total, (actual + 1) * tamano),
      hayAnterior: actual > 0,
      haySiguiente: actual + 1 < totalPaginas,
    };
  });

  // ----- Detalle y copiado -----
  protected readonly seleccionId = signal<number | null>(null);
  protected readonly seleccionada = computed(() => {
    const id = this.seleccionId();
    return id === null ? null : (this.pagina()?.elementos.find((e) => e.id === id) ?? null);
  });
  protected readonly copiado = signal<string | null>(null);
  private temporizadorCopiado?: ReturnType<typeof setTimeout>;

  private carga?: Subscription;

  constructor() {
    effect(() => {
      const filtro = this.filtro();
      untracked(() => this.cargar(filtro));
    });
    this.destroyRef.onDestroy(() => clearTimeout(this.temporizadorCopiado));
  }

  // ----- Formulario -----

  protected escribir(campo: 'desde' | 'hasta' | 'usuario', evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value.trim() || null;
    this.borrador.update((b) => ({ ...b, [campo]: valor }));
    if (this.erroresFormulario().some((e) => e.campo === campo)) {
      this.erroresFormulario.update((lista) => lista.filter((e) => e.campo !== campo));
    }
  }

  protected elegirAccion(evento: Event): void {
    const valor = (evento.target as HTMLSelectElement).value || null;
    this.borrador.update((b) => ({ ...b, accion: valor }));
  }

  protected elegirResultado(evento: Event): void {
    const valor = ((evento.target as HTMLSelectElement).value || null) as ResultadoAuditoria | null;
    this.borrador.update((b) => ({ ...b, resultado: valor }));
  }

  protected errorDe(campo: ErrorFiltro['campo']): string | null {
    return this.erroresFormulario().find((e) => e.campo === campo)?.mensaje ?? null;
  }

  protected aplicarFormulario(evento: Event): void {
    evento.preventDefault();
    const borrador = { ...this.borrador(), pagina: 0 };
    const errores = validarFiltroBitacora(borrador);
    this.erroresFormulario.set(errores);
    if (errores.length) {
      const primero = errores[0].campo;
      enfocarTrasRenderizar(this.inyector, () =>
        this.host.nativeElement.querySelector<HTMLElement>(`#bitacora-${primero}`),
      );
      return;
    }
    this.aplicar(borrador);
  }

  protected limpiar(): void {
    this.erroresFormulario.set([]);
    this.aplicar({ ...FILTRO_BITACORA_VACIO, tamano: this.filtro().tamano });
  }

  // ----- Paginación -----

  protected irAPagina(pagina: number): void {
    const { totalPaginas, actual } = this.paginacion();
    if (pagina < 0 || pagina >= totalPaginas || pagina === actual || this.actualizando()) return;
    this.aplicar({ ...this.filtro(), pagina });
  }

  protected cambiarTamano(evento: Event): void {
    const tamano = Number((evento.target as HTMLSelectElement).value);
    if (!TAMANOS_PAGINA.includes(tamano)) return;
    this.aplicar({ ...this.filtro(), tamano, pagina: 0 });
  }

  // ----- Detalle -----

  protected seleccionar(entrada: EntradaAuditoria): void {
    if (this.seleccionId() === entrada.id) {
      this.cerrarDetalle();
      return;
    }
    this.seleccionId.set(entrada.id);
    enfocarTrasRenderizar(this.inyector, () =>
      this.host.nativeElement.querySelector<HTMLElement>(`#${ID_TITULO_DETALLE}`),
    );
  }

  /** Clic en la fila (ratón): abre el detalle salvo que el clic fuera en un control. */
  protected clicFila(entrada: EntradaAuditoria, evento: MouseEvent): void {
    const objetivo = evento.target as HTMLElement | null;
    if (objetivo?.closest('button, a, input, select, textarea')) return;
    if (this.documento.getSelection?.()?.toString()) return; // estaba seleccionando texto
    this.seleccionar(entrada);
  }

  protected cerrarDetalle(): void {
    const id = this.seleccionId();
    this.seleccionId.set(null);
    enfocarTrasRenderizar(
      this.inyector,
      () =>
        (id !== null &&
          this.host.nativeElement.querySelector<HTMLElement>(`#bitacora-ver-${id}`)) ||
        this.tituloRegistros(),
    );
  }

  protected async copiar(valor: string, descripcion: string): Promise<void> {
    const ok = await copiarAlPortapapeles(valor, this.documento);
    clearTimeout(this.temporizadorCopiado);
    if (ok) {
      this.copiado.set(valor);
      this.anuncio.set(`${descripcion} copiado: ${valor}.`);
      this.temporizadorCopiado = setTimeout(() => this.copiado.set(null), DURACION_COPIADO_MS);
    } else {
      this.copiado.set(null);
      this.anuncio.set('No pudimos copiar. Selecciona el texto y cópialo manualmente.');
    }
  }

  protected reintentar(): void {
    this.cargar(this.filtro());
    enfocarTrasRenderizar(this.inyector, () => this.tituloRegistros());
  }

  private aplicar(filtro: FiltroBitacora): void {
    this.usuario.set(filtro.usuario);
    this.filtro.set(filtro);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: parametrosBitacora(filtro),
    });
  }

  private cargar(filtro: FiltroBitacora): void {
    this.carga?.unsubscribe();
    if (!this.pagina()) this.estado.set('cargando');
    this.actualizando.set(true);
    this.carga = this.api
      .pagina(filtro)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (pagina) => {
          this.actualizando.set(false);
          this.pagina.set(pagina);
          if (pagina.acciones?.length) this.acciones.set(pagina.acciones);
          this.estado.set('listo');
          const { totalPaginas, actual, total } = this.paginacion();
          this.anuncio.set(
            total === 0
              ? 'No hay registros con estos filtros.'
              : `${total} ${total === 1 ? 'registro' : 'registros'}. Página ${actual + 1} de ${totalPaginas}.`,
          );
        },
        error: (e: unknown) => {
          this.actualizando.set(false);
          this.pagina.set(null);
          this.seleccionId.set(null);
          this.errorCarga.set(this.errores.traducir(e).mensaje);
          this.estado.set('error');
        },
      });
  }
}
