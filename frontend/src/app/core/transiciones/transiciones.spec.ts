import { TestBed } from '@angular/core/testing';
import { ViewTransitionInfo } from '@angular/router';
import { omitirSiMovimientoReducido } from './transiciones';

describe('omitirSiMovimientoReducido', () => {
  const original = window.matchMedia;

  afterEach(() => {
    window.matchMedia = original;
  });

  function ejecutar(reducido: boolean | null) {
    window.matchMedia = (reducido === null
      ? undefined
      : vi.fn().mockReturnValue({ matches: reducido })) as unknown as typeof window.matchMedia;
    const skipTransition = vi.fn();
    const info = { transition: { skipTransition } } as unknown as ViewTransitionInfo;
    TestBed.runInInjectionContext(() => omitirSiMovimientoReducido(info));
    return skipTransition;
  }

  it('omite la transición con prefers-reduced-motion: reduce', () => {
    expect(ejecutar(true)).toHaveBeenCalled();
  });

  it('la mantiene sin esa preferencia o si matchMedia no existe', () => {
    expect(ejecutar(false)).not.toHaveBeenCalled();
    expect(ejecutar(null)).not.toHaveBeenCalled();
  });
});
