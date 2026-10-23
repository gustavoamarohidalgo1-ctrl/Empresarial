import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { PreferenciaTema, aplicarTema, guardarPreferenciaTema, leerPreferenciaTema } from './tema';

/** Preferencia de tema del usuario (menú de usuario) y tema efectivo resultante. */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly documento = inject(DOCUMENT);
  private readonly ventana = this.documento.defaultView;

  private readonly preferenciaActual = signal<PreferenciaTema>(leerPreferenciaTema(this.ventana));
  private readonly sistemaOscuro = signal(false);

  /** Lo que eligió la persona: «claro», «oscuro» o «sistema». */
  readonly preferencia = this.preferenciaActual.asReadonly();
  /** El tema que realmente se ve. */
  readonly temaEfectivo = computed<'claro' | 'oscuro'>(() => {
    const p = this.preferenciaActual();
    if (p !== 'sistema') return p;
    return this.sistemaOscuro() ? 'oscuro' : 'claro';
  });

  constructor() {
    const consulta =
      this.ventana && typeof this.ventana.matchMedia === 'function'
        ? this.ventana.matchMedia('(prefers-color-scheme: dark)')
        : null;
    if (consulta) {
      this.sistemaOscuro.set(consulta.matches);
      const alCambiar = (e: MediaQueryListEvent) => this.sistemaOscuro.set(e.matches);
      consulta.addEventListener?.('change', alCambiar);
      inject(DestroyRef).onDestroy(() => consulta.removeEventListener?.('change', alCambiar));
    }
  }

  cambiar(preferencia: PreferenciaTema): void {
    this.preferenciaActual.set(preferencia);
    guardarPreferenciaTema(this.ventana, preferencia);
    aplicarTema(this.documento, preferencia);
  }
}
