import { ElementRef, Injector, afterNextRender } from '@angular/core';

type Objetivo = ElementRef<HTMLElement> | HTMLElement | null | undefined;

/**
 * Mueve el foco a un destino estable después del próximo renderizado (WCAG 2.4.3, RNF12).
 * Se usa tras una acción cuyo botón puede desaparecer, para que el foco no caiga en `<body>`.
 * El destino debe existir tras renderizar (p. ej. el aviso de resultado con `tabindex="-1"`).
 */
export function enfocarTrasRenderizar(injector: Injector, objetivo: () => Objetivo): void {
  afterNextRender(
    () => {
      const destino = objetivo();
      const elemento = destino instanceof ElementRef ? destino.nativeElement : destino;
      elemento?.focus();
    },
    { injector },
  );
}
