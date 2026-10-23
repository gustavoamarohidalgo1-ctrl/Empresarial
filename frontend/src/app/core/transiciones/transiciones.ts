import { DOCUMENT } from '@angular/common';
import { inject } from '@angular/core';
import { ViewTransitionInfo } from '@angular/router';

/**
 * `onViewTransitionCreated` de `withViewTransitions`: si la persona prefiere movimiento
 * reducido, se salta la animación (el cambio de ruta es inmediato). Se evalúa en cada
 * navegación, así que respeta cambios de preferencia sin recargar.
 * Se ejecuta en el contexto de inyección del router.
 */
export function omitirSiMovimientoReducido({ transition }: ViewTransitionInfo): void {
  const ventana = inject(DOCUMENT).defaultView;
  const reducido =
    !!ventana &&
    typeof ventana.matchMedia === 'function' &&
    ventana.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducido) transition.skipTransition();
}
