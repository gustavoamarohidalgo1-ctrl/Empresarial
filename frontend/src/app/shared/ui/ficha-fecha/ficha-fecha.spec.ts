import { TestBed } from '@angular/core/testing';
import { FichaFechaComponent } from './ficha-fecha';

describe('FichaFechaComponent', () => {
  async function crear(entradas: Record<string, unknown>) {
    const fixture = TestBed.createComponent(FichaFechaComponent);
    for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const parte = (host: HTMLElement, clase: string) =>
    host.querySelector(`.ficha__${clase}`)?.textContent?.trim();

  it('muestra mes, día y día de la semana en hora de Lima', async () => {
    const host = await crear({ fecha: '2026-11-04T14:00:00Z' });
    expect(parte(host, 'mes')).toBe('nov');
    expect(parte(host, 'dia')).toBe('4');
    expect(parte(host, 'semana')).toBe('mié');
    expect(host.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-04');
  });

  it('usa el día de Lima aunque en UTC ya sea el día siguiente', async () => {
    // 03:30 UTC del 5 de noviembre = 22:30 del 4 en Lima.
    const host = await crear({ fecha: '2026-11-05T03:30:00Z' });
    expect(parte(host, 'dia')).toBe('4');
    expect(host.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-04');
  });

  it('las partes visuales se ocultan y se lee la fecha completa', async () => {
    const host = await crear({ fecha: '2026-11-04T14:00:00Z' });
    for (const clase of ['mes', 'dia', 'semana']) {
      expect(host.querySelector(`.ficha__${clase}`)?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(host.querySelector('.solo-lectores')?.textContent?.trim()).toBe(
      'Miércoles, 4 de noviembre de 2026',
    );
  });

  it('aplica tamaño y variante destacada; con fecha inválida no pinta nada', async () => {
    const host = await crear({ fecha: '2026-11-04T14:00:00Z', tamano: 'lg', destacada: true });
    expect(host.classList).toContain('ficha--lg');
    expect(host.classList).toContain('ficha--destacada');
    expect((await crear({ fecha: 'no-es-fecha' })).querySelector('time')).toBeNull();
  });
});
