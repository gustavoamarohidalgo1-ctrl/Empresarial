import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IconoComponent } from '../../../ui/icono/icono';

/**
 * Acciones de la cabecera sin sesión: «Iniciar sesión» y «Crear cuenta». En pantallas muy
 * angostas, «Iniciar sesión» queda solo con su icono (el texto sigue para lectores de pantalla).
 */
@Component({
  selector: 'app-cabecera-invitado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, IconoComponent],
  template: `
    <a
      class="btn btn--fantasma ingresar"
      routerLink="/login"
      routerLinkActive="activo"
      ariaCurrentWhenActive="page"
    >
      <app-icono nombre="log-in" /><span class="ingresar__texto">Iniciar sesión</span>
    </a>
    <a
      class="btn btn--primario crear"
      routerLink="/registro"
      routerLinkActive="activo"
      ariaCurrentWhenActive="page"
    >
      <app-icono class="crear__icono" nombre="user-plus" />Crear cuenta
    </a>
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: var(--e-2);
    }

    .ingresar {
      --btn-texto: var(--c-texto);
    }

    .activo {
      box-shadow: inset 0 -2px 0 var(--c-primario);
    }

    @media (max-width: 35.99rem) {
      .ingresar {
        width: var(--alto-control);
        padding: 0;
      }

      .ingresar__texto {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }

      .crear__icono {
        display: none;
      }
    }
  `,
})
export class CabeceraInvitadoComponent {}
