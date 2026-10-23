import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EsqueletoComponent } from '../../../../shared/ui/esqueleto/esqueleto';
import { IconoComponent } from '../../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../../shared/ui/icono/iconos';
import { formatearHora } from '../../../../shared/utils/fecha-lima';
import { ResumenDia, formatearEspera } from '../resumen-dia';

type Tono = 'marca' | 'llegar' | 'espera' | 'atencion' | 'completada';

interface Indicador {
  id: string;
  etiqueta: string;
  icono: NombreIcono;
  tono: Tono;
  valor: number;
  detalle: string;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Indicadores del día del panel del operador: total (con el avance del día), por llegar,
 * en espera, en atención y completadas. Todo se calcula de la lista (`resumirDia`).
 *
 * Sin `resumen` muestra esqueletos con la misma caja (CLS ≈ 0). No es una región viva:
 * la actualización automática no debe anunciar nada.
 */
@Component({
  selector: 'app-indicadores-dia',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EsqueletoComponent, IconoComponent],
  template: `
    <ul class="kpis">
      @for (k of indicadores(); track k.id; let primero = $first) {
        <li class="kpi" [class.kpi--principal]="primero" [attr.data-tono]="k.tono">
          <p class="kpi__etiqueta">
            <span class="kpi__icono"><app-icono [nombre]="k.icono" [trazo]="2" /></span>
            {{ k.etiqueta }}
          </p>
          @if (resumen(); as r) {
            <p class="kpi__valor">{{ k.valor }}</p>
            @if (primero) {
              <span class="kpi__barra" aria-hidden="true">
                <span class="kpi__relleno" [style.inline-size.%]="r.progreso"></span>
              </span>
            }
            <p class="kpi__detalle">{{ k.detalle }}</p>
          } @else {
            <p class="kpi__valor">
              <app-esqueleto forma="titulo" ancho="2.75rem" alto="1.75rem" />
            </p>
            @if (primero) {
              <span class="kpi__barra" aria-hidden="true"></span>
            }
            <p class="kpi__detalle"><app-esqueleto ancho="70%" /></p>
          }
        </li>
      }
    </ul>
  `,
  styleUrl: './indicadores-dia.css',
})
export class IndicadoresDiaComponent {
  /** Resumen calculado de la lista; `null` mientras carga (esqueletos). */
  readonly resumen = input<ResumenDia | null>(null);

  protected readonly indicadores = computed<Indicador[]>(() => {
    const r = this.resumen();
    const n = r?.conteo;
    return [
      {
        id: 'total',
        etiqueta: 'Citas del día',
        icono: 'calendar',
        tono: 'marca',
        valor: n?.todas ?? 0,
        detalle: !r
          ? ''
          : r.conteo.cerradas > 0
            ? `${r.progreso} % atendido · ${plural(r.conteo.cerradas, 'cancelada o ausente', 'canceladas o ausentes')}`
            : `${r.progreso} % atendido`,
      },
      {
        id: 'por-llegar',
        etiqueta: 'Por llegar',
        icono: 'calendar-clock',
        tono: 'llegar',
        valor: n?.['por-llegar'] ?? 0,
        detalle: r?.siguiente ? `Siguiente: ${formatearHora(r.siguiente)}` : 'Nadie por llegar',
      },
      {
        id: 'en-espera',
        etiqueta: 'En espera',
        icono: 'hourglass',
        tono: 'espera',
        valor: n?.['en-espera'] ?? 0,
        detalle:
          r?.mayorEsperaMin != null
            ? `Mayor espera: ${formatearEspera(r.mayorEsperaMin)}`
            : n?.['en-espera']
              ? 'Llegaron a la sede'
              : 'Nadie en espera',
      },
      {
        id: 'en-atencion',
        etiqueta: 'En atención',
        icono: 'stethoscope',
        tono: 'atencion',
        valor: n?.['en-atencion'] ?? 0,
        detalle: n?.['en-atencion'] ? 'En consultorio' : 'Nadie en consultorio',
      },
      {
        id: 'completadas',
        etiqueta: 'Completadas',
        icono: 'check-check',
        tono: 'completada',
        valor: n?.completadas ?? 0,
        detalle: r ? `De ${plural(r.activas, 'cita activa', 'citas activas')}` : '',
      },
    ];
  });
}
