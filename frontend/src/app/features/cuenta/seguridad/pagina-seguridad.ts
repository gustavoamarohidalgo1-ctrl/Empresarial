import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { SeguridadCuentaComponent } from './seguridad-cuenta';

/**
 * «Seguridad de la cuenta» (`/cuenta/seguridad`), para cualquier rol con sesión: cambio de
 * contraseña (`SeguridadCuentaComponent`) y cómo protege SIGA-SP la cuenta. Se llega desde el
 * menú de usuario de la cabecera y, en el caso del paciente, también desde «Mi perfil».
 */
@Component({
  selector: 'app-pagina-seguridad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EncabezadoPaginaComponent, IconoComponent, SeguridadCuentaComponent],
  template: `
    <app-encabezado-pagina
      titulo="Seguridad de la cuenta"
      subtitulo="Mantén tu contraseña al día para proteger tus datos y los de tus citas."
    />

    <div class="seguridad-pagina">
      @if (correo(); as c) {
        <p class="seguridad-pagina__cuenta">
          <app-icono nombre="mail" />
          <span
            >Cuenta: <strong>{{ c }}</strong></span
          >
        </p>
      }

      <app-seguridad-cuenta [correo]="correo()" />

      <section class="tarjeta tarjeta--suave" aria-labelledby="seguridad-protecciones">
        <h2 id="seguridad-protecciones" class="seguridad-pagina__titulo">
          Cómo protegemos tu cuenta
        </h2>
        <ul class="seguridad-pagina__lista">
          <li>
            <app-icono nombre="key-round" />
            <span>Tu contraseña se guarda protegida con hash: nadie puede leerla.</span>
          </li>
          <li>
            <app-icono nombre="log-out" />
            <span>Al cambiarla, cerramos las demás sesiones abiertas de tu cuenta.</span>
          </li>
          <li>
            <app-icono nombre="alert-triangle" />
            <span
              >Tras varios intentos fallidos, pausamos el inicio de sesión y el cambio de contraseña
              durante unos minutos.</span
            >
          </li>
          <li>
            <app-icono nombre="lock" />
            <span
              >¿Olvidaste tu contraseña? Cierra sesión y elige «¿Olvidaste tu contraseña?» al
              iniciar sesión.</span
            >
          </li>
        </ul>
      </section>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .seguridad-pagina {
      display: grid;
      gap: var(--e-6);
      max-width: 46rem;
    }

    .seguridad-pagina__cuenta {
      display: inline-flex;
      align-items: center;
      gap: var(--e-2);
      margin: 0;
      color: var(--c-texto-2);
      font-size: var(--t-14);
      overflow-wrap: anywhere;
      --icono-tamano: 1rem;
    }

    .seguridad-pagina__cuenta strong {
      color: var(--c-texto);
    }

    .tarjeta .seguridad-pagina__titulo {
      margin: 0 0 var(--e-3);
      font-size: var(--t-18);
    }

    .seguridad-pagina__lista {
      display: grid;
      gap: var(--e-3);
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--c-texto-2);
      font-size: var(--t-14);
      --icono-tamano: 1.125rem;
    }

    .seguridad-pagina__lista li {
      display: flex;
      align-items: flex-start;
      gap: var(--e-3);
    }

    .seguridad-pagina__lista app-icono {
      margin-top: 0.1em;
      color: var(--c-acento);
    }
  `,
})
export class PaginaSeguridadComponent {
  private readonly auth = inject(AuthService);

  /** Correo de la sesión: activa la regla «Distinta de tu correo». */
  protected readonly correo = computed(() => this.auth.usuario()?.email ?? null);
}
