import {
  ChangeDetectionStrategy,
  Component,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { EntradaFecha, formatearDiaLargo, partesCalendarioLima } from '../../utils/fecha-lima';

/**
 * Ficha de calendario: mes abreviado, día grande y día de la semana, SIEMPRE en America/Lima.
 * Visualmente compacta; para lectores de pantalla se lee la fecha completa
 * («Miércoles, 4 de noviembre de 2026»). Es un `<time datetime="YYYY-MM-DD">`.
 *
 * Uso: `<app-ficha-fecha [fecha]="cita.inicio" />` · `<app-ficha-fecha [fecha]="c.inicio" tamano="lg" destacada />`
 */
@Component({
  selector: 'app-ficha-fecha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': '"ficha ficha--" + tamano()',
    '[class.ficha--destacada]': 'destacada()',
  },
  template: `
    @if (partes(); as p) {
      <time class="ficha__caja" [attr.datetime]="p.iso">
        <span class="ficha__mes" aria-hidden="true">{{ p.mes }}</span>
        <span class="ficha__dia" aria-hidden="true">{{ p.dia }}</span>
        <span class="ficha__semana" aria-hidden="true">{{ p.diaSemana }}</span>
        <span class="solo-lectores">{{ textoCompleto() }}</span>
      </time>
    }
  `,
  styles: `
    /* Medidas fijas: el esqueleto puede reservar exactamente este tamaño. */
    :host {
      display: inline-flex;
      flex: none;
      --ficha-ancho: 3.75rem;
      --ficha-alto: 4.75rem;
      --ficha-dia: var(--t-24);
    }

    :host(.ficha--sm) {
      --ficha-ancho: 3rem;
      --ficha-alto: 4.5rem;
      --ficha-dia: var(--t-20);
    }

    :host(.ficha--lg) {
      --ficha-ancho: 4.75rem;
      --ficha-alto: 5.5rem;
      --ficha-dia: var(--t-36);
    }

    .ficha__caja {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      width: var(--ficha-ancho);
      height: var(--ficha-alto);
      overflow: hidden;
      border: 1px solid var(--c-borde);
      border-radius: var(--r-tarjeta);
      background: var(--c-superficie);
      box-shadow: var(--sombra-1);
      line-height: 1;
      text-align: center;
    }

    .ficha__mes {
      align-self: stretch;
      padding: 0.3125rem 0 0.25rem;
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      font-size: var(--t-12);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .ficha__dia {
      padding-top: 0.375rem;
      color: var(--c-texto);
      font-size: var(--ficha-dia);
      font-weight: 700;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .ficha__semana {
      padding: 0.25rem 0 0.4375rem;
      color: var(--c-texto-2);
      font-size: var(--t-12);
      font-weight: 600;
    }

    :host(.ficha--destacada) .ficha__caja {
      border-color: transparent;
      box-shadow: var(--sombra-2);
    }

    :host(.ficha--destacada) .ficha__mes {
      background: var(--c-primario);
      color: var(--c-sobre-primario);
    }
  `,
})
export class FichaFechaComponent {
  /** Instante ISO-8601 (UTC) de la API, `Date` o milisegundos. */
  readonly fecha = input.required<EntradaFecha>();
  readonly tamano = input<'sm' | 'md' | 'lg'>('md');
  /** Cabecera del mes con el color primario (para la próxima cita). */
  readonly destacada = input(false, { transform: booleanAttribute });

  protected readonly partes = computed(() => partesCalendarioLima(this.fecha()));
  protected readonly textoCompleto = computed(() => formatearDiaLargo(this.fecha()));
}
