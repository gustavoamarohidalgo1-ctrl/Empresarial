import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { ErrorService } from '../../../core/errores/error.service';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { CampoClaveComponent } from '../compartido/campo-clave/campo-clave';
import { MarcoAuthComponent } from '../compartido/marco-auth/marco-auth';
import { MedidorClaveComponent } from '../compartido/medidor-clave/medidor-clave';
import {
  MENSAJES_CONFIRMACION,
  clavesCoinciden,
  mensajeClave,
  validadorPoliticaClave,
} from '../compartido/politica-contrasena';

export const MENSAJE_CLAVE_RESTABLECIDA =
  'Tu contraseña se actualizó. Inicia sesión con tu nueva contraseña.';

/**
 * Restablecer contraseña desde el enlace del correo (`/restablecer?token=…`,
 * `POST /auth/restablecer`).
 * - El token se lee al abrir la página, se guarda SOLO en memoria y se quita de la URL
 *   (`replaceUrl`), para que no quede en la barra, en el historial ni en el `Referer`.
 * - Si el enlace no existe, venció o ya se usó (422 `ENLACE_INVALIDO`), se explica y se ofrece
 *   pedir otro.
 * - Al terminar (204) el servidor ya cerró todas las sesiones de la cuenta, también la de este
 *   navegador si la había: se limpia la sesión local y se va SIEMPRE a `/login` con el aviso de
 *   éxito (nunca a una pantalla con sesión, que acabaría en «sesión expirada»).
 */
@Component({
  selector: 'app-restablecer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AvisoComponent,
    CampoClaveComponent,
    IconoComponent,
    MarcoAuthComponent,
    MedidorClaveComponent,
  ],
  templateUrl: './restablecer.html',
  styleUrl: './restablecer.css',
})
export class RestablecerComponent implements OnInit {
  private readonly cuenta = inject(CuentaService);
  private readonly auth = inject(AuthService);
  private readonly errores = inject(ErrorService);
  private readonly router = inject(Router);
  private readonly ruta = inject(ActivatedRoute);
  private readonly flash = inject(AvisoFlashService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /**
   * Parámetro `?token=` (enlace del correo), enlazado por el router. Solo se lee al iniciar:
   * después la URL ya no lo lleva y el valor vive en `tokenEnMemoria`.
   */
  readonly token = input<string | undefined>();
  private readonly tokenEnMemoria = signal<string | null>(null);

  private readonly marco = viewChild.required(MarcoAuthComponent);
  private readonly campoClave = viewChild<CampoClaveComponent>('campoClave');
  private readonly campoConfirmacion = viewChild<CampoClaveComponent>('campoConfirmacion');
  private readonly avisoRef = viewChild<ElementRef<HTMLElement>>('avisoRef');

  readonly formulario = new FormGroup(
    {
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, validadorPoliticaClave(() => null)],
      }),
      confirmacion: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: clavesCoinciden('password', 'confirmacion') },
  );

  private readonly valor = toSignal(
    this.formulario.valueChanges.pipe(
      startWith(null),
      map(() => this.formulario.getRawValue()),
    ),
    { initialValue: this.formulario.getRawValue() },
  );

  protected readonly clave = computed(() => this.valor().password);
  protected readonly enviando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly errorServidorClave = signal<string | null>(null);
  protected readonly errorGeneral = signal<{ titulo: string; texto: string } | null>(null);
  private readonly rechazado = signal(false);
  /** Sin token o rechazado por el servidor: no se muestra el formulario. */
  protected readonly enlaceInvalido = computed(() => this.rechazado() || !this.tokenEnMemoria());

  ngOnInit(): void {
    const token = this.token()?.trim() || null;
    this.tokenEnMemoria.set(token);
    if (this.token() !== undefined) {
      // Misma página, sin parámetros, reemplazando la entrada del historial que tenía el token.
      void this.router.navigate([], { relativeTo: this.ruta, queryParams: {}, replaceUrl: true });
    }
  }

  protected errorClave(): string | null {
    if (this.errorServidorClave()) return this.errorServidorClave();
    const control = this.formulario.controls.password;
    if (!this.intentoEnviar() && !control.touched) return null;
    return control.invalid ? mensajeClave(this.clave()) : null;
  }

  protected errorConfirmacion(): string | null {
    const control = this.formulario.controls.confirmacion;
    if (!this.intentoEnviar() && !control.touched) return null;
    if (control.hasError('required')) return MENSAJES_CONFIRMACION.requerida;
    return this.formulario.hasError('clavesDistintas') ? MENSAJES_CONFIRMACION.distinta : null;
  }

  protected describirClave(): string {
    return this.errorClave()
      ? 'restablecer-clave-requisitos restablecer-password-error'
      : 'restablecer-clave-requisitos';
  }

  enviar(): void {
    const token = this.tokenEnMemoria();
    if (this.enviando() || !token) return;
    this.intentoEnviar.set(true);
    this.errorGeneral.set(null);
    this.errorServidorClave.set(null);

    if (this.formulario.invalid) {
      if (this.formulario.controls.password.invalid) this.campoClave()?.enfocar();
      else this.campoConfirmacion()?.enfocar();
      return;
    }

    this.enviando.set(true);
    this.campoClave()?.ocultar();
    this.campoConfirmacion()?.ocultar();
    this.cuenta
      .restablecer({ token, password: this.formulario.controls.password.value })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          // El servidor revocó todas las sesiones de la cuenta (también la de este navegador,
          // si la había): se limpia la local para no acabar en «sesión expirada».
          this.auth.limpiarSesion();
          this.flash.publicar({ tipo: 'exito', texto: MENSAJE_CLAVE_RESTABLECIDA });
          void this.router.navigateByUrl('/login');
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          const traducido = this.errores.traducir(error);
          if (traducido.codigo === 'ENLACE_INVALIDO') {
            this.rechazado.set(true);
            enfocarTrasRenderizar(this.inyector, () => {
              this.marco().enfocarTitulo();
              return null;
            });
            return;
          }
          const porCampo = this.errores.erroresPorCampo(traducido);
          const deCampo = porCampo['password'] ?? porCampo['nueva'];
          if (deCampo) {
            this.errorServidorClave.set(deCampo);
            enfocarTrasRenderizar(this.inyector, () => {
              this.campoClave()?.enfocar();
              return null;
            });
            return;
          }
          this.errorGeneral.set({
            titulo: 'No pudimos actualizar tu contraseña',
            texto: traducido.mensaje,
          });
          enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
        },
      });
  }
}
