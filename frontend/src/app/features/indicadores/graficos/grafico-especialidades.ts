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
import {
  NO_CALCULABLE,
  formatearEntero,
  formatearTasa,
  plural,
  porcentaje,
} from '../modelo/formato';
import { escalaLimpia, idUnico, indiceConTecla } from './geometria';
import { MarcoGraficoComponent } from './marco-grafico';

/** Fracción del ancho que puede ocupar la barra más larga (deja sitio a la cifra). */
const LARGO_MAXIMO = 0.8;

/** Largo de la barra en % del ancho (dos decimales). */
const proporcion = (valor: number, maximo: number) =>
  Math.round((valor / maximo) * LARGO_MAXIMO * 10_000) / 100;

interface FilaEspecialidad {
  codigo: string;
  nombre: string;
  total: number;
  textoTotal: string;
  pctTotal: string;
  anchoTotal: number;
  tasa: number | null;
  textoTasa: string;
  anchoTasa: number;
  descripcion: string;
}

/**
 * Barras horizontales por especialidad, en dos paneles con su propia escala (nunca un doble
 * eje): total de citas e inasistencia (%). Ordenadas de mayor a menor número de citas.
 * Cifra al final de cada barra, tooltip al pasar el ratón o enfocar (flechas para recorrer)
 * y tabla equivalente.
 */
@Component({
  selector: 'app-grafico-especialidades',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MarcoGraficoComponent],
  templateUrl: './grafico-especialidades.html',
  styleUrl: './grafico-especialidades.css',
})
export class GraficoEspecialidadesComponent {
  readonly porEspecialidad = input.required<ResumenIndicadores['porEspecialidad']>();

  protected readonly id = idUnico('grafico-especialidades');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly filas = computed<FilaEspecialidad[]>(() => {
    const datos = [...this.porEspecialidad()].sort(
      (a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'),
    );
    const sumaTotal = datos.reduce((a, d) => a + d.total, 0);
    const maxTotal = Math.max(0, ...datos.map((d) => d.total));
    const escalaTasa = escalaLimpia(
      Math.max(0, ...datos.map((d) => d.tasaInasistencia ?? 0)),
      4,
      false,
    );
    return datos.map((d) => {
      const tasa = d.tasaInasistencia ?? null;
      const pctTotal = formatearTasa(porcentaje(d.total, sumaTotal));
      const textoTasa = formatearTasa(tasa);
      return {
        codigo: d.codigo,
        nombre: d.nombre,
        total: d.total,
        textoTotal: formatearEntero(d.total),
        pctTotal,
        anchoTotal: maxTotal > 0 ? proporcion(d.total, maxTotal) : 0,
        tasa,
        textoTasa,
        anchoTasa: tasa !== null && escalaTasa.max > 0 ? proporcion(tasa, escalaTasa.max) : 0,
        descripcion:
          `${d.nombre}: ${plural(d.total, 'cita', 'citas')} (${pctTotal} del total); ` +
          `inasistencia ${tasa === null ? NO_CALCULABLE.toLowerCase() : textoTasa}.`,
      };
    });
  });

  protected readonly descripcion = computed(() => {
    const filas = this.filas();
    if (!filas.length) return 'No hay citas por especialidad en el periodo.';
    const conTasa = filas.filter((f) => f.tasa !== null);
    const mayorTasa = conTasa.length
      ? conTasa.reduce((a, b) => ((b.tasa ?? 0) > (a.tasa ?? 0) ? b : a))
      : null;
    return (
      `Total de citas e inasistencia de cada especialidad, de mayor a menor volumen. ` +
      `${filas[0].nombre} concentra más citas (${filas[0].textoTotal})` +
      (mayorTasa
        ? `; la mayor inasistencia es la de ${mayorTasa.nombre} (${mayorTasa.textoTasa}).`
        : '.')
    );
  });

  protected readonly activo = signal<number | null>(null);
  protected readonly foco = signal(0);
  /** Posición vertical del tooltip (debajo de la fila activa). */
  protected readonly tooltipTop = signal(0);

  protected readonly tooltip = computed(() => {
    const i = this.activo();
    return i === null ? null : (this.filas()[i] ?? null);
  });

  protected mostrar(i: number, evento: Event): void {
    const fila = evento.currentTarget as HTMLElement | null;
    this.tooltipTop.set(fila ? fila.offsetTop + fila.offsetHeight + 4 : 0);
    this.activo.set(i);
  }

  protected alEnfocar(i: number, evento: Event): void {
    this.foco.set(i);
    this.mostrar(i, evento);
  }

  protected ocultar(): void {
    this.activo.set(null);
  }

  protected teclado(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.ocultar();
      return;
    }
    const siguiente = indiceConTecla(evento.key, this.foco(), this.filas().length);
    if (siguiente === null) return;
    evento.preventDefault();
    this.foco.set(siguiente);
    this.host.nativeElement.querySelectorAll<HTMLElement>('.gesp__fila')[siguiente]?.focus();
  }
}
