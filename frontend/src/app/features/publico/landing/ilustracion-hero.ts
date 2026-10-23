import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Ilustración decorativa de la portada: calendario de reserva con horarios, tarjeta de cita
 * confirmada y aviso de recordatorio. Solo formas y tokens de color (funciona en ambos temas);
 * `aria-hidden`. Flota suavemente salvo con «reducir movimiento».
 */
@Component({
  selector: 'app-ilustracion-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 480 400" aria-hidden="true" focusable="false">
      <circle class="i-halo" cx="250" cy="196" r="172" />
      <circle class="i-halo-2" cx="250" cy="196" r="128" />
      <path class="i-pulso" d="M292 374h40l10-18 14 34 12-26 8 10h80" />
      <path class="i-mas" d="M440 132v18M431 141h18" />
      <circle class="i-chispa-acento" cx="64" cy="108" r="7" />
      <circle class="i-chispa" cx="456" cy="250" r="5" />

      <!-- Ventana de reserva: calendario y horarios -->
      <g class="i-ventana-grupo">
        <rect class="i-ventana" x="110" y="50" width="290" height="252" rx="20" />
        <path
          class="i-ventana-cab"
          d="M130 50h250a20 20 0 0 1 20 20v36H110V70a20 20 0 0 1 20-20z"
        />
        <circle class="i-cab-claro" cx="140" cy="78" r="11" />
        <rect class="i-cab-claro" x="160" y="69" width="92" height="8" rx="4" />
        <rect class="i-cab-tenue" x="160" y="83" width="60" height="6" rx="3" />
        <circle class="i-cab-tenue" cx="356" cy="78" r="7" />
        <circle class="i-cab-tenue" cx="376" cy="78" r="7" />

        @for (x of columnas; track x) {
          <rect class="i-semana" [attr.x]="x + 4" y="122" width="20" height="6" rx="3" />
        }
        @for (y of filas; track y) {
          @for (x of columnas; track x) {
            <rect class="i-dia" [attr.x]="x" [attr.y]="y" width="28" height="26" rx="7" />
          }
        }
        <rect class="i-dia-acento" x="313" y="140" width="28" height="26" rx="7" />
        <rect class="i-dia-sel" x="241" y="176" width="28" height="26" rx="7" />
        <circle class="i-dia-sel-punto" cx="255" cy="196" r="2.5" />

        <rect class="i-hora" x="133" y="254" width="64" height="26" rx="13" />
        <rect class="i-hora i-hora--sel" x="205" y="254" width="64" height="26" rx="13" />
        <rect class="i-hora" x="277" y="254" width="64" height="26" rx="13" />
        <rect class="i-hora-linea" x="149" y="264" width="32" height="6" rx="3" />
        <rect class="i-hora-linea i-hora-linea--sel" x="221" y="264" width="32" height="6" rx="3" />
        <rect class="i-hora-linea" x="293" y="264" width="32" height="6" rx="3" />
      </g>

      <!-- Recordatorio -->
      <g class="i-flota i-flota--lenta">
        <rect class="i-tarjeta" x="324" y="22" width="144" height="56" rx="14" />
        <circle class="i-campana-fondo" cx="350" cy="50" r="15" />
        <path
          class="i-campana"
          d="M344 54h12M345.5 54v-6a4.5 4.5 0 0 1 9 0v6M348.5 57.5a1.8 1.8 0 0 0 3 0"
        />
        <circle class="i-insignia" cx="361" cy="38" r="5" />
        <rect class="i-linea-fuerte" x="374" y="40" width="78" height="8" rx="4" />
        <rect class="i-linea" x="374" y="55" width="56" height="7" rx="3.5" />
      </g>

      <!-- Cita confirmada -->
      <g class="i-flota">
        <rect class="i-tarjeta" x="36" y="290" width="236" height="100" rx="16" />
        <rect class="i-ficha" x="54" y="308" width="52" height="64" rx="10" />
        <path class="i-ficha-cab" d="M64 308h32a10 10 0 0 1 10 10v8H54v-8a10 10 0 0 1 10-10z" />
        <rect class="i-ficha-dia" x="68" y="336" width="24" height="22" rx="5" />
        <rect class="i-linea-fuerte" x="120" y="314" width="108" height="10" rx="5" />
        <rect class="i-linea" x="120" y="332" width="82" height="8" rx="4" />
        <rect class="i-linea" x="120" y="346" width="96" height="8" rx="4" />
        <rect class="i-estado" x="120" y="360" width="78" height="16" rx="8" />
        <circle class="i-estado-punto" cx="131" cy="368" r="4" />
        <rect class="i-estado-texto" x="140" y="365" width="48" height="6" rx="3" />
        <circle class="i-sello" cx="266" cy="294" r="20" />
        <path class="i-sello-check" d="m257 294 6 6 12-12" />
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }

    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }

    .i-halo {
      fill: var(--c-primario-tenue);
    }

    .i-halo-2 {
      fill: var(--c-primario-suave);
      opacity: 0.55;
    }

    .i-pulso,
    .i-mas,
    .i-campana,
    .i-sello-check {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .i-pulso {
      stroke: var(--c-acento);
      stroke-width: 3;
      opacity: 0.7;
    }

    .i-mas {
      stroke: var(--c-primario-borde);
      stroke-width: 3;
    }

    .i-chispa-acento {
      fill: var(--c-acento);
      opacity: 0.45;
    }

    .i-chispa {
      fill: var(--c-primario-borde);
    }

    .i-ventana,
    .i-tarjeta {
      fill: var(--c-superficie-elevada);
      stroke: var(--c-borde);
    }

    .i-ventana-grupo,
    .i-flota {
      filter: drop-shadow(0 18px 24px color-mix(in srgb, var(--c-velo) 40%, transparent));
    }

    .i-ventana-cab {
      fill: var(--c-primario);
    }

    .i-cab-claro {
      fill: var(--c-sobre-primario);
      opacity: 0.9;
    }

    .i-cab-tenue {
      fill: var(--c-sobre-primario);
      opacity: 0.5;
    }

    .i-semana,
    .i-linea {
      fill: var(--c-superficie-3);
    }

    .i-dia {
      fill: var(--c-superficie-2);
    }

    .i-dia-acento {
      fill: var(--c-acento-suave);
      stroke: var(--c-acento);
      stroke-width: 1.5;
    }

    .i-dia-sel {
      fill: var(--c-primario);
    }

    .i-dia-sel-punto {
      fill: var(--c-sobre-primario);
    }

    .i-hora {
      fill: var(--c-superficie);
      stroke: var(--c-borde-control);
      stroke-width: 1;
    }

    .i-hora--sel {
      fill: var(--c-primario-suave);
      stroke: var(--c-primario);
      stroke-width: 2;
    }

    .i-hora-linea {
      fill: var(--c-superficie-3);
    }

    .i-hora-linea--sel {
      fill: var(--c-primario);
    }

    .i-linea-fuerte {
      fill: var(--c-texto);
      opacity: 0.8;
    }

    .i-ficha {
      fill: var(--c-primario-suave);
    }

    .i-ficha-cab,
    .i-ficha-dia {
      fill: var(--c-primario);
    }

    .i-estado {
      fill: var(--estado-confirmada-fondo);
    }

    .i-estado-punto,
    .i-estado-texto {
      fill: var(--estado-confirmada);
    }

    .i-sello {
      fill: var(--c-acento);
    }

    .i-sello-check {
      stroke: var(--c-superficie);
      stroke-width: 3.5;
    }

    .i-campana-fondo {
      fill: var(--c-acento-suave);
    }

    .i-campana {
      stroke: var(--c-acento);
      stroke-width: 2;
    }

    .i-insignia {
      fill: var(--c-error);
      stroke: var(--c-superficie-elevada);
      stroke-width: 2;
    }

    @media (prefers-reduced-motion: no-preference) {
      .i-flota {
        animation: flotar 6s ease-in-out infinite;
      }

      .i-flota--lenta {
        animation-duration: 8s;
        animation-delay: -2s;
      }
    }

    @keyframes flotar {
      50% {
        transform: translateY(-6px);
      }
    }

    @media (forced-colors: active) {
      .i-ventana-grupo,
      .i-flota {
        filter: none;
      }
    }
  `,
})
export class IlustracionHeroComponent {
  protected readonly columnas = [133, 169, 205, 241, 277, 313, 349] as const;
  protected readonly filas = [140, 176, 212] as const;
}
