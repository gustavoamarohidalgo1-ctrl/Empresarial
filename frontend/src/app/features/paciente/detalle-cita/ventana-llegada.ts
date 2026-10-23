import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { VentanaLlegada } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { cuentaRegresivaLima } from '../../../shared/utils/fecha-lima';

type EstadoVentana = 'registrada' | 'abierta' | 'pendiente' | 'cerrada' | 'no-disponible';

const ICONO: Readonly<Record<EstadoVentana, NombreIcono>> = {
  registrada: 'check-circle',
  abierta: 'map-pin',
  pendiente: 'clock',
  cerrada: 'x-circle',
  'no-disponible': 'info',
};

/** Margen a cada lado de la escala del día (30 min). */
const MARGEN_MS = 30 * 60_000;

/**
 * Ventana de llegada: estado (icono + texto), una escala del día con la franja en la que se
 * puede registrar la llegada, el bloque de la cita y la marca de «ahora», y la explicación en
 * texto. La escala es decorativa (`aria-hidden`): el texto dice lo mismo, en hora de Lima.
 */
@Component({
  selector: 'app-ventana-llegada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, FechaLimaPipe],
  template: `
    <section class="tarjeta" aria-labelledby="titulo-ventana">
      <div class="vl__cabecera">
        <h2 id="titulo-ventana">Ventana de llegada</h2>
        <p class="vl__estado" [attr.data-estado]="estado()">
          <app-icono [nombre]="icono()" /> {{ textoEstado() }}
        </p>
      </div>

      @if (escala(); as e) {
        <div class="vl__grafico" aria-hidden="true">
          <div class="vl__pista">
            <span class="vl__rango" [style.left.%]="e.rango[0]" [style.width.%]="e.rango[1]"></span>
            <span class="vl__cita" [style.left.%]="e.cita[0]" [style.width.%]="e.cita[1]"></span>
            @if (e.ahora !== null) {
              <span class="vl__ahora" [style.left.%]="e.ahora"></span>
            }
          </div>
          <div class="vl__marcas">
            <span [style.left.%]="e.rango[0]">{{ ventana().desde | fechaLima: 'hora' }}</span>
            <span [style.left.%]="e.rango[0] + e.rango[1]">{{
              ventana().hasta | fechaLima: 'hora'
            }}</span>
          </div>
          <ul class="vl__leyenda">
            <li><span class="vl__muestra vl__muestra--rango"></span>Registro de llegada</li>
            <li>
              <span class="vl__muestra vl__muestra--cita"></span>Tu cita ·
              {{ inicio() | fechaLima: 'hora' }}
            </li>
            @if (e.ahora !== null) {
              <li><span class="vl__muestra vl__muestra--ahora"></span>Ahora</li>
            }
          </ul>
        </div>
      }

      <p class="vl__texto">
        Puedes registrar tu llegada desde las
        <strong
          ><time [attr.datetime]="ventana().desde">{{
            ventana().desde | fechaLima: 'hora'
          }}</time></strong
        >
        hasta antes de las
        <strong
          ><time [attr.datetime]="ventana().hasta">{{
            ventana().hasta | fechaLima: 'hora'
          }}</time></strong
        >
        del {{ ventana().desde | fechaLima: 'fecha' }} (hora de Lima), estando en la sede.
      </p>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .vl__cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--e-2) var(--e-3);
      margin-bottom: var(--e-5);
    }

    .vl__cabecera h2 {
      margin: 0;
    }

    .vl__estado {
      display: inline-flex;
      align-items: center;
      gap: var(--e-1);
      margin: 0;
      padding: var(--e-1) var(--e-3);
      border-radius: var(--r-pildora);
      background: var(--c-superficie-2);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 650;
      --icono-tamano: 1rem;
    }

    [data-estado='abierta'] {
      background: var(--c-acento-suave);
      color: var(--c-acento);
      box-shadow: inset 0 0 0 1px var(--c-acento);
    }

    [data-estado='registrada'] {
      background: var(--c-exito-suave);
      color: var(--c-exito);
    }

    .vl__grafico {
      margin-bottom: var(--e-4);
    }

    .vl__pista {
      position: relative;
      height: 2.5rem;
      border: 1px solid var(--c-borde);
      border-radius: var(--r-control);
      background: var(--c-superficie-2);
    }

    .vl__rango,
    .vl__cita,
    .vl__ahora {
      position: absolute;
    }

    .vl__rango {
      inset-block: -1px;
      border-radius: var(--r-control);
      background: var(--c-acento-suave);
      box-shadow: inset 0 0 0 2px var(--c-acento);
    }

    .vl__cita {
      top: 0.75rem;
      bottom: 0.75rem;
      min-width: 0.5rem;
      border-radius: var(--r-pildora);
      background: var(--c-primario);
    }

    .vl__ahora {
      top: -0.375rem;
      bottom: -0.375rem;
      width: 2px;
      margin-left: -1px;
      border-radius: 1px;
      background: var(--c-texto);
    }

    .vl__marcas {
      position: relative;
      height: 1.25rem;
      margin-top: var(--e-1);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }

    .vl__marcas span {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      white-space: nowrap;
    }

    .vl__leyenda {
      display: flex;
      flex-wrap: wrap;
      gap: var(--e-1) var(--e-4);
      margin: var(--e-3) 0 0;
      padding: 0;
      list-style: none;
      color: var(--c-texto-2);
      font-size: var(--t-13);
    }

    .vl__leyenda li {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
    }

    .vl__muestra {
      flex: none;
      width: 0.875rem;
      height: 0.875rem;
      border-radius: 4px;
    }

    .vl__muestra--rango {
      background: var(--c-acento-suave);
      box-shadow: inset 0 0 0 2px var(--c-acento);
    }

    .vl__muestra--cita {
      height: 0.5rem;
      border-radius: var(--r-pildora);
      background: var(--c-primario);
    }

    .vl__muestra--ahora {
      width: 2px;
      background: var(--c-texto);
    }

    .vl__texto {
      margin: 0;
    }

    /* Alto contraste: la franja queda como contorno y la cita y «ahora», sólidas. */
    @media (forced-colors: active) {
      .vl__rango,
      .vl__muestra--rango {
        border: 2px solid CanvasText;
      }

      .vl__cita,
      .vl__ahora,
      .vl__muestra--cita,
      .vl__muestra--ahora {
        forced-color-adjust: none;
        background: CanvasText;
      }
    }
  `,
})
export class VentanaLlegadaComponent {
  readonly ventana = input.required<VentanaLlegada>();
  readonly inicio = input.required<string>();
  readonly fin = input.required<string>();
  readonly ahora = input<Date>(new Date());
  /** El servidor permite registrar la llegada ahora (`accionesPermitidas`). */
  readonly disponible = input(false);
  /** Instante en que se registró la llegada, si ya ocurrió. */
  readonly registradaEn = input<string | null>(null);

