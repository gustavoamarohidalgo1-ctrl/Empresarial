import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { CuentaService } from '../../../core/auth/cuenta.service';
import { ErrorService } from '../../../core/errores/error.service';
import { AnuncioService } from '../../../core/sistema/anuncio.service';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { MENSAJES_CONTACTO } from '../../../shared/validadores/contacto';
import { CampoClaveComponent } from '../compartido/campo-clave/campo-clave';
import { CorreoRecordadoService } from '../compartido/correo-recordado';
import {
  normalizarCorreo,
  normalizarNombre,
  normalizarTelefono,
  validadorCorreo,
  validadorNombre,
  validadorTelefono,
} from '../compartido/datos-cuenta';
import { VERSION_PRIVACIDAD } from '../../publico/privacidad/version';
import { MarcoAuthComponent, PanelAuth } from '../compartido/marco-auth/marco-auth';
import { MedidorClaveComponent } from '../compartido/medidor-clave/medidor-clave';
import {
  MENSAJES_CONFIRMACION,
  clavesCoinciden,
  mensajeClave,
  validadorPoliticaClave,
} from '../compartido/politica-contrasena';

type Campo =
  'nombres' | 'apellidos' | 'email' | 'telefono' | 'password' | 'confirmacion' | 'aceptaPrivacidad';

/** Orden de los campos en pantalla (para enfocar el primero con error). */
const ORDEN_CAMPOS: readonly Campo[] = [
  'nombres',
  'apellidos',
  'email',
  'telefono',
  'password',
  'confirmacion',
  'aceptaPrivacidad',
];

export const MENSAJES_REGISTRO = {
  nombresRequerido: 'Escribe tus nombres.',
  apellidosRequerido: 'Escribe tus apellidos.',
  nombreLongitud: 'Usa entre 2 y 80 caracteres.',
  nombreFormato: 'Usa solo letras, separadas por un espacio, un apóstrofo (’) o un guion (-).',
  privacidad: 'Para crear tu cuenta, acepta la Política de privacidad.',
  correoRegistrado: 'Ya existe una cuenta con este correo.',
} as const;

export const PANEL_REGISTRO: PanelAuth = {
  titulo: 'Tus citas ambulatorias, en un solo lugar',
  puntos: [
    {
      icono: 'calendar-plus',
      titulo: 'Reserva en minutos',
      texto: 'Elige especialidad, profesional, sede y el horario que te acomode.',
    },
    {
      icono: 'bell',
      titulo: 'Recordatorios a tiempo',
      texto: 'Te avisamos antes de tu cita y cada vez que algo cambia.',
    },
    {
      icono: 'clipboard-check',
      titulo: 'Llega con todo listo',
      texto: 'Haz tu pre-check-in y consulta cuándo presentarte en la sede.',
    },
  ],
  nota: 'Tratamos tus datos conforme a la Ley N.º 29733, Ley de Protección de Datos Personales.',
};

type AvisoRegistro =
  { tipo: 'correo-registrado' } | { tipo: 'error'; titulo: string; texto: string };

/**
 * Crear cuenta (rol PACIENTE, `POST /auth/registro`). Validación en línea al salir de cada
 * campo, medidor de seguridad de la contraseña, consentimiento expreso (Ley N.º 29733) y los
 * errores del servidor (`errores[]`) junto a cada campo. Al crearse, la sesión queda iniciada
 * y se va a «Mis citas» con un aviso de bienvenida.
 */
