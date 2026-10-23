import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { map, startWith } from 'rxjs';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { TipoAviso } from '../../../core/avisos/aviso-flash.service';
import { ErrorService } from '../../../core/errores/error.service';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { CampoClaveComponent } from '../../auth/compartido/campo-clave/campo-clave';
import { MedidorClaveComponent } from '../../auth/compartido/medidor-clave/medidor-clave';
import {
  MENSAJES_CONFIRMACION,
  clavesCoinciden,
  mensajeClave,
  validadorPoliticaClave,
} from '../../auth/compartido/politica-contrasena';

type CampoClave = 'actual' | 'nueva' | 'confirmacion';

interface Resultado {
  tipo: TipoAviso;
  titulo: string;
  texto: string;
}

export const MENSAJES_SEGURIDAD = {
  actualRequerida: 'Escribe tu contraseña actual.',
  actualIncorrecta: 'La contraseña actual no es correcta.',
  exito:
    'Tu contraseña se actualizó y cerramos las demás sesiones abiertas de tu cuenta. Esta sigue activa.',
  bloqueo: 'Por tu seguridad, pausamos el cambio de contraseña tras varios intentos fallidos.',
} as const;

/**
 * Cambio de contraseña de la cuenta (`POST /cuenta/contrasena`, cualquier rol) con la actual, la
 * nueva (medidor de seguridad) y su confirmación. Se usa en «Seguridad de la cuenta».
 * - 422 `CONTRASENA_INCORRECTA`: junto a «Contraseña actual».
 * - 400 `VALIDACION` (`errores[]` en `nueva`): junto a la nueva.
 * - 429 `DEMASIADOS_INTENTOS` (bloqueo tras varios intentos fallidos): aviso con el tiempo de
 *   espera que indica el servidor; se cierra el formulario sin dejar contraseñas escritas.
 * Al terminar se cierra el formulario y el foco va al aviso de resultado.
 */
