import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CitaDetalle } from '../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../shared/pipes/fecha-lima.pipe';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';

interface Paso {
  nombre: string;
  icono: NombreIcono;
  /** Instante en que se completó, o `null`. */
  en: string | null;
  hecho: string;
  pendiente: string;
}

/**
 * Preparación de la cita: confirmación, pre-check-in y llegada, cada paso con su estado en
 * TEXTO («Confirmada el…», «Sin completar»); el icono y el color solo lo refuerzan.
 */
@Component({
  selector: 'app-preparacion-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, FechaLimaPipe],
  template: `
    <section class="tarjeta" aria-labelledby="titulo-preparacion">
      <h2 id="titulo-preparacion">Preparación y llegada</h2>
      <ol class="pasos">
        @for (p of pasos(); track p.nombre) {
          <li class="paso" [class.paso--hecho]="!!p.en">
            <span class="paso__marca"><app-icono [nombre]="p.en ? 'check' : p.icono" /></span>
            <p class="paso__nombre">{{ p.nombre }}</p>
            <p class="paso__estado">
              @if (p.en) {
                {{ p.hecho }} <time [attr.datetime]="p.en">{{ p.en | fechaLima }}</time>
              } @else {
                {{ p.pendiente }}
              }
            </p>
          </li>
        }
      </ol>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }

    .pasos {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(100%, 10rem), 1fr));
      gap: var(--e-4);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .paso {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      column-gap: var(--e-3);
    }

    .paso__marca {
      display: inline-flex;
      grid-row: span 2;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 1px dashed var(--c-borde-control);
      border-radius: 50%;
      color: var(--c-texto-2);
      --icono-tamano: 1.125rem;
    }

    .paso--hecho .paso__marca {
      border: 1px solid var(--c-exito);
      background: var(--c-exito-suave);
      color: var(--c-exito);
    }

    .paso__nombre {
      margin: 0;
      font-weight: 650;
    }

    .paso__estado {
      margin: 0;
      color: var(--c-texto-2);
      font-size: var(--t-14);
    }
  `,
})
export class PreparacionCitaComponent {
  readonly cita = input.required<CitaDetalle>();

  protected readonly pasos = computed<Paso[]>(() => {
    const c = this.cita();
    return [
      {
        nombre: 'Confirmación',
        icono: 'check-circle',
        en: c.confirmadaEn,
        hecho: 'Confirmada el',
        pendiente: 'Sin confirmar',
      },
      {
        nombre: 'Pre-check-in',
        icono: 'clipboard-check',
        en: c.preCheckInCompletadoEn,
        hecho: 'Completado el',
        pendiente: 'Sin completar',
      },
      {
        nombre: 'Llegada',
        icono: 'map-pin',
        en: c.llegadaRegistradaEn,
        hecho: 'Registrada el',
        pendiente: 'Sin registro',
      },
    ];
  });
}