@Component({
  selector: 'app-registro',
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
  templateUrl: './registro.html',
  styleUrl: './registro.css',
})
export class RegistroComponent {
  private readonly cuenta = inject(CuentaService);
  private readonly errores = inject(ErrorService);
  private readonly router = inject(Router);
  private readonly anuncios = inject(AnuncioService);
  private readonly correoRecordado = inject(CorreoRecordadoService);
  private readonly inyector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);

  private readonly campoNombres = viewChild<ElementRef<HTMLInputElement>>('campoNombres');
  private readonly campoApellidos = viewChild<ElementRef<HTMLInputElement>>('campoApellidos');
  private readonly campoEmail = viewChild<ElementRef<HTMLInputElement>>('campoEmail');
  private readonly campoTelefono = viewChild<ElementRef<HTMLInputElement>>('campoTelefono');
  private readonly campoClave = viewChild<CampoClaveComponent>('campoClave');
  private readonly campoConfirmacion = viewChild<CampoClaveComponent>('campoConfirmacion');
  private readonly campoPrivacidad = viewChild<ElementRef<HTMLInputElement>>('campoPrivacidad');
  private readonly avisoRef = viewChild<ElementRef<HTMLElement>>('avisoRef');

  /** Se declara aparte: la regla «distinta del correo» de la contraseña lo lee. */
  private readonly controlEmail = new FormControl('', {
    nonNullable: true,
    validators: [validadorCorreo],
  });

  readonly formulario = new FormGroup(
    {
      nombres: new FormControl('', { nonNullable: true, validators: [validadorNombre] }),
      apellidos: new FormControl('', { nonNullable: true, validators: [validadorNombre] }),
      email: this.controlEmail,
      telefono: new FormControl('', { nonNullable: true, validators: [validadorTelefono] }),
      password: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required, validadorPoliticaClave(() => this.controlEmail.value)],
      }),
      confirmacion: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      aceptaPrivacidad: new FormControl(false, {
        nonNullable: true,
        validators: [Validators.requiredTrue],
      }),
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

  protected readonly panel = PANEL_REGISTRO;
  /** Versión de la política que se acepta (el servidor la guarda al crear la cuenta). */
  protected readonly versionPrivacidad = VERSION_PRIVACIDAD.numero;
  protected readonly clave = computed(() => this.valor().password);
  protected readonly correo = computed(() => this.valor().email);
  protected readonly enviando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly erroresServidor = signal<Partial<Record<Campo, string>>>({});
  /** Errores del servidor de campos que no están en el formulario. */
  protected readonly erroresGenerales = signal<string[]>([]);
  protected readonly aviso = signal<AvisoRegistro | null>(null);

  constructor() {
    // La regla «distinta del correo» depende del correo: se revalida si este cambia.
    this.formulario.controls.email.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.formulario.controls.password.updateValueAndValidity({ emitEvent: false }),
      );
  }

  /** Se muestra el error del campo si ya se salió de él, si se intentó enviar o si vino del servidor. */
  protected errorDe(campo: Campo): string | null {
    const servidor = this.erroresServidor()[campo];
    if (servidor) return servidor;
    const control = this.formulario.controls[campo];
    if (!this.intentoEnviar() && !control.touched) return null;

    switch (campo) {
      case 'nombres':
      case 'apellidos': {
        const e = control.errors;
        if (!e) return null;
        if (e['requerido']) {
          return campo === 'nombres'
            ? MENSAJES_REGISTRO.nombresRequerido
            : MENSAJES_REGISTRO.apellidosRequerido;
        }
        return e['longitud'] ? MENSAJES_REGISTRO.nombreLongitud : MENSAJES_REGISTRO.nombreFormato;
      }
      case 'email':
        if (control.hasError('required')) return MENSAJES_CONTACTO.emailRequerido;
        return control.invalid ? MENSAJES_CONTACTO.emailInvalido : null;
      case 'telefono':
        if (control.hasError('required')) return MENSAJES_CONTACTO.telefonoRequerido;
        return control.invalid ? MENSAJES_CONTACTO.telefonoInvalido : null;
      case 'password':
        return control.invalid ? mensajeClave(this.clave(), this.correo()) : null;
      case 'confirmacion':
        if (control.hasError('required')) return MENSAJES_CONFIRMACION.requerida;
        return this.formulario.hasError('clavesDistintas') ? MENSAJES_CONFIRMACION.distinta : null;
      case 'aceptaPrivacidad':
        return this.intentoEnviar() && control.invalid ? MENSAJES_REGISTRO.privacidad : null;
    }
  }

  /** `aria-describedby`: ayuda (si la hay) y error (si lo hay). */
  protected describir(campo: Campo, ...extra: string[]): string | null {
    const ids = [...extra];
    if (this.errorDe(campo)) ids.push(`registro-${campo}-error`);
    return ids.length ? ids.join(' ') : null;
  }

  protected limpiarErrorServidor(campo: Campo): void {
    const actuales = this.erroresServidor();
    if (actuales[campo]) {
      const copia = { ...actuales };
      delete copia[campo];
      this.erroresServidor.set(copia);
    }
  }

  protected recordarCorreo(): void {
    this.correoRecordado.recordar(this.formulario.controls.email.value);
  }

  enviar(): void {
    if (this.enviando()) return;
    this.intentoEnviar.set(true);
    this.aviso.set(null);
    this.erroresGenerales.set([]);

    if (this.formulario.invalid) {
      this.enfocarPrimerError();
      return;
    }

    this.enviando.set(true);
    this.erroresServidor.set({});
    this.campoClave()?.ocultar();
    this.campoConfirmacion()?.ocultar();
    const v = this.formulario.getRawValue();
    this.cuenta
      .registrar({
        nombres: normalizarNombre(v.nombres),
        apellidos: normalizarNombre(v.apellidos),
        email: normalizarCorreo(v.email),
        telefono: normalizarTelefono(v.telefono),
        password: v.password,
        aceptaPrivacidad: v.aceptaPrivacidad,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (usuario) => {
          this.enviando.set(false);
          const nombre = v.nombres.trim().split(/\s+/)[0] || usuario.nombre;
          this.anuncios.publicar({
            tipo: 'exito',
            titulo: `Te damos la bienvenida, ${nombre}`,
            texto: 'Tu cuenta está lista. Ya puedes reservar tu primera cita.',
            accion: { texto: 'Reservar una cita', ruta: '/paciente/reservar' },
          });
          void this.router.navigateByUrl('/paciente/citas');
        },
        error: (error: unknown) => this.alFallar(error),
      });
  }

  private alFallar(error: unknown): void {
    this.enviando.set(false);
    const traducido = this.errores.traducir(error);

    if (traducido.codigo === 'CORREO_REGISTRADO') {
      this.erroresServidor.set({ email: MENSAJES_REGISTRO.correoRegistrado });
      this.recordarCorreo();
      this.aviso.set({ tipo: 'correo-registrado' });
      enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
      return;
    }

    if (traducido.status === 400 && traducido.errores.length) {
      const porCampo = this.errores.erroresPorCampo(traducido);
      const enFormulario: Partial<Record<Campo, string>> = {};
      const generales: string[] = [];
      for (const [campo, mensaje] of Object.entries(porCampo)) {
        if ((ORDEN_CAMPOS as readonly string[]).includes(campo)) {
          enFormulario[campo as Campo] = mensaje;
        } else {
          generales.push(mensaje);
        }
      }
      this.erroresServidor.set(enFormulario);
      this.erroresGenerales.set(generales);
      this.aviso.set({
        tipo: 'error',
        titulo: 'Revisa los datos marcados',
        texto: 'Algunos datos no cumplen los requisitos. Corrígelos y vuelve a intentarlo.',
      });
      const primero = ORDEN_CAMPOS.find((c) => enFormulario[c]);
      if (primero) enfocarTrasRenderizar(this.inyector, () => this.enfocar(primero));
      else enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
      return;
    }

    this.aviso.set({
      tipo: 'error',
      titulo:
        traducido.codigo === 'DEMASIADOS_INTENTOS'
          ? 'Demasiados intentos'
          : 'No pudimos crear tu cuenta',
      texto: traducido.mensaje,
    });
    enfocarTrasRenderizar(this.inyector, () => this.avisoRef());
  }

  private enfocarPrimerError(): void {
    const primero = ORDEN_CAMPOS.find((campo) =>
      campo === 'confirmacion'
        ? this.formulario.controls.confirmacion.invalid ||
          this.formulario.hasError('clavesDistintas')
        : this.formulario.controls[campo].invalid,
    );
    if (primero) this.enfocar(primero);
  }

  /** Enfoca un campo y devuelve `null` (sirve como destino de `enfocarTrasRenderizar`). */
  private enfocar(campo: Campo): null {
    switch (campo) {
      case 'nombres':
        this.campoNombres()?.nativeElement.focus();
        break;
      case 'apellidos':
        this.campoApellidos()?.nativeElement.focus();
        break;
      case 'email':
        this.campoEmail()?.nativeElement.focus();
        break;
      case 'telefono':
        this.campoTelefono()?.nativeElement.focus();
        break;
      case 'password':
        this.campoClave()?.enfocar();
        break;
      case 'confirmacion':
        this.campoConfirmacion()?.enfocar();
        break;
      case 'aceptaPrivacidad':
        this.campoPrivacidad()?.nativeElement.focus();
        break;
    }
    return null;
  }
}
