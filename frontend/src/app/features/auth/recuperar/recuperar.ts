import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { ErrorService } from '../../../core/errores/error.service';
import { SistemaService } from '../../../core/sistema/sistema.service';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { MENSAJES_CONTACTO } from '../../../shared/validadores/contacto';
import { validadorCorreo } from '../compartido/datos-cuenta';
import { CorreoRecordadoService } from '../compartido/correo-recordado';
import { MarcoAuthComponent } from '../compartido/marco-auth/marco-auth';

/** Texto neutro: no revela si el correo tiene una cuenta (el servidor responde 202 siempre). */
export const MENSAJE_RECUPERACION_ENVIADA =
  'Si el correo está registrado, te enviamos un enlace para crear una contraseña nueva.';

/**
 * Recuperar contraseña (`POST /auth/recuperacion`). Tras enviar se muestra siempre la misma
 * confirmación, exista o no la cuenta. En el entorno de desarrollo (`/sistema/info`) se ofrece
 * un enlace discreto al buzón de correo simulado.
 */
@Component({
  selector: 'app-recuperar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AvisoComponent, IconoComponent, MarcoAuthComponent],
  templateUrl: './recuperar.html',
  styleUrl: './recuperar.css',
})
export class RecuperarComponent {
  private readonly cuenta = inject(CuentaService);
  private readonly errores = inject(ErrorService);
  private readonly sistema = inject(SistemaService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly marco = viewChild.required(MarcoAuthComponent);
  private readonly campoEmail = viewChild<ElementRef<HTMLInputElement>>('campoEmail');
  private readonly avisoRef = viewChild<ElementRef<HTMLElement>>('avisoRef');

  readonly email = new FormControl(inject(CorreoRecordadoService).consumir() ?? '', {
    nonNullable: true,
    validators: [validadorCorreo],
  });
  readonly formulario = new FormGroup({ email: this.email });

  protected readonly mensajeEnviada = MENSAJE_RECUPERACION_ENVIADA;
  protected readonly esDesarrollo = this.sistema.esDesarrollo;
  protected readonly enviando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly errorServidor = signal<string | null>(null);
  protected readonly errorGeneral = signal<{ titulo: string; texto: string } | null>(null);
  /** Correo al que se envió la solicitud (se muestra en la confirmación). */
  protected readonly enviadoA = signal<string | null>(null);

  constructor() {
    this.sistema.cargar();
  }

  protected errorEmail(): string | null {
    if (this.errorServidor()) return this.errorServidor();
    if (!this.intentoEnviar() && !this.email.touched) return null;
    if (this.email.hasError('required')) return MENSAJES_CONTACTO.emailRequerido;
    return this.email.invalid ? MENSAJES_CONTACTO.emailInvalido : null;
  }

  enviar(): void {
    if (this.enviando()) return;
    this.intentoEnviar.set(true);
    this.errorGeneral.set(null);
    this.errorServidor.set(null);
    if (this.email.invalid) {
      this.campoEmail()?.nativeElement.focus();
      return;
    }

    const correo = this.email.value.trim();
    this.enviando.set(true);
    this.cuenta
      .solicitarRecuperacion(correo)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.enviando.set(false);
          this.enviadoA.set(correo);
          enfocarTrasRenderizar(this.inyector, () => {
            this.marco().enfocarTitulo();
            return null;
          });
        },
        error: (error: unknown) => {
          this.enviando.set(false);
          const traducido = this.errores.traducir(error);
          const deCampo = this.errores.erroresPorCampo(traducido)['email'];
          if (deCampo) {
            this.errorServidor.set(deCampo);
            enfocarTrasRenderizar(this.inyector, () => this.campoEmail());
            return;
          }
          this.errorGeneral.set({
            titulo:
              traducido.codigo === 'DEMASIADOS_INTENTOS'
                ? 'Demasiadas solicitudes'
                : 'No pudimos enviar el enlace',
            texto: traducido.mensaje,
          });
          enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
        },
      });
  }

  /** «Usar otro correo»: vuelve al formulario y enfoca el campo. */
  otroCorreo(): void {
    this.enviadoA.set(null);
    this.intentoEnviar.set(false);
    this.email.markAsUntouched();
    enfocarTrasRenderizar(this.inyector, () => this.campoEmail());
  }
}
