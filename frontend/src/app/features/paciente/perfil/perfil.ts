import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription, map, startWith } from 'rxjs';
import { CacheService } from '../../../core/cache/cache.service';
import { ErrorService } from '../../../core/errores/error.service';
import { ActualizacionPerfil, PerfilPaciente } from '../../../core/modelos/contrato';
import { AvisoComponent } from '../../../shared/ui/aviso/aviso';
import { EncabezadoPaginaComponent } from '../../../shared/ui/encabezado-pagina/encabezado-pagina';
import { EsqueletoComponent } from '../../../shared/ui/esqueleto/esqueleto';
import { EstadoVacioComponent } from '../../../shared/ui/estado-vacio/estado-vacio';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { enfocarTrasRenderizar } from '../../../shared/utils/foco';
import { MENSAJES_CONTACTO } from '../../../shared/validadores/contacto';
import {
  normalizarCorreo,
  normalizarTelefono,
  validadorCorreo,
  validadorTelefono,
} from '../../auth/compartido/datos-cuenta';
import { CLAVE_PERFIL } from '../compartido/cita-cache';
import { PacienteApiService } from '../data/paciente-api.service';

type CampoContacto = 'email' | 'telefono';

/** Iniciales para el avatar: primera letra del primer nombre y del primer apellido («AD»). */
export function inicialesPerfil(perfil: Pick<PerfilPaciente, 'nombres' | 'apellidos'>): string {
  const letras = [perfil.nombres, perfil.apellidos]
    .map((parte) => parte?.trim().charAt(0) ?? '')
    .join('');
  return letras ? letras.toLocaleUpperCase('es-PE') : '?';
}

/**
 * Perfil del paciente: tarjeta con avatar de iniciales, datos personales (solo lectura) y
 * datos de contacto con edición en línea (correo y teléfono, con las mismas reglas que el
 * servidor). La contraseña se cambia en «Seguridad de la cuenta» (`/cuenta/seguridad`, común a
 * todos los roles), a la que se enlaza desde aquí.
 * Si el guardado falla, los datos registrados NO cambian (se conserva el valor anterior)
 * y los errores del servidor (`errores[]`) se muestran junto a cada campo.
 */
