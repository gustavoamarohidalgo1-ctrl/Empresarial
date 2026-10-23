import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ResumenIndicadores } from '../../../core/modelos/contrato';
import { formatearEntero, plural } from '../modelo/formato';
import {
  anchoObservado,
  escalaLimpia,
  idUnico,
  indiceConTecla,
  rutaColumna,
  rutaTrama,
} from './geometria';
import { MarcoGraficoComponent } from './marco-grafico';
import {
  Granularidad,
  IdSerie,
  PuntoSerie,
  SERIES_DIA,
  TITULO_GRANULARIDAD,
  agruparPorPeriodo,
  granularidadPara,
} from './series';

/** Alto total del SVG (px) y márgenes del área de trazado. */
export const ALTO_GRAFICO_DIAS = 248;
const ARRIBA = 12;
const ABAJO = 28;
const DERECHA = 4;
/** Separación (color de superficie) entre segmentos apilados. */
const HUECO = 2;
/** Grosor máximo de una columna. */
const COLUMNA_MAX = 24;
/** Ancho que ocupa, aproximadamente, una etiqueta del eje X («30 sep»). */
const ETIQUETA_X = 46;
const ANCHO_TOOLTIP = 208;

interface Segmento {
  id: IdSerie;
  d: string;
  trama: string;
}

interface Columna {
  clave: string;
  centro: number;
  zonaX: number;
  zonaAncho: number;
  tope: number;
  etiqueta: string | null;
  descripcion: string;
  segmentos: Segmento[];
}

interface Tooltip {
  x: number;
  y: number;
  derecha: boolean;
  titulo: string;
  total: string;
  filas: { id: IdSerie; etiqueta: string; valor: string }[];
}

/**
 * Barras apiladas por día (o por semana/mes en periodos largos): completadas, sin
 * asistencia (con trama), canceladas y otras. Colores de los tokens de estado (válidos en
 * modo oscuro), 2 px de separación entre segmentos, extremo superior redondeado, leyenda,
 * tooltip al pasar el ratón o enfocar (flechas para recorrer) y tabla equivalente.
 */
@Component({
  selector: 'app-grafico-dias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarcoGraficoComponent],
  templateUrl: './grafico-dias.html',
  styleUrl: './grafico-dias.css',
})
export class GraficoDiasComponent {
  readonly porDia = input.required<ResumenIndicadores['porDia']>();

  protected readonly id = idUnico('grafico-dias');
  protected readonly alto = ALTO_GRAFICO_DIAS;
  protected readonly arriba = ARRIBA;
  protected readonly series = SERIES_DIA;
  protected readonly tramaMuestra = rutaTrama(0, 0, 14, 14, 4);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  /** Ancho real del lienzo (el contenido de la tarjeta), no el del componente. */
  protected readonly ancho = anchoObservado(
    () => this.host.nativeElement.querySelector<HTMLElement>('.gd__lienzo'),
    720,
  );

  protected readonly granularidad = computed<Granularidad>(() =>
    granularidadPara(this.porDia().length),
  );
  protected readonly puntos = computed<PuntoSerie[]>(() =>
    agruparPorPeriodo(this.porDia(), this.granularidad()),
  );
  protected readonly titulo = computed(() => TITULO_GRANULARIDAD[this.granularidad()]);
  protected readonly encabezadoPeriodo = computed(
    () => ({ dia: 'Fecha', semana: 'Semana', mes: 'Mes' })[this.granularidad()],
  );

  protected readonly totales = computed(() => {
    const t: Record<IdSerie | 'total', number> = {
      total: 0,
      completadas: 0,
      noAsistio: 0,
      canceladas: 0,
      resto: 0,
    };
    for (const p of this.puntos()) {
      t.total += p.total;
      for (const s of SERIES_DIA) t[s.id] += p[s.id];
    }
    return t;
  });

  protected readonly descripcion = computed(() => {
    const puntos = this.puntos();
    const total = this.totales().total;
    const unidad = { dia: 'día', semana: 'semana', mes: 'mes' }[this.granularidad()];
    const agrupado =
      this.granularidad() === 'dia' ? '' : ` Agrupadas por ${unidad} porque el periodo es largo.`;
    if (total === 0) return `No hay citas en el periodo.${agrupado}`;
    const pico = puntos.reduce((a, b) => (b.total > a.total ? b : a), puntos[0]);
    const larga = pico.larga;
    const momento =
      this.granularidad() === 'semana'
        ? larga.startsWith('Del ')
          ? `la semana d${larga.slice(1)}`
          : `la semana del ${larga}`
        : `${larga.charAt(0).toLowerCase()}${larga.slice(1)}`;
    return (
      `Citas de cada ${unidad} según su resultado. ${plural(total, 'cita', 'citas')} en total; ` +
      `el máximo fue ${momento}, con ${plural(pico.total, 'cita', 'citas')}.${agrupado}`
    );
  });

