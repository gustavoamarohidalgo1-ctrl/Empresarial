import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TipoAviso } from '../../../core/avisos/aviso-flash.service';
import { IconoComponent } from '../icono/icono';
import { NombreIcono } from '../icono/iconos';

const ICONO: Readonly<Record<TipoAviso, NombreIcono>> = {
  exito: 'check-circle',
  error: 'alert-circle',
  advertencia: 'alert-triangle',
  info: 'info',
};

const PREFIJO: Readonly<Record<TipoAviso, string>> = {
  exito: 'Listo:',
  error: 'Error:',
  advertencia: 'Atención:',
  info: 'Información:',
};

/**
 * Mensaje de resultado o de contexto, con icono, título opcional, texto y acciones
 * (contenido proyectado; las acciones van en un `<div class="acciones">`).
 * El tipo se anuncia con texto (prefijo oculto o título visible), no solo con color.
 *
 * Anuncios: lo más fiable es colocarlo dentro de un contenedor `aria-live` que ya exista en
 * la página (patrón actual de las pantallas). Si el aviso aparece solo, `vivo="polite"`
 * le da `role="status"` y `vivo="assertive"`, `role="alert"`.
 *
 * Uso: `<app-aviso tipo="error" titulo="No se guardó"><p>…</p></app-aviso>`
 */
@Component({
  selector: 'app-aviso',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `
    <div class="aviso" [class]="'aviso aviso--' + tipo()" [attr.role]="rol()">
      <app-icono class="aviso__icono" [nombre]="icono()" [trazo]="2" />
      <div class="aviso__cuerpo">
        @if (titulo()) {
          <p class="aviso__titulo">{{ titulo() }}</p>
        } @else {
          <span class="solo-lectores">{{ prefijo() }} </span>
        }
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class AvisoComponent {
  readonly tipo = input<TipoAviso>('info');
  readonly titulo = input<string | null>(null);
  /** Región viva opcional: `polite` → `role="status"`, `assertive` → `role="alert"`. */
  readonly vivo = input<'polite' | 'assertive' | null>(null);

  protected readonly icono = computed(() => ICONO[this.tipo()] ?? 'info');
  protected readonly prefijo = computed(() => PREFIJO[this.tipo()]);
  protected readonly rol = computed(() => {
    const vivo = this.vivo();
    return vivo === 'assertive' ? 'alert' : vivo === 'polite' ? 'status' : null;
  });
}
