import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
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
import { Subscription, map } from 'rxjs';
import { escucharInteraccion, superaInactividad } from '../../../core/auth/inactividad';
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService } from '../../../core/errores/error.service';
import {
  IdempotenciaService,
  IntencionIdempotente,
} from '../../../core/idempotencia/idempotencia.service';
import { AccionOperador, CitaOperador, CuerpoTransicion } from '../../../core/modelos/contrato';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import {
  claveDiaLima,
  esFechaIsoValida,
  formatearDiaLargo,
  formatearFechaSinHora,
  formatearHora,
  hoyEnLima,
  sumarDias,
} from '../../../shared/utils/fecha-lima';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import {
  MensajeAccion,
  mensajeIncierto,
  mensajeRechazo,
} from '../../../shared/utils/mensaje-accion';
import { OperadorApiService } from '../data/operador-api.service';
import { IndicadoresDiaComponent } from './indicadores-dia/indicadores-dia';
import { ETIQUETA_ACCION_OPERADOR, TablaCitasOperadorComponent } from './tabla-citas/tabla-citas';
import {
  FILTROS_PANEL,
  FiltroPanel,
  contarPorFiltro,
  filtrarCitas,
  fusionarCitas,
  ordenarCitas,
  resumirDia,
} from './resumen-dia';

export const MENSAJE_CITA_CAMBIO = 'La cita cambió. Actualiza la vista: no se guardó.';

export { ETIQUETA_ACCION_OPERADOR };

/** Cada cuánto late el reloj del panel: «hoy» en Lima y revisión de la actualización automática. */
export const INTERVALO_RELOJ_MS = 60_000;

/** Antigüedad de la lista a partir de la cual se actualiza sola (si está activada). */
export const INTERVALO_AUTO_MS = 60_000;

/** Lista del día guardada en la caché de la sesión (solo memoria). */
export interface ListaDia {
  citas: CitaOperador[];
  /** Instante (ms) en que se descargó la lista. */
  obtenidoEn: number;
}

/** Clave de caché de la lista de un día de Lima (`YYYY-MM-DD`). */
export const claveListaOperador = (fecha: string) => `operador:citas:${fecha}`;

interface Pendiente {
  cita: CitaOperador;
  accion: AccionOperador;
}

interface OpcionesCarga {
  /** En segundo plano: sin esqueleto, sin anuncios, sin tocar avisos ni foco. */
  silenciosa?: boolean;
  /** Anunciar el resultado a los lectores de pantalla (botón «Actualizar»). */
  anunciar?: boolean;
}

/**
 * LF07 · Panel del operador: citas del día (hora de Lima), indicadores, filtros por estado y
 * transiciones permitidas. La lista usa *stale-while-revalidate* (`operador:citas:<fecha>`) y
 * puede actualizarse sola cada minuto (en pausa si la pestaña está oculta, si hay una acción
 * en curso o si el foco está dentro de la lista).
 */
