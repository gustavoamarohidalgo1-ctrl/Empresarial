import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { NO_CALCULABLE } from '../modelo/formato';

export type TonoIndicador = 'confirmada' | 'cancelada' | 'reprogramada' | 'no-asistio' | 'espera';

/** Datos de una tarjeta del tablero (ya formateados). */
export interface DatosIndicador {
  id: string;
  titulo: string;
  icono: NombreIcono;
  tono: TonoIndicador;
  /** «50.0 %», «12.4 min» o «No calculable». */
  valor: string;
  /** «60 de 120 citas». */
  detalle: string;
  /** Relleno del medidor (0–100) o `null` si no aplica / no es calculable. */
  medidor: number | null;
  /** Texto adicional bajo el detalle (p. ej. por qué no es calculable). */
  nota: string | null;
  /** Explicación del distintivo «Provisional»; `null` si el valor es definitivo. */
  provisional: string | null;
}

/**
 * Tarjeta de un indicador: icono y nombre, valor grande, numerador/denominador, medidor
 * decorativo y, si corresponde, distintivo «Provisional» con su explicación visible.
 * Con `cargando` conserva el título y reserva la misma caja con esqueletos (CLS ≈ 0).
 */
@Component({
  selector: 'app-tarjeta-indicador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EsqueletoComponent, IconoComponent],
  template: `
    @let d = datos();
    <article class="ti" [attr.data-tono]="d.tono" [attr.aria-labelledby]="idTitulo()">
      <h3 class="ti__titulo" [id]="idTitulo()">
        <span class="ti__icono"><app-icono [nombre]="d.icono" [trazo]="2" /></span>
        {{ d.titulo }}
      </h3>
      @if (cargando()) {
        <p class="ti__valor"><app-esqueleto forma="titulo" ancho="6rem" alto="2.25rem" /></p>
        <span class="ti__medidor" aria-hidden="true"></span>
        <p class="ti__detalle"><app-esqueleto ancho="75%" /></p>
      } @else {
        <p class="ti__valor" [class.ti__valor--nc]="noCalculable()">{{ d.valor }}</p>
        <span class="ti__medidor" aria-hidden="true">
          @if (d.medidor !== null) {
            <span class="ti__relleno" [style.inline-size.%]="d.medidor"></span>
          }
        </span>
        <p class="ti__detalle">{{ d.detalle }}</p>
        @if (d.nota) {
          <p class="ti__nota">{{ d.nota }}</p>
        }
        @if (d.provisional) {
          <p class="ti__provisional">
            <span class="ti__insignia"
              ><app-icono nombre="alert-triangle" [trazo]="2" /> Provisional</span
            >
            <span class="ti__explicacion">{{ d.provisional }}</span>
          </p>
        }
      }
    </article>
  `,
  styleUrl: './tarjeta-indicador.css',
})
export class TarjetaIndicadorComponent {
  readonly datos = input.required<DatosIndicador>();
  readonly cargando = input(false, { transform: booleanAttribute });

  protected readonly idTitulo = computed(() => `indicador-${this.datos().id}-titulo`);
  protected readonly noCalculable = computed(() => this.datos().valor === NO_CALCULABLE);
}