@Component({
  selector: 'app-seguridad-cuenta',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    AvisoComponent,
    CampoClaveComponent,
    IconoComponent,
    MedidorClaveComponent,
  ],
  templateUrl: './seguridad-cuenta.html',
  styleUrl: './seguridad-cuenta.css',
})
export class SeguridadCuentaComponent {
  private readonly cuenta = inject(CuentaService);
  private readonly errores = inject(ErrorService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  /** Correo de la cuenta: activa la regla «Distinta de tu correo». */
  readonly correo = input<string | null>(null);

  private readonly botonCambiar = viewChild<ElementRef<HTMLButtonElement>>('botonCambiar');
  private readonly campoActual = viewChild<CampoClaveComponent>('campoActual');
  private readonly campoNueva = viewChild<CampoClaveComponent>('campoNueva');
  private readonly campoConfirmacion = viewChild<CampoClaveComponent>('campoConfirmacion');
  private readonly avisoRef = viewChild<ElementRef<HTMLElement>>('avisoRef');

  readonly formulario = new FormGroup(
    {
      actual: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      nueva: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, validadorPoliticaClave(() => this.correo())],
      }),
      confirmacion: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    },
    { validators: clavesCoinciden('nueva', 'confirmacion') },
  );

  private readonly valor = toSignal(
    this.formulario.valueChanges.pipe(
      startWith(null),
      map(() => this.formulario.getRawValue()),
    ),
    { initialValue: this.formulario.getRawValue() },
  );

  protected readonly nueva = computed(() => this.valor().nueva);
  protected readonly abierto = signal(false);
  protected readonly guardando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly erroresServidor = signal<Partial<Record<CampoClave, string>>>({});
  protected readonly resultado = signal<Resultado | null>(null);

  protected errorDe(campo: CampoClave): string | null {
    const servidor = this.erroresServidor()[campo];
    if (servidor) return servidor;
    const control = this.formulario.controls[campo];
    if (!this.intentoEnviar() && !control.touched) return null;
    switch (campo) {
      case 'actual':
        return control.invalid ? MENSAJES_SEGURIDAD.actualRequerida : null;
      case 'nueva':
        return control.invalid ? mensajeClave(this.nueva(), this.correo()) : null;
      case 'confirmacion':
        if (control.hasError('required')) return MENSAJES_CONFIRMACION.requerida;
        return this.formulario.hasError('clavesDistintas') ? MENSAJES_CONFIRMACION.distinta : null;
    }
  }

  protected describir(campo: CampoClave, ...extra: string[]): string | null {
    const ids = [...extra];
    if (this.errorDe(campo)) ids.push(`seguridad-${campo}-error`);
    return ids.length ? ids.join(' ') : null;
  }

  protected limpiarErrorServidor(campo: CampoClave): void {
    const actuales = this.erroresServidor();
    if (actuales[campo]) {
      const copia = { ...actuales };
      delete copia[campo];
      this.erroresServidor.set(copia);
    }
  }

  abrir(): void {
    this.reiniciar();
    this.resultado.set(null);
    this.abierto.set(true);
    enfocarTrasRenderizar(this.inyector, () => {
      this.campoActual()?.enfocar();
      return null;
    });
  }

  cancelar(): void {
    if (this.guardando()) return;
    this.reiniciar();
    this.abierto.set(false);
    enfocarTrasRenderizar(this.inyector, () => this.botonCambiar());
  }

  guardar(): void {
    if (this.guardando()) return;
    this.intentoEnviar.set(true);
    this.resultado.set(null);
    if (this.formulario.invalid) {
      const c = this.formulario.controls;
      if (c.actual.invalid) this.campoActual()?.enfocar();
      else if (c.nueva.invalid) this.campoNueva()?.enfocar();
      else this.campoConfirmacion()?.enfocar();
      return;
    }

    this.guardando.set(true);
    this.erroresServidor.set({});
    this.campoActual()?.ocultar();
    this.campoNueva()?.ocultar();
    this.campoConfirmacion()?.ocultar();
    const { actual, nueva } = this.formulario.getRawValue();
    this.cuenta
      .cambiarContrasena({ actual, nueva })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.guardando.set(false);
          this.reiniciar();
          this.abierto.set(false);
          this.resultado.set({
            tipo: 'exito',
            titulo: 'Contraseña actualizada',
            texto: MENSAJES_SEGURIDAD.exito,
          });
          enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          const traducido = this.errores.traducir(error);
          if (traducido.status === 429) {
            // Bloqueo temporal: se cierra el formulario (no queda ninguna contraseña escrita) y
            // el aviso dice cuánto esperar; «Cambiar contraseña» sigue disponible para después.
            this.reiniciar();
            this.abierto.set(false);
            this.resultado.set({
              tipo: 'advertencia',
              titulo: 'Demasiados intentos',
              texto: `${MENSAJES_SEGURIDAD.bloqueo} ${traducido.mensaje} Tu contraseña no cambió.`,
            });
            enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
            return;
          }
          if (traducido.codigo === 'CONTRASENA_INCORRECTA') {
            this.erroresServidor.set({ actual: MENSAJES_SEGURIDAD.actualIncorrecta });
            this.formulario.controls.actual.reset();
            enfocarTrasRenderizar(this.inyector, () => {
              this.campoActual()?.enfocar();
              return null;
            });
            return;
          }
          const porCampo = this.errores.erroresPorCampo(traducido);
          const enFormulario: Partial<Record<CampoClave, string>> = {};
          if (porCampo['actual']) enFormulario.actual = porCampo['actual'];
          if (porCampo['nueva'] ?? porCampo['password']) {
            enFormulario.nueva = porCampo['nueva'] ?? porCampo['password'];
          }
          if (enFormulario.actual || enFormulario.nueva) {
            this.erroresServidor.set(enFormulario);
            enfocarTrasRenderizar(this.inyector, () => {
              if (enFormulario.actual) this.campoActual()?.enfocar();
              else this.campoNueva()?.enfocar();
              return null;
            });
            return;
          }
          this.resultado.set({
            tipo: 'error',
            titulo: 'No se cambió la contraseña',
            texto: `${traducido.mensaje} Tu contraseña no cambió.`,
          });
          enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
        },
      });
  }

  private reiniciar(): void {
    this.formulario.reset();
    this.erroresServidor.set({});
    this.intentoEnviar.set(false);
  }
}
