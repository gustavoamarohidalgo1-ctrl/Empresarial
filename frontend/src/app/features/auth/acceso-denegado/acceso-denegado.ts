import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ETIQUETA_ROL, rutaInicioPorRol } from '../../../core/auth/roles';
import { PaginaEstadoComponent } from '../../../shared/paginas/no-encontrada/pagina-estado';
import { IconoComponent } from '../../../shared/ui/icono/icono';

/** Se muestra ante un 403 o cuando el rol no puede entrar a una ruta. */
@Component({
  selector: 'app-acceso-denegado',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, PaginaEstadoComponent],
  template: `
    <app-pagina-estado
      ilustracion="acceso-denegado"
      codigo="Error 403"
      titulo="Acceso denegado"
      texto="Tu cuenta no tiene permiso para ver esta página o realizar esta acción."
    >
      @if (usuario(); as u) {
        <p class="ad__sesion">
          <app-icono nombre="user" />
          <span>Sesión de {{ u.nombre }} · {{ rol() }}</span>
        </p>
      }
      <p class="texto-sm">
        Si crees que deberías tener acceso, comunícate con el administrador de SIGA-SP de tu sede.
      </p>
      @if (usuario()) {
        <a acciones class="btn btn--primario" [routerLink]="inicio()">
          <app-icono nombre="house" /> Ir a mi inicio
        </a>
      } @else {
        <a acciones class="btn btn--primario" routerLink="/login">
          <app-icono nombre="arrow-right" /> Iniciar sesión
        </a>
      }
    </app-pagina-estado>
  `,
  styles: `
    .ad__sesion {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
      margin: var(--e-2) 0 var(--e-3);
      padding: var(--e-1) var(--e-3);
      border: 1px solid var(--c-borde);
      border-radius: var(--r-pildora);
      background: var(--c-superficie-2);
      color: var(--c-texto);
      font-size: var(--t-14);
      font-weight: 500;
      --icono-tamano: 1rem;
    }
  `,
})
export class AccesoDenegadoComponent {
  protected readonly usuario = inject(AuthService).usuario;
  protected readonly inicio = computed(() => {
    const u = this.usuario();
    return u ? rutaInicioPorRol(u.rol) : '/login';
  });
  protected readonly rol = computed(() => {
    const u = this.usuario();
    return u ? ETIQUETA_ROL[u.rol] : '';
  });
}