@Component({
  selector: 'app-perfil',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    AvisoComponent,
    EncabezadoPaginaComponent,
    EsqueletoComponent,
    EstadoVacioComponent,
    IconoComponent,
  ],
  templateUrl: './perfil.html',
  styleUrl: './perfil.css',
})
export class PerfilComponent implements OnInit {
  private readonly api = inject(PacienteApiService);
  private readonly cache = inject(CacheService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly inyector = inject(Injector);
  private readonly errores = inject(ErrorService);
  private readonly campoEmail = viewChild<ElementRef<HTMLInputElement>>('campoEmail');
  private readonly campoTelefono = viewChild<ElementRef<HTMLInputElement>>('campoTelefono');
  private readonly botonEditar = viewChild<ElementRef<HTMLButtonElement>>('botonEditar');
  private readonly avisoResultado = viewChild<ElementRef<HTMLElement>>('avisoResultado');

  protected readonly perfil = signal<PerfilPaciente | null>(null);
  protected readonly estadoCarga = signal<'cargando' | 'listo' | 'error'>('cargando');
  protected readonly errorCarga = signal('');
  /** La revalidación falló: se muestra lo último que cargamos. */
  protected readonly desactualizado = signal(false);

  readonly formulario = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [validadorCorreo] }),
    telefono: new FormControl('', { nonNullable: true, validators: [validadorTelefono] }),
  });
  private readonly valor = toSignal(
    this.formulario.valueChanges.pipe(
      startWith(null),
      map(() => this.formulario.getRawValue()),
    ),
    { initialValue: this.formulario.getRawValue() },
  );

  /** Edición en línea de los datos de contacto. */
  protected readonly editando = signal(false);
  protected readonly intentoEnviar = signal(false);
  protected readonly guardando = signal(false);
  protected readonly erroresServidor = signal<Record<string, string>>({});
  protected readonly resultado = signal<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  protected readonly iniciales = computed(() => {
    const p = this.perfil();
    return p ? inicialesPerfil(p) : '';
  });

  /** Solo se envían los campos que cambiaron respecto de los datos registrados. */
  protected readonly cambios = computed<ActualizacionPerfil>(() => {
    const actual = this.perfil();
    const { email, telefono } = this.valor();
    const cambios: ActualizacionPerfil = {};
    const correo = normalizarCorreo(email);
    const fono = normalizarTelefono(telefono);
    if (actual && correo !== actual.email) cambios.email = correo;
    if (actual && fono !== actual.telefono) cambios.telefono = fono;
    return cambios;
  });
  protected readonly hayCambios = computed(() => Object.keys(this.cambios()).length > 0);

  private carga?: Subscription;

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    // Esqueleto solo si no hay nada guardado; si lo hay, se pinta al instante y se revalida.
    if (!this.cache.leer(CLAVE_PERFIL)) this.estadoCarga.set('cargando');
    this.desactualizado.set(false);
    this.carga?.unsubscribe();
    this.carga = this.cache
      .swr(CLAVE_PERFIL, () => this.api.obtenerPerfil())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ datos, error }) => {
          if (error !== undefined) this.desactualizado.set(true);
          this.perfil.set(datos);
          // Una revalidación no pisa lo que la persona está escribiendo.
          if (!this.editando() || this.formulario.pristine) this.restablecer(datos);
          this.estadoCarga.set('listo');
        },
        error: (error: unknown) => {
          this.errorCarga.set(this.errores.traducir(error).mensaje);
          this.estadoCarga.set('error');
        },
      });
  }

  protected errorDe(campo: CampoContacto): string | null {
    const servidor = this.erroresServidor()[campo];
    if (servidor) return servidor;
    if (!this.intentoEnviar()) return null;
    const control = this.formulario.controls[campo];
    if (control.hasError('required')) {
      return campo === 'email'
        ? MENSAJES_CONTACTO.emailRequerido
        : MENSAJES_CONTACTO.telefonoRequerido;
    }
    if (control.invalid) {
      return campo === 'email'
        ? MENSAJES_CONTACTO.emailInvalido
        : MENSAJES_CONTACTO.telefonoInvalido;
    }
    return null;
  }

  /** `aria-describedby` del campo: su ayuda y, si hay, su error. */
  protected describir(campo: CampoContacto): string {
    const base = `perfil-${campo}`;
    return this.errorDe(campo) ? `${base}-ayuda ${base}-error` : `${base}-ayuda`;
  }

  limpiarErrorServidor(campo: CampoContacto): void {
    const actuales = this.erroresServidor();
    if (actuales[campo]) {
      const copia = { ...actuales };
      delete copia[campo];
      this.erroresServidor.set(copia);
    }
  }

  editar(): void {
    const actual = this.perfil();
    if (!actual) return;
    this.restablecer(actual);
    this.resultado.set(null);
    this.editando.set(true);
    enfocarTrasRenderizar(this.inyector, () => this.campoEmail());
  }

  guardar(): void {
    if (this.guardando() || !this.hayCambios()) return;
    this.intentoEnviar.set(true);
    this.resultado.set(null);
    if (this.formulario.invalid) {
      const primero = this.formulario.controls.email.invalid
        ? this.campoEmail()
        : this.campoTelefono();
      primero?.nativeElement.focus();
      return;
    }

    this.guardando.set(true);
    this.erroresServidor.set({});
    this.api
      .actualizarPerfil(this.cambios())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (perfil) => {
          this.guardando.set(false);
          this.perfil.set(perfil);
          this.cache.guardar(CLAVE_PERFIL, perfil);
          this.restablecer(perfil);
          this.editando.set(false);
          this.resultado.set({ tipo: 'exito', texto: 'Tus datos de contacto se guardaron.' });
          // El formulario desaparece: el foco va al aviso de resultado.
          enfocarTrasRenderizar(this.inyector, () => this.avisoResultado());
        },
        error: (error: unknown) => {
          this.guardando.set(false);
          const traducido = this.errores.traducir(error);
          const porCampo = this.errores.erroresPorCampo(traducido);
          this.erroresServidor.set(porCampo);
          // `perfil` no se toca: los datos registrados siguen siendo los anteriores.
          this.resultado.set({
            tipo: 'error',
            texto: `${traducido.mensaje} No se guardaron los cambios: se conservan tus datos anteriores.`,
          });
          enfocarTrasRenderizar(this.inyector, () =>
            porCampo['email']
              ? this.campoEmail()
              : porCampo['telefono']
                ? this.campoTelefono()
                : this.avisoResultado(),
          );
        },
      });
  }

  /** Cancela la edición: vuelve a los datos registrados y devuelve el foco a «Editar». */
  descartar(): void {
    const actual = this.perfil();
    if (!actual || this.guardando()) return;
    this.restablecer(actual);
    this.resultado.set(null);
    this.editando.set(false);
    enfocarTrasRenderizar(this.inyector, () => this.botonEditar());
  }

  private restablecer(perfil: PerfilPaciente): void {
    this.formulario.reset({ email: perfil.email ?? '', telefono: perfil.telefono ?? '' });
    this.erroresServidor.set({});
    this.intentoEnviar.set(false);
  }
}
