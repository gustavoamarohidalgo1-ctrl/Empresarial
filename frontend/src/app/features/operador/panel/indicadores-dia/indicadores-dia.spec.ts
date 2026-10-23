import { TestBed } from '@angular/core/testing';
import { citaOperador } from '../../../../../testing/datos-prueba';
import { resumirDia } from '../resumen-dia';
import { IndicadoresDiaComponent } from './indicadores-dia';

const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

async function crear(resumen: ReturnType<typeof resumirDia> | null) {
  const fixture = TestBed.createComponent(IndicadoresDiaComponent);
  fixture.componentRef.setInput('resumen', resumen);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    el,
    // Cada dato es un bloque (etiqueta, valor, detalle): se leen por separado.
    tarjetas: () =>
      Array.from(el.querySelectorAll('li')).map((li) =>
        Array.from(li.querySelectorAll('p'))
          .map((p) => normalizar(p.textContent))
          .filter(Boolean)
          .join(' '),
      ),
  };
}

describe('IndicadoresDiaComponent', () => {
  it('sin resumen muestra 5 tarjetas con esqueletos (misma caja) y las etiquetas', async () => {
    const { el, tarjetas } = await crear(null);
    expect(tarjetas()).toEqual([
      'Citas del día',
      'Por llegar',
      'En espera',
      'En atención',
      'Completadas',
    ]);
    expect(el.querySelectorAll('app-esqueleto').length).toBe(10);
    expect(el.querySelector('.kpi__barra')).toBeTruthy();
  });

  it('muestra los valores del día, el avance y los detalles', async () => {
    const ahora = Date.parse('2026-11-06T15:00:00Z');
    const resumen = resumirDia(
      [
        citaOperador({ id: 'a', estado: 'CONFIRMADA', inicio: '2026-11-06T15:30:00Z' }),
        citaOperador({
          id: 'b',
          estado: 'EN_ESPERA',
          llegadaRegistradaEn: '2026-11-06T13:55:00Z',
        }),
        citaOperador({ id: 'c', estado: 'COMPLETADA' }),
        citaOperador({ id: 'd', estado: 'NO_ASISTIO' }),
      ],
      ahora,
      true,
    );
    const { el, tarjetas } = await crear(resumen);
    expect(tarjetas()).toEqual([
      'Citas del día 4 33 % atendido · 1 cancelada o ausente',
      'Por llegar 1 Siguiente: 10:30',
      'En espera 1 Mayor espera: 1 h 05 min',
      'En atención 0 Nadie en consultorio',
      'Completadas 1 De 3 citas activas',
    ]);
    const relleno = el.querySelector<HTMLElement>('.kpi__relleno')!;
    expect(relleno.style.inlineSize).toBe('33%');
    expect(relleno.parentElement!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('app-esqueleto')).toBeNull();
  });

  it('sin citas activas dice que no hay nadie por llegar ni en espera', async () => {
    const { tarjetas } = await crear(resumirDia([], Date.now(), false));
    expect(tarjetas()).toEqual([
      'Citas del día 0 0 % atendido',
      'Por llegar 0 Nadie por llegar',
      'En espera 0 Nadie en espera',
      'En atención 0 Nadie en consultorio',
      'Completadas 0 De 0 citas activas',
    ]);
  });
});
