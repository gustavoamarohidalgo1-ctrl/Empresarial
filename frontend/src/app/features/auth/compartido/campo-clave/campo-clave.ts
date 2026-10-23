import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IconoComponent } from '../../../../shared/ui/icono/icono';

/**
 * Campo de contraseña con «Mostrar/Ocultar» y aviso de Bloq Mayús. Se usa con Reactive Forms
 * (`formControlName`). La etiqueta va fuera: `<label [for]="idCampo">`.
 *
 * - El botón es `type="button"`, controla el campo (`aria-controls`) y su nombre accesible
 *   incluye qué muestra («Mostrar nueva contraseña»).
 * - El aviso de Bloq Mayús está en una región viva y se añade al `aria-describedby` del campo
 *   junto con lo que indique el formulario (`describedby`).
 * - `ocultar()` vuelve a ocultar el texto (al enviar) y `enfocar()` lleva el foco al campo.
 */
@Component({
  selector: 'app-campo-clave',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CampoClaveComponent),
      multi: true,
    },
  ],
  template: `
    <div class="clave">
      <input
        #entrada
        class="control"
        [id]="idCampo()"
        [attr.type]="visible() ? 'text' : 'password'"
        [attr.autocomplete]="autocompletar()"
        [attr.aria-invalid]="invalido()"
        [attr.aria-describedby]="descripcion()"
        aria-required="true"
        spellcheck="false"
        autocapitalize="none"
        [attr.enterkeyhint]="teclaEnter()"
        [value]="valor()"
        [disabled]="deshabilitado()"
        (input)="alEscribir($event)"
        (blur)="alSalir()"
        (keydown)="revisarMayusculas($event)"
        (keyup)="revisarMayusculas($event)"
      />
      <button
        type="button"
        class="btn btn--fantasma btn--sm clave__ver"
        [attr.aria-controls]="idCampo()"
        [disabled]="deshabilitado()"
        (click)="alternar()"
      >
        <app-icono [nombre]="visible() ? 'eye-off' : 'eye'" />
        {{ visible() ? 'Ocultar' : 'Mostrar' }}<span class="solo-lectores"> {{ nombre() }}</span>
      </button>
    </div>
    <div class="clave__vivo" aria-live="polite">
      @if (mayusculas()) {
        <p [id]="idCampo() + '-mayus'" class="ayuda clave__mayus">
          <app-icono nombre="alert-triangle" /> Bloq Mayús está activado.
        </p>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .clave {
      position: relative;
    }

    .clave .control {
      padding-inline-end: 7.25rem;
    }

    .clave__ver {
      --btn-texto: var(--c-enlace);
      --icono-tamano: 1rem;
      position: absolute;
      top: 0.25rem;
      right: 0.25rem;
      bottom: 0.25rem;
      min-height: 0;
      padding-inline: var(--e-3);
    }

    .clave__mayus {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      margin-top: var(--e-2);
      color: var(--c-advertencia);
      font-weight: 600;
      --icono-tamano: 1rem;
    }
  `,
})
export class CampoClaveComponent implements ControlValueAccessor {
  readonly idCampo = input.required<string>();
  /** `current-password` o `new-password` (gestores de contraseñas). */
  readonly autocompletar = input<'current-password' | 'new-password'>('new-password');
  /** Qué contraseña es, para el nombre accesible del botón: «Mostrar <nombre>». */
  readonly nombre = input('contraseña');
  readonly invalido = input(false);
  /** Ids que describen el campo (ayuda, requisitos, error). */
  readonly describedby = input<string | null>(null);
  readonly teclaEnter = input<'next' | 'go' | 'done'>('next');

  private readonly entrada = viewChild.required<ElementRef<HTMLInputElement>>('entrada');

  protected readonly valor = signal('');
  protected readonly visible = signal(false);
  protected readonly mayusculas = signal(false);
  protected readonly deshabilitado = signal(false);

  protected readonly descripcion = computed(() => {
    const ids = [this.mayusculas() ? `${this.idCampo()}-mayus` : null, this.describedby()]
      .filter((id): id is string => !!id)
      .join(' ');
    return ids || null;
  });

  private alCambiar: (valor: string) => void = () => undefined;
  private alTocar: () => void = () => undefined;

  writeValue(valor: string | null): void {
    this.valor.set(valor ?? '');
  }

  registerOnChange(fn: (valor: string) => void): void {
    this.alCambiar = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.alTocar = fn;
  }

  setDisabledState(deshabilitado: boolean): void {
    this.deshabilitado.set(deshabilitado);
  }

  enfocar(): void {
    this.entrada().nativeElement.focus();
  }

  ocultar(): void {
    this.visible.set(false);
  }

  protected alEscribir(evento: Event): void {
    const valor = (evento.target as HTMLInputElement).value;
    this.valor.set(valor);
    this.alCambiar(valor);
  }

  protected alSalir(): void {
    this.mayusculas.set(false);
    this.alTocar();
  }

  protected alternar(): void {
    this.visible.update((v) => !v);
  }

  protected revisarMayusculas(evento: KeyboardEvent): void {
    // `getModifierState` puede faltar en eventos sintéticos de algunos teclados virtuales.
    this.mayusculas.set(evento.getModifierState?.('CapsLock') ?? false);
  }
}