  protected readonly geo = computed(() => {
    const puntos = this.puntos();
    const ancho = this.ancho();
    const escala = escalaLimpia(Math.max(0, ...puntos.map((p) => p.total)));
    const izq = 14 + 7.5 * String(escala.max).length;
    const altoPlot = ALTO_GRAFICO_DIAS - ARRIBA - ABAJO;
    const base = ARRIBA + altoPlot;
    const plotAncho = Math.max(1, ancho - izq - DERECHA);
    const ranura = plotAncho / Math.max(1, puntos.length);
    const columna = Math.min(COLUMNA_MAX, Math.max(1, ranura * 0.62));
    const porUnidad = altoPlot / escala.max;
    const saltoEtiquetas = Math.max(1, Math.ceil(ETIQUETA_X / ranura));
    const hueco = columna >= 4 ? HUECO : 0;

    const marcas = escala.marcas.map((valor) => ({
      valor,
      y: base - valor * porUnidad,
      texto: formatearEntero(valor),
    }));

    const columnas: Columna[] = puntos.map((p, i) => {
      const centro = izq + ranura * (i + 0.5);
      const x = centro - columna / 2;
      const visibles = SERIES_DIA.filter((s) => p[s.id] > 0);
      const segmentos: Segmento[] = [];
      let acumulado = 0;
      visibles.forEach((s, k) => {
        const valor = p[s.id];
        const yTope = base - (acumulado + valor) * porUnidad;
        const yBase = base - acumulado * porUnidad - (k > 0 ? hueco : 0);
        const alto = Math.max(1, yBase - yTope);
        const y = yBase - alto;
        const ultimo = k === visibles.length - 1;
        segmentos.push({
          id: s.id,
          d: ultimo ? rutaColumna(x, y, columna, alto, 4) : rutaColumna(x, y, columna, alto, 0),
          trama: s.trama && columna >= 4 ? rutaTrama(x, y, columna, alto, 4) : '',
        });
        acumulado += valor;
      });
      return {
        clave: p.clave,
        centro,
        zonaX: izq + ranura * i,
        zonaAncho: ranura,
        tope: base - p.total * porUnidad,
        etiqueta: i % saltoEtiquetas === 0 ? p.corta : null,
        descripcion: this.describir(p),
        segmentos,
      };
    });

    return { izq, base, altoPlot, ranura, marcas, columnas, derecha: ancho - DERECHA };
  });

  /** Columna con el tooltip visible (ratón o foco). */
  protected readonly activo = signal<number | null>(null);
  /** Columna que recibe el foco con Tab (foco itinerante: una sola parada). */
  protected readonly foco = signal(0);

  protected readonly tooltip = computed<Tooltip | null>(() => {
    const i = this.activo();
    const geo = this.geo();
    const p = i === null ? undefined : this.puntos()[i];
    const c = i === null ? undefined : geo.columnas[i];
    if (!p || !c) return null;
    const ancho = this.ancho();
    // Al costado de la columna, para no taparla; del lado con más espacio.
    const derecha = c.centro + geo.ranura / 2 + 8 + ANCHO_TOOLTIP <= ancho;
    const x = derecha
      ? c.centro + geo.ranura / 2 + 8
      : Math.max(ANCHO_TOOLTIP, c.centro - geo.ranura / 2 - 8);
    return {
      x,
      y: ARRIBA,
      derecha,
      titulo: p.larga,
      total: plural(p.total, 'cita', 'citas'),
      filas: [...SERIES_DIA]
        .reverse()
        .map((s) => ({ id: s.id, etiqueta: s.etiqueta, valor: formatearEntero(p[s.id]) })),
    };
  });

  protected mostrar(i: number): void {
    this.activo.set(i);
  }

  protected alEnfocar(i: number): void {
    this.foco.set(i);
    this.activo.set(i);
  }

  protected ocultar(): void {
    this.activo.set(null);
  }

  /** Flechas, Inicio y Fin recorren las columnas; Escape oculta el tooltip. */
  protected teclado(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.ocultar();
      return;
    }
    const total = this.puntos().length;
    const siguiente = indiceConTecla(evento.key, this.foco(), total);
    if (siguiente === null) return;
    evento.preventDefault();
    this.foco.set(siguiente);
    const columnas = this.host.nativeElement.querySelectorAll<SVGGElement>('.gd__columna');
    columnas[siguiente]?.focus();
  }

  private describir(p: PuntoSerie): string {
    const partes = SERIES_DIA.map((s) => `${s.etiqueta.toLowerCase()} ${formatearEntero(p[s.id])}`);
    return `${p.larga}: ${plural(p.total, 'cita', 'citas')}. ${partes.join(', ')}.`;
  }
}
