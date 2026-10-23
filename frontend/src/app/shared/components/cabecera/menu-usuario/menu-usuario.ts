import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { UsuarioSesion } from '../../../../core/modelos/contrato';
import { PreferenciaTema } from '../../../../core/tema/tema';
import { TemaService } from '../../../../core/tema/tema.service';
import { IconoComponent } from '../../../ui/icono/icono';
import { NombreIcono } from '../../../ui/icono/iconos';

export const OPCIONES_TEMA: readonly {
  valor: PreferenciaTema;
  texto: string;
  icono: NombreIcono;
}[] = [
  { valor: 'claro', texto: 'Claro', icono: 'sun' },
  { valor: 'oscuro', texto: 'Oscuro', icono: 'moon' },
  { valor: 'sistema', texto: 'Sistema', icono: 'monitor' },
];

/**
 * Panel del menú de usuario de la cabecera: persona y rol, «Mi perfil» (paciente),
 * «Seguridad de la cuenta» (todos los roles), tema Claro/Oscuro/Sistema y «Cerrar sesión».
 *
 * La cabecera lo carga en diferido (`componenteDiferido`) la primera vez que se abre el menú, o
 * antes en tiempo ocioso: no hace falta para el primer render y así no pesa en el bundle inicial.
 * El estado (abierto, cerrando) y el cierre de sesión los lleva la cabecera, que también
 * gestiona Escape, el clic fuera y la salida del foco.
 */
@Component({
  selector: 'app-menu-usuario',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconoComponent],
  template: `
    <div id="cab-menu-usuario" class="cab__menu" [hidden]="!abierto()">
      @if (usuario(); as u) {
        <div class="cab__menu-cabecera">
          <span class="cab__avatar" aria-hidden="true">{{ iniciales() }}</span>
          <div class="cab__menu-persona">
            <p class="cab__menu-nombre">{{ u.nombre }}</p>
            <p class="cab__menu-correo">{{ u.email }}</p>
            <span class="insignia insignia--marca">{{ etiquetaRol() }}</span>
          </div>
        </div>
      }

      <div class="cab__menu-enlaces">
        @if (esPaciente()) {
          <a
            class="cab__menu-enlace"
            routerLink="/paciente/perfil"
            routerLinkActive="activo"
            ariaCurrentWhenActive="page"
          >
            <app-icono nombre="user" /> Mi perfil
          </a>
        }
        <a
          class="cab__menu-enlace"
          routerLink="/cuenta/seguridad"
          routerLinkActive="activo"
          ariaCurrentWhenActive="page"
        >
          <app-icono nombre="lock" /> Seguridad de la cuenta
        </a>
      </div>

      <fieldset class="cab__tema">
        <legend class="cab__tema-titulo">Tema</legend>
        <div class="segmentado segmentado--bloque">
          @for (opcion of opcionesTema; track opcion.valor) {
            <label class="segmentado__opcion">
              <input
                type="radio"
                name="cab-tema"
                [value]="opcion.valor"
                [checked]="preferenciaTema() === opcion.valor"
                (change)="tema.cambiar(opcion.valor)"
              />
              <app-icono [nombre]="opcion.icono" />
              <span>{{ opcion.texto }}</span>
            </label>
          }
        </div>
      </fieldset>

      <button
        type="button"
        class="cab__salir"
        (click)="salir.emit()"
        [disabled]="cerrando()"
        [attr.aria-describedby]="idEstado()"
      >
        <app-icono nombre="log-out" />
        {{ cerrando() ? 'Cerrando sesión…' : 'Cerrar sesión' }}
      </button>
    </div>
  `,
  styles: `
    :host {
      display: contents;
    }

    .cab__menu {
      position: absolute;
      top: calc(100% + var(--e-2));
      right: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      gap: var(--e-4);
      width: min(20rem, calc(100vw - 2 * var(--e-4)));
      padding: var(--e-4);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-tarjeta);
      background: var(--c-superficie-elevada);
      box-shadow: var(--sombra-3);
      transform-origin: top right;
      animation: menu-aparece var(--dur-2) var(--curva);
    }

    .cab__menu[hidden] {
      display: none;
    }

    .cab__menu-cabecera {
      display: flex;
      align-items: center;
      gap: var(--e-3);
      padding-bottom: var(--e-4);
      border-bottom: 1px solid var(--c-borde);
    }

    .cab__avatar {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      font-size: var(--t-16);
      font-weight: 700;
      letter-spacing: 0.02em;
    }

    .cab__menu-persona {
      min-width: 0;
    }

    .cab__menu-persona p {
      margin: 0;
      overflow-wrap: anywhere;
    }

    .cab__menu-nombre {
      font-weight: 650;
    }

    .cab__menu-persona .cab__menu-correo {
      margin-bottom: var(--e-1);
      color: var(--c-texto-2);
      font-size: var(--t-13);
    }

    .cab__menu-enlaces {
      display: flex;
      flex-direction: column;
      gap: var(--e-1);
      margin-block: calc(-1 * var(--e-2));
    }

    .cab__tema-titulo {
      margin-bottom: var(--e-2);
      color: var(--c-texto-2);
      font-size: var(--t-13);
      font-weight: 600;
    }

    .cab__tema .segmentado__opcion {
      padding-inline: var(--e-2);
    }

    .cab__menu-enlace,
    .cab__salir {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      width: 100%;
      min-height: var(--alto-control);
      padding: var(--e-2) var(--e-3);
      border-radius: var(--r-control);
      color: var(--c-texto);
      font-weight: 600;
      text-decoration: none;
    }

    .cab__menu-enlace:hover {
      background: var(--c-superficie-2);
      color: var(--c-texto);
    }

    .cab__menu-enlace.activo {
      background: var(--c-primario-suave);
      color: var(--c-primario-fuerte);
      box-shadow: inset 3px 0 0 var(--c-primario);
    }

    .cab__salir {
      border: 1px solid var(--c-borde);
      background: transparent;
      cursor: pointer;
      transition:
        background-color var(--dur-1) var(--curva),
        border-color var(--dur-1) var(--curva),
        color var(--dur-1) var(--curva);
    }

    .cab__salir:hover {
      border-color: var(--c-error);
      background: var(--c-error-suave);
      color: var(--c-error);
    }

    .cab__salir[disabled] {
      color: var(--c-texto-2);
      cursor: progress;
    }

    @keyframes menu-aparece {
      from {
        opacity: 0;
        transform: translateY(-4px) scale(0.98);
      }
    }

    @media (forced-colors: active) {
      .cab__menu-enlace.activo {
        outline: 2px solid Highlight;
      }
    }
  `,
})
export class MenuUsuarioComponent {
  protected readonly tema = inject(TemaService);

  readonly usuario = input<UsuarioSesion | null>(null);
  readonly iniciales = input('');
  readonly etiquetaRol = input('');
  readonly abierto = input(false);
  readonly cerrando = input(false);
  /** `id` del mensaje de estado del cierre de sesión (si lo hay), para `aria-describedby`. */
  readonly idEstado = input<string | null>(null);
  /** «Cerrar sesión»: el cierre lo hace la cabecera. */
  readonly salir = output<void>();

  protected readonly opcionesTema = OPCIONES_TEMA;
  protected readonly preferenciaTema = this.tema.preferencia;
  protected readonly esPaciente = computed(() => this.usuario()?.rol === 'PACIENTE');
}
