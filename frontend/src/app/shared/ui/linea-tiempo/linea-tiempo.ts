import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EventoLineaTiempo, TipoEventoLineaTiempo } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../pipes/fecha-lima.pipe';
import { IconoComponent } from '../icono/icono';
import { NombreIcono } from '../icono/iconos';

/** Icono de cada tipo de evento (mismos iconos que los estados de docs/diseno.md). */
export const ICONO_EVENTO: Readonly<Record<TipoEventoLineaTiempo, NombreIcono>> = {
  CREADA: 'calendar-plus',
  CONFIRMADA: 'check-circle',
  CANCELADA: 'x-circle',
  REPROGRAMADA: 'calendar-clock',
  PRE_CHECK_IN_COMPLETADO: 'clipboard-check',
  LLEGADA_REGISTRADA: 'map-pin',
  EN_ESPERA: 'hourglass',
  EN_ATENCION: 'stethoscope',
  COMPLETADA: 'check-check',
  NO_ASISTIO: 'user-x',
};

/**
 * Línea de tiempo de una cita: icono por tipo de evento, conector vertical, título,
 * descripción y fecha-hora de Lima con cifras tabulares. El evento más reciente (mayor
 * `secuencia`) va destacado y marcado con `aria-current="step"` y el texto «Más reciente».
 *
 * Uso: `<app-linea-tiempo [eventos]="eventos()" etiquetadoPor="titulo-historial" />`
 */
@Component({
  selector: 'app-linea-tiempo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, FechaLimaPipe],
  template: `
    <ol class="lt" [attr.aria-labelledby]="etiquetadoPor()">
      @for (e of ordenados(); track e.secuencia) {
        @let reciente = e.secuencia === secuenciaReciente();
        <li
          class="lt__evento"
          [class.lt__evento--reciente]="reciente"
          [attr.data-tipo]="e.tipo"
          [attr.aria-current]="reciente ? 'step' : null"
        >
          <span class="lt__marcador"><app-icono [nombre]="icono(e.tipo)" /></span>
          <div class="lt__cuerpo">
            <div class="lt__cabecera">
              <p class="lt__titulo">{{ e.titulo }}</p>
              @if (reciente) {
                <span class="lt__reciente">Más reciente</span>
              }
            </div>
            @if (e.descripcion) {
              <p class="lt__descripcion">{{ e.descripcion }}</p>
            }
            <time class="lt__hora" [attr.datetime]="e.ocurridoEn">{{
              e.ocurridoEn | fechaLima
            }}</time>
          </div>
        </li>
      }
    </ol>
  `,
  styles: `
    :host {
      display: block;
    }

    .lt {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .lt__evento {
      --tono: var(--c-primario);
      --tono-fondo: var(--c-primario-suave);
      position: relative;
      display: grid;
      grid-template-columns: 2.25rem minmax(0, 1fr);
      gap: var(--e-3);
      padding-bottom: var(--e-5);
    }

    /* Conector vertical entre marcadores. */
    .lt__evento:not(:last-child)::before {
      content: '';
      position: absolute;
      top: 2.5rem;
      bottom: 0.25rem;
      left: calc(1.125rem - 1px);
      width: 2px;
      border-radius: 1px;
      background: var(--c-borde);
    }

    .lt__evento:last-child {
      padding-bottom: 0;
    }

    .lt__marcador {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 1px solid color-mix(in srgb, var(--tono) 30%, transparent);
      border-radius: 50%;
      background: var(--tono-fondo);
      color: var(--tono);
      --icono-tamano: 1.125rem;
    }

    .lt__evento--reciente .lt__marcador {
      box-shadow:
        0 0 0 4px var(--c-superficie),
        0 0 0 6px var(--tono);
    }

    .lt__cuerpo {
      min-width: 0;
      padding-top: 0.375rem;
    }

    .lt__cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-1) var(--e-2);
    }

    .lt__titulo {
      margin: 0;
      font-weight: 600;
      line-height: 1.35;
    }

    .lt__evento--reciente .lt__titulo {
      font-weight: 700;
    }

    .lt__reciente {
      padding: 0 var(--e-2);
      border-radius: var(--r-pildora);
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      font-size: var(--t-12);
      font-weight: 600;
      line-height: 1.5;
    }

    .lt__descripcion {
      margin: var(--e-1) 0 0;
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }

    .lt__hora {
      display: block;
      margin-top: var(--e-1);
      color: var(--c-texto-2);
      font-size: var(--t-13);
    }

    [data-tipo='CONFIRMADA'] {
      --tono: var(--estado-confirmada);
      --tono-fondo: var(--estado-confirmada-fondo);
    }

    [data-tipo='CANCELADA'] {
      --tono: var(--estado-cancelada);
      --tono-fondo: var(--estado-cancelada-fondo);
    }

    [data-tipo='REPROGRAMADA'] {
      --tono: var(--estado-pendiente);
      --tono-fondo: var(--estado-pendiente-fondo);
    }

    [data-tipo='PRE_CHECK_IN_COMPLETADO'] {
      --tono: var(--c-acento);
      --tono-fondo: var(--c-acento-suave);
    }

    [data-tipo='LLEGADA_REGISTRADA'] {
      --tono: var(--estado-llegada);
      --tono-fondo: var(--estado-llegada-fondo);
    }

    [data-tipo='EN_ESPERA'] {
      --tono: var(--estado-espera);
      --tono-fondo: var(--estado-espera-fondo);
    }

    [data-tipo='EN_ATENCION'] {
      --tono: var(--estado-atencion);
      --tono-fondo: var(--estado-atencion-fondo);
    }

    [data-tipo='COMPLETADA'] {
      --tono: var(--estado-completada);
      --tono-fondo: var(--estado-completada-fondo);
    }

    [data-tipo='NO_ASISTIO'] {
      --tono: var(--estado-no-asistio);
      --tono-fondo: var(--estado-no-asistio-fondo);
    }
  `,
})
export class LineaTiempoComponent {
  readonly eventos = input.required<readonly EventoLineaTiempo[]>();
  /** `asc` (cronológico, por defecto) o `desc` (lo más reciente primero). */
  readonly orden = input<'asc' | 'desc'>('asc');
  /** `id` del título que nombra la lista (`aria-labelledby`). */
  readonly etiquetadoPor = input<string | null>(null);

  protected readonly ordenados = computed(() => {
    const signo = this.orden() === 'desc' ? -1 : 1;
    return [...(this.eventos() ?? [])].sort((a, b) => signo * (a.secuencia - b.secuencia));
  });
  protected readonly secuenciaReciente = computed(() =>
    (this.eventos() ?? []).reduce<number | null>(
      (max, e) => (max === null || e.secuencia > max ? e.secuencia : max),
      null,
    ),
  );

  protected icono(tipo: TipoEventoLineaTiempo): NombreIcono {
    return ICONO_EVENTO[tipo] ?? 'info';
  }
}