  protected readonly estado = computed<EstadoVentana>(() => {
    if (this.registradaEn()) return 'registrada';
    if (this.disponible()) return 'abierta';
    const ahora = this.ahora().getTime();
    if (ahora < Date.parse(this.ventana().desde)) return 'pendiente';
    if (ahora >= Date.parse(this.ventana().hasta)) return 'cerrada';
    return 'no-disponible';
  });

  protected readonly icono = computed(() => ICONO[this.estado()]);

  protected readonly textoEstado = computed(() => {
    switch (this.estado()) {
      case 'registrada':
        return 'Llegada registrada';
      case 'abierta':
        return 'Disponible ahora';
      case 'pendiente':
        return `Se abre ${cuentaRegresivaLima(this.ventana().desde, this.ahora())}`;
      case 'cerrada':
        return 'Ventana cerrada';
      default:
        return 'No disponible por ahora';
    }
  });

  /** Posiciones (en %) de la franja, la cita y «ahora» sobre una escala del día con margen. */
  protected readonly escala = computed(() => {
    const desde = Date.parse(this.ventana().desde);
    const hasta = Date.parse(this.ventana().hasta);
    const inicio = Date.parse(this.inicio());
    const fin = Date.parse(this.fin());
    if ([desde, hasta, inicio, fin].some(Number.isNaN) || hasta <= desde) return null;
    const min = Math.min(desde, inicio) - MARGEN_MS;
    const max = Math.max(hasta, fin) + MARGEN_MS;
    const pct = (t: number) => ((t - min) / (max - min)) * 100;
    const ahora = this.ahora().getTime();
    return {
      rango: [pct(desde), pct(hasta) - pct(desde)] as const,
      cita: [pct(inicio), Math.max(pct(fin) - pct(inicio), 0)] as const,
      ahora: ahora >= min && ahora <= max ? pct(ahora) : null,
    };
  });
}