@Component({
  selector: 'app-panel-operador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    IconoComponent,
    IndicadoresDiaComponent,
    TablaCitasOperadorComponent,
  ],
  templateUrl: './panel-operador.html',
  styleUrl: './panel-operador.css',
})
export class PanelOperadorComponent implements OnInit {
  private readonly api = inject(OperadorApiService);
  private readonly cache = inject(CacheService);
  private readonly errores = inject(ErrorService);
  private readonly idempotencia = inject(IdempotenciaService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly documento = inject(DOCUMENT);
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');
  private readonly regionResultado = viewChild<ElementRef<HTMLElement>>('regionResultado');
  private readonly tituloLista = viewChild<ElementRef<HTMLElement>>('tituloLista');
  private readonly campoFecha = viewChild<ElementRef<HTMLInputElement>>('campoFecha');
  private readonly tabla = viewChild(TablaCitasOperadorComponent, { read: ElementRef });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly filtros = FILTROS_PANEL;

  /** Reloj que se actualiza cada minuto: «hoy» cambia al pasar la medianoche de Lima. */
  private readonly ahora = signal(Date.now());
  protected readonly hoy = computed(() => hoyEnLima(new Date(this.ahora())));

  protected readonly fecha = signal(hoyEnLima());
  protected readonly fechaTexto = computed(() => formatearFechaSinHora(this.fecha()));
  protected readonly diaLargo = computed(() => formatearDiaLargo(`${this.fecha()}T12:00:00Z`));
  protected readonly esHoy = computed(() => this.fecha() === this.hoy());
  protected readonly errorFecha = signal<string | null>(null);
  /** «Hoy» no tiene efecto si ya se ven las citas de hoy (y el campo de fecha es válido). */
  protected readonly hoyBloqueado = computed(() => this.esHoy() && !this.errorFecha());

  protected readonly citas = signal<CitaOperador[]>([]);
  protected readonly estadoCarga = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly errorCarga = signal('');
  private readonly tipoCarga = signal<'ninguna' | 'normal' | 'silenciosa'>('ninguna');
  /** Hay una consulta de la lista en vuelo (normal o en segundo plano). */
  protected readonly actualizando = computed(() => this.tipoCarga() !== 'ninguna');
  /** Hay una consulta pedida por la persona (el botón «Actualizar» queda bloqueado). */
  protected readonly actualizandoNormal = computed(() => this.tipoCarga() === 'normal');
  /** La última actualización falló: se muestra lo guardado. */
  protected readonly desactualizado = signal(false);
  protected readonly obtenidoEn = signal<number | null>(null);
  protected readonly horaObtenido = computed(() => {
    const t = this.obtenidoEn();
    return t === null ? null : { texto: formatearHora(t), iso: new Date(t).toISOString() };
  });
  protected readonly autoActualizar = signal(true);
  /** Texto para lectores de pantalla (filtros y actualización manual). */
  protected readonly anuncio = signal('');

  protected readonly filtro = signal<FiltroPanel>('todas');
  protected readonly conteo = computed(() => contarPorFiltro(this.citas()));
  protected readonly citasVisibles = computed(() => filtrarCitas(this.citas(), this.filtro()));
  protected readonly etiquetaFiltro = computed(
    () => FILTROS_PANEL.find((f) => f.id === this.filtro())?.etiqueta ?? '',
  );
  protected readonly leyendaTabla = computed(
    () =>
      `Citas del ${this.fechaTexto()}${
        this.filtro() === 'todas' ? '' : `, filtro: ${this.etiquetaFiltro()}`
      }, ordenadas por hora`,
  );
  protected readonly resumen = computed(() => resumirDia(this.citas(), this.ahora(), this.esHoy()));

  /** Cita con una acción en curso (se bloquean las demás acciones mientras tanto). */
  protected readonly enCurso = signal<{
    id: string;
    codigo: string;
    accion: AccionOperador;
  } | null>(null);
  protected readonly mensaje = signal<MensajeAccion | null>(null);

  /** Última acción sin resultado definitivo; «Reintentar» la repite con la misma clave. */
  private pendiente: Pendiente | null = null;
  private readonly intenciones = new Map<string, IntencionIdempotente>();
  private carga?: Subscription;
  /** Día al que pertenece `citas()`: solo se fusionan listas del mismo día. */
  private fechaCitas: string | null = null;
  /** Instante (ms) de la última interacción de la persona con la página. */
  private ultimaInteraccion = Date.now();
  /** La actualización automática se detuvo por inactividad y espera la próxima interacción. */
  private enReposo = false;

  constructor() {
    const reloj = setInterval(() => this.alLatirReloj(), INTERVALO_RELOJ_MS);
    const alCambiarVisibilidad = () => this.alCambiarVisibilidad();
    this.documento.addEventListener('visibilitychange', alCambiarVisibilidad);
    const dejarDeEscuchar = escucharInteraccion(this.documento, (e) => this.alInteractuar(e));
    this.destroyRef.onDestroy(() => {
      clearInterval(reloj);
      this.documento.removeEventListener('visibilitychange', alCambiarVisibilidad);
      dejarDeEscuchar();
    });
  }

  ngOnInit(): void {
    this.cargar();
  }

  /**
   * Carga la lista del día seleccionado. Si hay una copia en memoria se pinta al instante (sin
   * esqueleto) y se revalida; si la revalidación falla, se sigue mostrando la copia y se avisa.
   */
  cargar(opciones: OpcionesCarga = {}): void {
    const silenciosa = opciones.silenciosa ?? false;
    const fecha = this.fecha();
    const clave = claveListaOperador(fecha);
    this.carga?.unsubscribe();
    if (!silenciosa) {
      const guardada = this.cache.leer<ListaDia>(clave);
      if (guardada) {
        this.mostrar(fecha, guardada);
      } else {
        this.estadoCarga.set('cargando');
      }
    }
    this.tipoCarga.set(silenciosa ? 'silenciosa' : 'normal');
    this.carga = this.cache
      .swr<ListaDia>(clave, () =>
        this.api
          .citasDelDia(fecha)
          .pipe(map((citas) => ({ citas: ordenarCitas(citas), obtenidoEn: Date.now() }))),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, revalidando, error }) => {
          // La copia guardada ya se pintó arriba (o ya está en pantalla si es silenciosa).
          if (revalidando) return;
          this.tipoCarga.set('ninguna');
          if (error) {
            this.desactualizado.set(true);
            if (opciones.anunciar) {
              this.anuncio.set(
                `No pudimos actualizar la lista. ${this.errores.traducir(error).mensaje} Mostramos lo último que cargamos.`,
              );
            }
            return;
          }
          this.mostrar(fecha, datos);
          if (opciones.anunciar) {
            this.anuncio.set(`Lista actualizada a las ${formatearHora(datos.obtenidoEn)}.`);
          }
        },
        error: (error: unknown) => {
          this.tipoCarga.set('ninguna');
          if (silenciosa && this.estadoCarga() === 'listo') {
            this.desactualizado.set(true);
            return;
          }
          this.errorCarga.set(this.errores.traducir(error).mensaje);
          this.estadoCarga.set('error');
        },
      });
  }

  /**
   * Botón «Actualizar»: recarga la lista sin reintentar ninguna acción. Si hay una acción en
   * curso, se conserva su información para que «Reintentar» siga funcionando si hace falta.
   */
  actualizar(): void {
    // Si el foco estaba en el aviso (que desaparece), pasa al título de la lista.
    const focoEnAviso = this.focoDentro(this.regionResultado());
    this.mensaje.set(null);
    if (!this.enCurso()) {
      this.pendiente = null;
    }
    this.cargar({ anunciar: true });
    if (focoEnAviso) {
      enfocarTrasRenderizar(this.inyector, () => this.tituloLista());
    }
  }

  /** «Actualizar» de la barra: bloqueado mientras corre una actualización pedida por la persona. */
  actualizarDesdeBarra(): void {
    if (this.actualizandoNormal()) return;
    this.actualizar();
  }

  /** «Reintentar» del estado de error: el botón desaparece, el foco va al título de la lista. */
  reintentarCarga(): void {
    this.cargar();
    enfocarTrasRenderizar(this.inyector, () => this.tituloLista());
  }

  cambiarFecha(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    if (!esFechaIsoValida(valor)) {
      this.errorFecha.set('Escribe una fecha válida (día, mes y año).');
      return;
    }
    this.errorFecha.set(null);
    if (valor === this.fecha()) return;
    this.irA(valor);
  }

  /** Día anterior (-1) o siguiente (+1). */
  moverDia(dias: number): void {
    this.errorFecha.set(null);
    this.irA(sumarDias(this.fecha(), dias));
  }

  irAHoy(): void {
    this.ahora.set(Date.now());
    if (this.hoyBloqueado()) return;
    this.errorFecha.set(null);
    this.irA(this.hoy());
  }

  cambiarAuto(evento: Event): void {
    const activa = (evento.target as HTMLInputElement).checked;
    this.autoActualizar.set(activa);
    if (activa) this.autoActualizarSiToca(INTERVALO_AUTO_MS);
  }

  filtrar(filtro: FiltroPanel): void {
    this.filtro.set(filtro);
    const n = this.citasVisibles().length;
    this.anuncio.set(
      filtro === 'todas'
        ? `Mostrando todas las citas: ${n}.`
        : `Mostrando ${n} ${n === 1 ? 'cita' : 'citas'}: ${this.etiquetaFiltro()}.`,
    );
  }

  /** «Ver todas» del estado vacío filtrado: el botón desaparece, el foco va al chip «Todas». */
  verTodas(): void {
    this.filtrar('todas');
    enfocarTrasRenderizar(this.inyector, () =>
      this.host.nativeElement.querySelector<HTMLElement>('#panel-filtro-todas'),
    );
  }

  ejecutar(cita: CitaOperador, accion: AccionOperador): void {
    if (this.enCurso()) return;
    const cuerpo: CuerpoTransicion = { accion, versionCita: cita.versionCita };
    this.enCurso.set({ id: cita.id, codigo: cita.codigo, accion });
    this.mensaje.set(null);
    this.pendiente = { cita, accion };

    this.idempotencia
      .ejecutar(this.intencionPara(cita.id), { cita: cita.id, cuerpo }, (h) =>
        this.api.transicion(cita.id, cuerpo, h),
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        this.enCurso.set(null);
        switch (r.estado) {
          case 'exito':
            this.pendiente = null;
            this.aplicarCita(r.datos);
            this.mensaje.set({
              tipo: 'exito',
              titulo: 'Guardado',
              texto: `${cita.codigo}: ${ETIQUETA_ACCION_OPERADOR[accion]}. Estado actual: ${r.datos.estadoEtiqueta}.`,
            });
            break;
          case 'exito-verificado':
            this.pendiente = null;
            this.invalidarVistasDeCita(cita.id);
            this.mensaje.set({
              tipo: 'exito',
              titulo: 'Guardado',
              texto: `${cita.codigo}: ${ETIQUETA_ACCION_OPERADOR[accion]}. Actualizamos la lista.`,
            });
            this.cargar();
            break;
          case 'rechazada':
            this.pendiente = null;
            if (r.error.status === 409) {
              // No se reintenta automáticamente: el operador decide actualizar la vista.
              this.mensaje.set({
                tipo: 'error',
                titulo: `${cita.codigo}: no se guardó`,
                texto: MENSAJE_CITA_CAMBIO,
                actualizar: true,
              });
            } else {
              this.mensaje.set({
                ...mensajeRechazo(r.error),
                titulo: `${cita.codigo}: no se guardó`,
              });
            }
            break;
          default:
            this.mensaje.set(mensajeIncierto(r.estado));
        }
        // El botón pulsado suele desaparecer (cambian las acciones de la fila): el foco va al
        // aviso de resultado, que es un destino estable.
        enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
      });
  }

  /** Reintenta la misma acción sobre la misma versión de la cita: misma clave de idempotencia. */
  reintentar(): void {
    if (this.pendiente) {
      this.ejecutar(this.pendiente.cita, this.pendiente.accion);
    }
  }

  private irA(fecha: string): void {
    // El campo puede tener un valor inválido aunque la fecha elegida no cambie.
    const campo = this.campoFecha()?.nativeElement;
    if (campo && campo.value !== fecha) campo.value = fecha;
    this.fecha.set(fecha);
    this.mensaje.set(null);
    this.cargar();
  }

  private mostrar(fecha: string, lista: ListaDia): void {
    const actuales = this.fechaCitas === fecha ? this.citas() : [];
    this.citas.set(fusionarCitas(lista.citas, actuales));
    this.fechaCitas = fecha;
    this.obtenidoEn.set(lista.obtenidoEn);
    this.desactualizado.set(false);
    this.estadoCarga.set('listo');
  }

  /** Aplica la cita devuelta por una transición a la vista y a la copia en memoria de su día. */
  private aplicarCita(cita: CitaOperador): void {
    const reemplazar = (lista: CitaOperador[]) => lista.map((c) => (c.id === cita.id ? cita : c));
    this.citas.update(reemplazar);
    const clave = claveListaOperador(claveDiaLima(cita.inicio));
    const guardada = this.cache.leer<ListaDia>(clave);
    if (guardada) {
      this.cache.guardar<ListaDia>(clave, { ...guardada, citas: reemplazar(guardada.citas) });
    }
    this.invalidarVistasDeCita(cita.id);
  }

  /** Las vistas del paciente de esa cita quedan desactualizadas (docs/diseno.md § 7.6). */
  private invalidarVistasDeCita(id: string): void {
    this.cache.invalidar(`cita:${id}`);
    this.cache.invalidar(`cita:${id}:linea-tiempo`);
    this.cache.invalidarPrefijo('citas:');
  }

  private alLatirReloj(): void {
    this.ahora.set(Date.now());
    // Con pulsos de 60 s y umbral de 30 s, la lista se renueva cada minuto en régimen normal.
    this.autoActualizarSiToca(INTERVALO_AUTO_MS / 2);
  }

  private alCambiarVisibilidad(): void {
    if (this.documento.hidden) return;
    this.ahora.set(Date.now());
    // Volver a la pestaña no es interacción: tras 15 min sin actividad sigue en reposo.
    this.autoActualizarSiToca(INTERVALO_AUTO_MS);
  }

  /**
   * Cada interacción anota la hora. La primera tras el reposo por inactividad actualiza en el
   * acto, salvo que sea dentro de la lista (una fila podría cambiar bajo el puntero): entonces lo
   * hace el siguiente pulso del reloj.
   */
  private alInteractuar(evento: Event): void {
    this.ultimaInteraccion = Date.now();
    if (!this.enReposo) return;
    this.enReposo = false;
    const tabla = this.tabla()?.nativeElement;
    if (tabla && evento.target instanceof Node && tabla.contains(evento.target)) return;
    this.autoActualizarSiToca(INTERVALO_AUTO_MS);
  }

  /**
   * Actualización automática en segundo plano. Nunca interrumpe: no corre con la pestaña
   * oculta, con una acción o una consulta en curso, ni mientras el foco está dentro de la lista
   * (una fila podría desaparecer bajo el foco). No mueve el foco ni anuncia nada.
   * Tras 15 min sin interacción reposa (`core/auth/inactividad`): así una pestaña olvidada en el
   * mostrador deja de renovar la sesión y esta caduca.
   */
  private autoActualizarSiToca(antiguedadMinimaMs: number): void {
    if (!this.autoActualizar() || this.documento.hidden) return;
    if (superaInactividad(this.ultimaInteraccion)) {
      this.enReposo = true;
      return;
    }
    if (this.estadoCarga() !== 'listo' || this.actualizando() || this.enCurso()) return;
    if (this.focoDentro(this.tabla())) return;
    const antiguedad = Date.now() - (this.obtenidoEn() ?? 0);
    if (antiguedad >= antiguedadMinimaMs) {
      this.cargar({ silenciosa: true });
    }
  }

  private focoDentro(ref: ElementRef<HTMLElement> | undefined): boolean {
    const activo = this.documento.activeElement;
    return !!ref && !!activo && ref.nativeElement.contains(activo);
  }

  private intencionPara(id: string): IntencionIdempotente {
    let intencion = this.intenciones.get(id);
    if (!intencion) {
      intencion = this.idempotencia.nuevaIntencion();
      this.intenciones.set(id, intencion);
    }
    return intencion;
  }
}
