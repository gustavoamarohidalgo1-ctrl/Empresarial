import { TestBed } from '@angular/core/testing';
import { EsqueletoComponent } from './esqueleto';

describe('EsqueletoComponent', () => {
  async function crear(entradas: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(EsqueletoComponent);
    for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const bloques = (host: HTMLElement) =>
    Array.from(host.querySelectorAll<HTMLElement>('.esqueleto__bloque'));

  it('es invisible para lectores de pantalla y no tiene texto', async () => {
    const host = await crear();
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.textContent?.trim()).toBe('');
  });

  it('por defecto es una línea de texto a todo el ancho', async () => {
    const host = await crear();
    expect(host.classList).toContain('esqueleto--texto');
    expect(bloques(host)).toHaveLength(1);
    expect(host.style.width).toBe('');
  });

  it('reserva el tamaño pedido (ancho del host y alto de cada bloque)', async () => {
    const host = await crear({ forma: 'bloque', ancho: '12rem', alto: '9rem' });
    expect(host.classList).toContain('esqueleto--bloque');
    expect(host.style.width).toBe('12rem');
    expect(bloques(host)[0].style.height).toBe('9rem');
  });

  it('con varias líneas acorta la última', async () => {
    const host = await crear({ lineas: 3 });
    const b = bloques(host);
    expect(b).toHaveLength(3);
    expect(b[0].style.width).toBe('');
    expect(b[2].style.width).toBe('65%');
  });
});
