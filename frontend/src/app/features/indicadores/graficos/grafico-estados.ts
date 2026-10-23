import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { EstadoCita, ResumenIndicadores } from '../../../core/modelos/contrato';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { ETIQUETA_ESTADO, ICONO_ESTADO } from '../../../shared/ui/estado-cita/estado-cita';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { formatearEntero, formatearTasa, plural, porcentaje } from '../modelo/formato';
import { idUnico, indiceConTecla, rutaArco } from './geometria';
import { MarcoGraficoComponent } from './marco-grafico';

/** Orden fijo de los estados (el color sigue al estado, nunca a su posición). */
export const ORDEN_ESTADOS: readonly EstadoCita[] = [
  'PENDIENTE',
  'CONFIRMADA',
  'CHECK_IN',
  'EN_ESPERA',
  'EN_ATENCION',
  'COMPLETADA',
  'CANCELADA',
  'NO_ASISTIO',
];

const CENTRO = 100;
const R_EXTERIOR = 96;
const R_INTERIOR = 66;

interface FilaEstado {
  estado: EstadoCita;
  etiqueta: string;
  icono: NombreIcono;
  total: number;
  porcentaje: number;
  textoPorcentaje: string;
  descripcion: string;
  d: string;
}

/**
 * Dona de citas por estado: un sector por estado con citas (color del token del estado,
 * separados por 2 px de superficie), total en el centro y leyenda con icono, cantidad y
 * porcentaje de los 8 estados. Al pasar el ratón o enfocar un sector (flechas para
 * recorrer), el centro muestra su detalle. Incluye la tabla equivalente.
 */
@Component({
  selector: 'app-grafico-estados',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, MarcoGraficoComponent],
  templateUrl: './grafico-estados.html',
  styleUrl: './grafico-estados.css',
})
export class GraficoEstadosComponent {
  readonly porEstado = input.required<ResumenIndicadores['porEstado']>();
  readonly totalCitas = input.required<number>();

  protected readonly id = idUnico('grafico-estados');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Los 8 estados en orden fijo, con su sector (vacío si no hay citas). */
  protected readonly filas = computed<FilaEstado[]>(() => {
    const porEstado = new Map(this.porEstado().map((e) => [e.estado, e]));
    const total = this.totalCitas() || this.porEstado().reduce((a, e) => a + e.total, 0);
    let angulo = 0;
    return ORDEN_ESTADOS.map((estado) => {
      const dato = porEstado.get(estado);
      const cantidad = dato?.total ?? 0;
      const etiqueta = dato?.etiqueta?.trim() || ETIQUETA_ESTADO[estado];
      const pct = porcentaje(cantidad, total);
      const barrido = total > 0 ? (cantidad / total) * Math.PI * 2 : 0;
      const d =
        cantidad > 0
          ? rutaArco(CENTRO, CENTRO, R_EXTERIOR, R_INTERIOR, angulo, angulo + barrido)
          : '';
      angulo += barrido;
      return {
        estado,
        etiqueta,
        icono: ICONO_ESTADO[estado],
        total: cantidad,
        porcentaje: pct,
        textoPorcentaje: formatearTasa(pct),
        descripcion: `${etiqueta}: ${plural(cantidad, 'cita', 'citas')}, ${formatearTasa(pct)} del total.`,
        d,
      };
    });
  });

  /** Solo los estados con citas tienen sector (y parada de foco). */
  protected readonly sectores = computed(() => this.filas().filter((f) => f.total > 0));

  protected readonly descripcion = computed(() => {
    const total = this.totalCitas();
    if (total === 0) return 'No hay citas en el periodo.';
    const mayor = this.sectores().reduce((a, b) => (b.total > a.total ? b : a));
    return (
      `Distribución de las ${formatearEntero(total)} citas del periodo por estado al corte. ` +
      `El estado más frecuente es «${mayor.etiqueta}» (${mayor.textoPorcentaje}).`
    );
  });

  protected readonly activo = signal<EstadoCita | null>(null);
  protected readonly foco = signal(0);

  /** Lo que muestra el centro de la dona: el total o el estado activo. */
  protected readonly centro = computed(() => {
    const estado = this.activo();
    const fila = estado ? this.filas().find((f) => f.estado === estado) : undefined;
    return fila
      ? { valor: formatearEntero(fila.total), texto: fila.etiqueta, detalle: fila.textoPorcentaje }
      : {
          valor: formatearEntero(this.totalCitas()),
          texto: this.totalCitas() === 1 ? 'cita' : 'citas',
          detalle: 'en el periodo',
        };
  });

  protected mostrar(estado: EstadoCita): void {
    this.activo.set(estado);
  }

  protected alEnfocar(i: number, estado: EstadoCita): void {
    this.foco.set(i);
    this.activo.set(estado);
  }

  protected ocultar(): void {
    this.activo.set(null);
  }

  protected teclado(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.ocultar();
      return;
    }
    const siguiente = indiceConTecla(evento.key, this.foco(), this.sectores().length);
    if (siguiente === null) return;
    evento.preventDefault();
    this.foco.set(siguiente);
    this.host.nativeElement.querySelectorAll<SVGPathElement>('.ge__sector')[siguiente]?.focus();
  }
}
