import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query, texto } from '../../../../testing/dom';
import { VentanaLlegadaComponent } from './ventana-llegada';

/** Ventana 08:00–09:30 y cita 09:00–09:20 del 4 nov 2026 (hora de Lima). */
const VENTANA = { desde: '2026-11-04T13:00:00Z', hasta: '2026-11-04T14:30:00Z' };
const INICIO = '2026-11-04T14:00:00Z';
const FIN = '2026-11-04T14:20:00Z';

describe('VentanaLlegadaComponent', () => {
  let fixture: ComponentFixture<VentanaLlegadaComponent>;

  async function crear(entradas: {
    ahora: string;
    disponible?: boolean;
    registradaEn?: string | null;
    ventana?: { desde: string; hasta: string };
  }): Promise<void> {
    fixture = TestBed.createComponent(VentanaLlegadaComponent);
    fixture.componentRef.setInput('ventana', entradas.ventana ?? VENTANA);
    fixture.componentRef.setInput('inicio', INICIO);
    fixture.componentRef.setInput('fin', FIN);
    fixture.componentRef.setInput('ahora', new Date(entradas.ahora));
    fixture.componentRef.setInput('disponible', entradas.disponible ?? false);
    fixture.componentRef.setInput('registradaEn', entradas.registradaEn ?? null);
    await fixture.whenStable();
  }

  function estado(): string {
    return query(fixture, '.vl__estado').textContent?.replace(/\s+/g, ' ').trim() ?? '';
  }

  it('explica la ventana en texto, en hora de Lima', async () => {
    await crear({ ahora: '2026-11-04T12:00:00Z' });
    expect(texto(fixture)).toContain(
      'Puedes registrar tu llegada desde las 08:00 hasta antes de las 09:30 del 04 nov 2026 (hora de Lima)',
    );
  });

  it.each([
    [{ ahora: '2026-11-03T15:00:00Z' }, 'Se abre mañana a las 08:00', 'pendiente'],
    [{ ahora: '2026-11-04T13:30:00Z', disponible: true }, 'Disponible ahora', 'abierta'],
    [{ ahora: '2026-11-04T13:30:00Z' }, 'No disponible por ahora', 'no-disponible'],
    [{ ahora: '2026-11-04T15:00:00Z' }, 'Ventana cerrada', 'cerrada'],
    [
      { ahora: '2026-11-04T13:30:00Z', disponible: true, registradaEn: '2026-11-04T13:20:00Z' },
      'Llegada registrada',
      'registrada',
    ],
  ])('estado %j → «%s»', async (entradas, esperado, clave) => {
    await crear(entradas);
    expect(estado()).toBe(esperado);
    expect(query(fixture, '.vl__estado').getAttribute('data-estado')).toBe(clave);
  });

  it('dibuja la franja y la cita sobre una escala del día con 30 min de margen', async () => {
    await crear({ ahora: '2026-11-04T13:45:00Z' });
    const grafico = query(fixture, '.vl__grafico');
    expect(grafico.getAttribute('aria-hidden')).toBe('true');
    // Escala 07:30–10:00 (150 min): la franja 08:00–09:30 va del 20 % al 80 %.
    const rango = query(fixture, '.vl__rango');
    expect(parseFloat(rango.style.left)).toBeCloseTo(20);
    expect(parseFloat(rango.style.width)).toBeCloseTo(60);
    const cita = query(fixture, '.vl__cita');
    expect(parseFloat(cita.style.left)).toBeCloseTo(60);
    // «Ahora» (08:45) solo aparece si cae dentro de la escala.
    expect(parseFloat(query(fixture, '.vl__ahora').style.left)).toBeCloseTo(50);
    expect(grafico.textContent).toContain('Ahora');
  });

  it('sin «ahora» fuera de la escala, y sin gráfico si las fechas no son válidas', async () => {
    await crear({ ahora: '2026-11-01T12:00:00Z' });
    expect(fixture.nativeElement.querySelector('.vl__ahora')).toBeNull();

    await crear({ ahora: '2026-11-01T12:00:00Z', ventana: { desde: 'x', hasta: 'y' } });
    expect(fixture.nativeElement.querySelector('.vl__grafico')).toBeNull();
    expect(texto(fixture)).toContain('Ventana de llegada');
  });
});
