import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconoComponent } from '../../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../../shared/ui/icono/iconos';
import { EstadoRegla, TEXTO_AL_ENVIAR, evaluarClave } from '../politica-contrasena';

const ICONO_ESTADO: Readonly<Record<EstadoRegla, NombreIcono>> = {
  cumple: 'check-circle',
  pendiente: 'x-circle',
  'al-enviar': 'clock',
};

/** Texto del estado para lectores de pantalla (tras el nombre de la regla). */
const ESTADO_LECTORES: Readonly<Record<EstadoRegla, string>> = {
  cumple: 'cumple',
  pendiente: 'pendiente',
  'al-enviar': TEXTO_AL_ENVIAR.toLocaleLowerCase('es-PE'),
};

/**
 * Medidor de seguridad de la contraseña: barra de 4 tramos (decorativa), nivel en texto
 * («Débil», «Aceptable», «Segura», «Muy segura») y la lista de requisitos del contrato, cada
 * uno con icono y texto («cumple» / «pendiente»), nunca solo color. La regla de contraseñas
 * comunes, que solo el servidor puede confirmar del todo, aparece en un estado neutro
 * («Se comprueba al enviar») salvo que la contraseña esté en la muestra local.
 *
 * El nivel está en una región `aria-live="polite"` atómica: solo se anuncia cuando cambia, no
 * en cada tecla. La lista tiene `id` = `<idBase>-requisitos` para enlazarla con
 * `aria-describedby` desde el campo.
 *
 * Uso: `<app-medidor-clave idBase="registro-clave" [clave]="valor" [correo]="email" />`
 */
@Component({
  selector: 'app-medidor-clave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <div class="medidor" [attr.data-nivel]="evaluacion().nivel">
      <div class="medidor__cabecera">
        <span class="medidor__titulo" aria-hidden="true">Seguridad de la contraseña</span>
        <p class="medidor__nivel" [id]="idBase() + '-nivel'" aria-live="polite" aria-atomic="true">
          @if (evaluacion().nivel > 0) {
            <span class="solo-lectores">Seguridad de la contraseña: </span
            >{{ evaluacion().etiqueta }}
          }
        </p>
      </div>
      <div class="medidor__barra" aria-hidden="true">
        @for (tramo of tramos; track tramo) {
          <span
            class="medidor__tramo"
            [class.medidor__tramo--lleno]="tramo <= evaluacion().nivel"
          ></span>
        }
      </div>
      <ul
        class="medidor__reglas"
        [id]="idBase() + '-requisitos'"
        aria-label="Requisitos de la contraseña"
      >
        @for (regla of evaluacion().reglas; track regla.id) {
          <li [class]="'regla regla--' + regla.estado">
            <app-icono [nombre]="iconos[regla.estado]" [trazo]="2" />
            <span
              >{{ regla.texto }}
              @if (regla.estado === 'al-enviar') {
                <span class="regla__nota" aria-hidden="true">· {{ textoAlEnviar }}</span>
              }
            </span>
            <span class="solo-lectores">: {{ lectores[regla.estado] }}</span>
          </li>
        }
      </ul>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .medidor {
      --nivel-color: var(--c-borde-control);
      padding: var(--e-3) var(--e-4);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-control);
      background: var(--c-superficie-2);
    }

    .medidor[data-nivel='1'] {
      --nivel-color: var(--c-error);
    }

    .medidor[data-nivel='2'] {
      --nivel-color: var(--c-advertencia);
    }

    .medidor[data-nivel='3'] {
      --nivel-color: var(--c-acento);
    }

    .medidor[data-nivel='4'] {
      --nivel-color: var(--c-exito);
    }

    .medidor__cabecera {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--e-1) var(--e-3);
      font-size: var(--t-13);
    }

    .medidor__titulo {
      color: var(--c-texto-2);
      font-weight: 600;
    }

    .medidor__nivel {
      min-height: 1.4em;
      margin: 0;
      color: var(--nivel-color);
      font-weight: 700;
    }

    .medidor__barra {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: var(--e-1);
      margin: var(--e-2) 0 var(--e-3);
    }

    .medidor__tramo {
      height: 0.375rem;
      border-radius: var(--r-pildora);
      background: var(--c-superficie-3);
      transition: background-color var(--dur-2) var(--curva);
    }

    .medidor__tramo--lleno {
      background: var(--nivel-color);
    }

    .medidor__reglas {
      display: grid;
      gap: var(--e-1) var(--e-4);
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--c-texto-2);
      font-size: var(--t-13);
      --icono-tamano: 1rem;
    }

    @media (min-width: 36rem) {
      .medidor__reglas {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .medidor__reglas li {
      display: flex;
      align-items: flex-start;
      gap: var(--e-2);
    }

    .medidor__reglas app-icono {
      flex: none;
      margin-top: 0.1em;
    }

    .medidor__reglas .regla--cumple {
      color: var(--c-texto);
    }

    .medidor__reglas .regla--cumple app-icono {
      color: var(--c-exito);
    }

    .regla__nota {
      white-space: nowrap;
    }

    @media (forced-colors: active) {
      .medidor__tramo--lleno {
        background: CanvasText;
      }
    }
  `,
})
export class MedidorClaveComponent {
  /** Prefijo de los `id` internos (`-nivel`, `-requisitos`). */
  readonly idBase = input.required<string>();
  readonly clave = input<string>('');
  /** Correo de la persona, si se conoce (activa la regla «Distinta de tu correo»). */
  readonly correo = input<string | null>(null);

  protected readonly tramos = [1, 2, 3, 4] as const;
  protected readonly iconos = ICONO_ESTADO;
  protected readonly lectores = ESTADO_LECTORES;
  protected readonly textoAlEnviar = TEXTO_AL_ENVIAR;
  protected readonly evaluacion = computed(() => evaluarClave(this.clave(), this.correo()));
}
