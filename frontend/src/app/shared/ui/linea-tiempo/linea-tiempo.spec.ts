import { TestBed } from '@angular/core/testing';
import { EventoLineaTiempo } from '../../../core/modelos/contrato';
import { ICONOS } from '../icono/iconos';
import { ICONO_EVENTO, LineaTiempoComponent } from './linea-tiempo';

const EVENTOS: EventoLineaTiempo[] = [
  {
    secuencia: 2,
    tipo: 'CONFIRMADA',
    ocurridoEn: '2026-10-20T15:00:00Z',
    titulo: 'Cita confirmada',
    descripcion: '',
  },
  {
    secuencia: 1,
    tipo: 'CREADA',
    ocurridoEn: '2026-10-13T14:00:00Z',
    titulo: 'Cita registrada',
    descripcion: 'Cita de prueba registrada.',
  },
  {
    secuencia: 3,
    tipo: 'LLEGADA_REGISTRADA',
    ocurridoEn: '2026-11-04T13:50:00Z',
    titulo: 'Llegada registrada',
    descripcion: 'En la sede.',
  },
];

describe('LineaTiempoComponent', () => {
  async function crear(entradas: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(LineaTiempoComponent);
    fixture.componentRef.setInput('eventos', EVENTOS);
    for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const titulos = (host: HTMLElement) =>
    Array.from(host.querySelectorAll('.lt__titulo')).map((t) => t.textContent?.trim());

  it('ordena por secuencia (cronológico por defecto, o descendente)', async () => {
    expect(titulos(await crear())).toEqual([
      'Cita registrada',
      'Cita confirmada',
      'Llegada registrada',
    ]);
    expect(titulos(await crear({ orden: 'desc' }))[0]).toBe('Llegada registrada');
  });

  it('pone el icono de cada tipo de evento', async () => {
    const host = await crear();
    const rutas = Array.from(host.querySelectorAll('.lt__marcador path')).map((p) =>
      p.getAttribute('d'),
    );
    expect(rutas).toEqual([
      ICONOS[ICONO_EVENTO.CREADA],
      ICONOS[ICONO_EVENTO.CONFIRMADA],
      ICONOS[ICONO_EVENTO.LLEGADA_REGISTRADA],
    ]);
  });

  it('destaca solo el evento más reciente', async () => {
    const host = await crear();
    const actuales = host.querySelectorAll('[aria-current="step"]');
    expect(actuales).toHaveLength(1);
    expect(actuales[0].classList).toContain('lt__evento--reciente');
    expect(actuales[0].textContent).toContain('Llegada registrada');
    expect(actuales[0].textContent).toContain('Más reciente');
    expect(host.querySelectorAll('.lt__reciente')).toHaveLength(1);
  });

  it('muestra la hora de Lima en <time> y la descripción solo si existe', async () => {
    const host = await crear({ etiquetadoPor: 'titulo-historial' });
    expect(host.querySelector('ol')?.getAttribute('aria-labelledby')).toBe('titulo-historial');
    const primero = host.querySelector('.lt__evento')!;
    const hora = primero.querySelector('time')!;
    expect(hora.getAttribute('datetime')).toBe('2026-10-13T14:00:00Z');
    expect(hora.textContent?.trim()).toBe('13 oct 2026, 09:00');
    expect(host.querySelectorAll('.lt__descripcion')).toHaveLength(2);
  });
});
