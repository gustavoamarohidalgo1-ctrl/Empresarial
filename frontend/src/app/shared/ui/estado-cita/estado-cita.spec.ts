import { TestBed } from '@angular/core/testing';
import { EstadoCita } from '../../../core/modelos/contrato';
import { ICONOS } from '../icono/iconos';
import { EstadoCitaComponent, ICONO_ESTADO } from './estado-cita';

describe('EstadoCitaComponent', () => {
  async function crear(entradas: Record<string, unknown>) {
    const fixture = TestBed.createComponent(EstadoCitaComponent);
    for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const texto = (host: HTMLElement) => host.textContent?.replace(/\s+/g, ' ').trim();

  it('comunica el estado con texto («Estado: …») y no solo con color', async () => {
    const host = await crear({ estado: 'CONFIRMADA', etiqueta: 'Confirmada' });
    expect(texto(host)).toBe('Estado: Confirmada');
    expect(host.querySelector('.solo-lectores')?.textContent).toContain('Estado:');
    expect(host.querySelector('.estado')?.getAttribute('data-estado')).toBe('CONFIRMADA');
  });

  it('usa la etiqueta de respaldo si el servidor no la envía', async () => {
    expect(texto(await crear({ estado: 'NO_ASISTIO', etiqueta: '  ' }))).toBe('Estado: No asistió');
    expect(texto(await crear({ estado: 'EN_ATENCION' }))).toBe('Estado: En atención');
  });

  it('lleva el icono decorativo de la tabla de estados', async () => {
    const estados: EstadoCita[] = [
      'PENDIENTE',
      'CONFIRMADA',
      'CHECK_IN',
      'EN_ESPERA',
      'EN_ATENCION',
      'COMPLETADA',
      'CANCELADA',
      'NO_ASISTIO',
    ];
    for (const estado of estados) {
      const host = await crear({ estado });
      const icono = host.querySelector('app-icono')!;
      expect(icono.getAttribute('aria-hidden')).toBe('true');
      expect(icono.querySelector('path')?.getAttribute('d')).toBe(ICONOS[ICONO_ESTADO[estado]]);
    }
  });

  it('admite el tamaño pequeño', async () => {
    const host = await crear({ estado: 'PENDIENTE', tamano: 'sm' });
    expect(host.querySelector('.estado')?.classList).toContain('estado--sm');
  });
});
