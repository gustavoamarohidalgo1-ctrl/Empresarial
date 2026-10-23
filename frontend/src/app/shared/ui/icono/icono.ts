import {
  ChangeDetectionStrategy,
  Component,
  PendingTasks,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { ICONOS_BASE } from './iconos-base';
import type { NombreIcono } from './iconos';

/**
 * Registro completo (`iconos.ts`), en dos niveles: los iconos del primer render
 * (`iconos-base.ts`) van en el bundle inicial; el resto se importa en diferido una sola vez, la
 * primera vez que se pide uno que no está en la base (o antes, con `cargarIconos()`).
 */
const registroCompleto = signal<Readonly<Record<string, string>> | null>(null);
let carga: Promise<void> | null = null;

/** Carga el registro completo (idempotente; si falla, el siguiente intento lo repite). */
export function cargarIconos(): Promise<void> {
  carga ??= import('./iconos').then(
    (m) => registroCompleto.set(m.ICONOS),
    () => {
      carga = null;
    },
  );
  return carga;
}

/** `true` si el icono está en el bundle inicial (`iconos-base.ts`). */
export function esIconoBase(nombre: string): boolean {
  return Object.prototype.hasOwnProperty.call(ICONOS_BASE, nombre);
}

/**
 * Icono SVG en línea (trazos de Lucide, ver `iconos.ts`). Hereda el color del texto
 * (`currentColor`) y mide `--icono-tamano` (1.25rem por defecto) salvo que se indique `tamano`.
 * Su caja tiene siempre el mismo tamaño: si el trazo aún se está cargando (registro completo
 * en diferido), el icono aparece al llegar sin mover nada.
 *
 * Es decorativo (`aria-hidden`) por defecto. Si el icono es la ÚNICA forma de transmitir
 * algo, pasa `etiqueta` y se expone como `role="img"` con ese nombre accesible.
 *
 * Uso: `<app-icono nombre="clock" />` · `<app-icono nombre="info" [tamano]="16" etiqueta="Información" />`
 */
@Component({
  selector: 'app-icono',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.aria-hidden]': 'etiqueta() ? null : "true"',
    '[attr.role]': 'etiqueta() ? "img" : null',
    '[attr.aria-label]': 'etiqueta() || null',
    '[style.width]': 'medida()',
    '[style.height]': 'medida()',
  },
  template: `<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    [attr.stroke-width]="trazo()"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path [attr.d]="ruta()" />
  </svg>`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: var(--icono-tamano, 1.25rem);
      height: var(--icono-tamano, 1.25rem);
      line-height: 0;
      vertical-align: -0.2em;
    }

    svg {
      width: 100%;
      height: 100%;
      overflow: visible;
    }
  `,
})
export class IconoComponent {
  readonly nombre = input.required<NombreIcono>();
  /** Tamaño: número en px (`16`) o longitud CSS (`'1.5rem'`). Por defecto, `--icono-tamano`. */
  readonly tamano = input<number | string | null>(null);
  /** Grosor del trazo (Lucide usa 2; SIGA-SP, 1.75 para un aspecto más sereno). */
  readonly trazo = input<number>(1.75);
  /** Nombre accesible. Si falta, el icono es decorativo. */
  readonly etiqueta = input<string | null>(null);

  private readonly tareas = inject(PendingTasks);

  protected readonly ruta = computed(() => {
    const nombre = this.nombre();
    if (esIconoBase(nombre)) return ICONOS_BASE[nombre as keyof typeof ICONOS_BASE];
    const completo = registroCompleto();
    if (completo) return completo[nombre] ?? '';
    // Fuera del cálculo: la carga es una tarea pendiente (`whenStable()` la espera).
    queueMicrotask(() => this.tareas.run(cargarIconos));
    return '';
  });
  protected readonly medida = computed(() => {
    const t = this.tamano();
    if (t === null || t === '') return null;
    return typeof t === 'number' ? `${t}px` : t;
  });
}
