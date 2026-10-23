import { TestBed } from '@angular/core/testing';
import {
  CLAVE_TEMA,
  aplicarTema,
  aplicarTemaInicial,
  guardarPreferenciaTema,
  leerPreferenciaTema,
} from './tema';
import { TemaService } from './tema.service';

function limpiarDocumento(): void {
  document.documentElement.classList.remove('tema-claro', 'tema-oscuro');
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  localStorage.clear();
}

function agregarMeta(contenido: string): HTMLMetaElement {
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = contenido;
  document.head.appendChild(meta);
  return meta;
}

describe('tema (funciones)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    limpiarDocumento();
  });

  it('aplicarTemaInicial pone la clase guardada en <html> antes de arrancar', () => {
    localStorage.setItem(CLAVE_TEMA, 'oscuro');
    expect(aplicarTemaInicial(document)).toBe('oscuro');
    expect(document.documentElement.classList).toContain('tema-oscuro');
    expect(document.documentElement.classList).not.toContain('tema-claro');
  });

  it('sin preferencia, o con un valor desconocido, usa «sistema» (sin clases)', () => {
    expect(aplicarTemaInicial(document)).toBe('sistema');
    localStorage.setItem(CLAVE_TEMA, 'violeta');
    expect(aplicarTemaInicial(document)).toBe('sistema');
    expect(document.documentElement.className).not.toMatch(/tema-/);
  });

  it('si localStorage falla, no rompe la app', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(leerPreferenciaTema(window)).toBe('sistema');
    expect(guardarPreferenciaTema(window, 'oscuro')).toBe(false);
    expect(() => aplicarTemaInicial(document)).not.toThrow();
  });

  it('con tema manual ajusta theme-color y con «sistema» lo restaura', () => {
    const meta = agregarMeta('#ffffff');
    document.documentElement.style.setProperty('--c-tema-navegador', '#1a1721');
    aplicarTema(document, 'oscuro');
    expect(meta.content).toBe('#1a1721');
    aplicarTema(document, 'sistema');
    expect(meta.content).toBe('#ffffff');
    document.documentElement.style.removeProperty('--c-tema-navegador');
  });
});

describe('TemaService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    limpiarDocumento();
  });

  it('parte de la preferencia guardada', () => {
    localStorage.setItem(CLAVE_TEMA, 'claro');
    const tema = TestBed.inject(TemaService);
    expect(tema.preferencia()).toBe('claro');
    expect(tema.temaEfectivo()).toBe('claro');
  });

  it('cambiar() guarda, aplica la clase y «sistema» borra la clave', () => {
    const tema = TestBed.inject(TemaService);
    tema.cambiar('oscuro');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');
    expect(document.documentElement.classList).toContain('tema-oscuro');
    expect(tema.temaEfectivo()).toBe('oscuro');

    tema.cambiar('sistema');
    expect(localStorage.getItem(CLAVE_TEMA)).toBeNull();
    expect(document.documentElement.className).not.toMatch(/tema-/);
  });

  it('en «sistema» sigue a prefers-color-scheme (y a sus cambios)', () => {
    let oyente: ((e: MediaQueryListEvent) => void) | undefined;
    const original = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => (oyente = fn),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    try {
      const tema = TestBed.inject(TemaService);
      expect(tema.temaEfectivo()).toBe('oscuro');
      oyente?.({ matches: false } as MediaQueryListEvent);
      expect(tema.temaEfectivo()).toBe('claro');
    } finally {
      window.matchMedia = original;
    }
  });

  it('si no puede guardar, igual cambia el tema en pantalla', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const tema = TestBed.inject(TemaService);
    expect(() => tema.cambiar('oscuro')).not.toThrow();
    expect(document.documentElement.classList).toContain('tema-oscuro');
  });
});
