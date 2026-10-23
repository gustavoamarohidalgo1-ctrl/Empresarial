import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { rutaInicioPorRol } from '../../../core/auth/roles';
import { AvisoFlash, AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { ErrorService } from '../../../core/errores/error.service';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { NombreIcono } from '../../../shared/ui/icono/iconos';
import { MarcaComponent } from '../../../shared/ui/marca/marca';
import { CorreoRecordadoService } from '../compartido/correo-recordado';

/** Mensaje genérico a propósito: no revela si el correo existe ni si la cuenta está bloqueada. */
export const MENSAJE_LOGIN_FALLIDO =
  'No pudimos iniciar sesión. Revisa tu correo y tu contraseña e inténtalo de nuevo.';

/** Beneficios del panel de marca (solo en pantallas anchas). */
export const BENEFICIOS_LOGIN: readonly { icono: NombreIcono; titulo: string; texto: string }[] = [
  {
    icono: 'calendar-check',
    titulo: 'Tus citas al día',
    texto: 'Confirma, reprograma o cancela en pocos pasos.',
  },
  {
    icono: 'clipboard-check',
    titulo: 'Llega con todo listo',
    texto: 'Haz tu pre-check-in y revisa cuándo presentarte.',
  },
  {
    icono: 'bell',
    titulo: 'Avisos oportunos',
    texto: 'Recordatorios antes de tu cita y aviso de cada cambio.',
  },
];

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AvisoComponent, IconoComponent, MarcaComponent],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly errores = inject(ErrorService);

  private readonly campoEmail = viewChild<ElementRef<HTMLInputElement>>('campoEmail');
  private readonly campoPassword = viewChild<ElementRef<HTMLInputElement>>('campoPassword');

  private readonly correoRecordado = inject(CorreoRecordadoService);

  readonly formulario = new FormGroup({
    email: new FormControl(this.correoRecordado.consumir() ?? '', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  protected readonly enviando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly errorLogin = signal<string | null>(null);
  /** La contraseña se ve en claro (botón «Mostrar»). Vuelve a ocultarse al enviar. */
  protected readonly mostrarClave = signal(false);
  /** Bloq Mayús activado mientras se escribe la contraseña. */
  protected readonly mayusculas = signal(false);
  protected readonly beneficios = BENEFICIOS_LOGIN;
  private readonly parametros = toSignal(inject(ActivatedRoute).queryParamMap, {
    initialValue: null,
  });
  protected readonly sesionExpirada = computed(
    () => this.parametros()?.get('sesion') === 'expirada',
  );
  /** Llega desde «Crear cuenta» porque el correo ya tenía una cuenta. */
  protected readonly desdeRegistro = computed(() => this.parametros()?.get('desde') === 'registro');
  /** Aviso que dejó otra pantalla (p. ej. «Tu contraseña se actualizó» al restablecerla). */
  protected readonly avisoPrevio = signal<AvisoFlash | null>(inject(AvisoFlashService).consumir());

  protected mostrarError(campo: 'email' | 'password'): boolean {
    return this.intentoEnviar() && this.formulario.controls[campo].invalid;
  }

  /** `aria-describedby` de la contraseña: aviso de Bloq Mayús y error, si los hay. */
  protected describirClave(): string | null {
    const ids = [
      this.mayusculas() ? 'login-password-mayus' : null,
      this.mostrarError('password') ? 'login-password-error' : null,
    ].filter((id): id is string => id !== null);
    return ids.length ? ids.join(' ') : null;
  }

  protected alternarClave(): void {
    this.mostrarClave.update((v) => !v);
  }

  protected revisarMayusculas(evento: KeyboardEvent): void {
    // `getModifierState` puede faltar en eventos sintéticos de algunos teclados virtuales.
    this.mayusculas.set(evento.getModifierState?.('CapsLock') ?? false);
  }

  enviar(): void {
    if (this.enviando()) return;
    this.intentoEnviar.set(true);
    this.errorLogin.set(null);

    if (this.formulario.invalid) {
      const primero = this.formulario.controls.email.invalid
        ? this.campoEmail()
        : this.campoPassword();
      primero?.nativeElement.focus();
      return;
    }

    this.enviando.set(true);
    this.avisoPrevio.set(null);
    this.mostrarClave.set(false);
    const { email, password } = this.formulario.getRawValue();
    this.auth.login({ email: email.trim(), password }).subscribe({
      next: (usuario) => {
        this.enviando.set(false);
        void this.router.navigateByUrl(rutaInicioPorRol(usuario.rol));
      },
      error: (error: unknown) => {
        this.enviando.set(false);
        const traducido = this.errores.traducir(error);
        this.errorLogin.set(
          traducido.status === 401 || traducido.status === 400
            ? MENSAJE_LOGIN_FALLIDO
            : traducido.mensaje,
        );
        this.formulario.controls.password.reset();
        this.intentoEnviar.set(false);
      },
    });
  }
}
