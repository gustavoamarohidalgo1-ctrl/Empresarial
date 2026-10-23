import { TestBed } from '@angular/core/testing';
import { citaDetalle } from '../../../../testing/datos-prueba';
import { query } from '../../../../testing/dom';
import { CambioHorarioComponent } from './cambio-horario';

describe('CambioHorarioComponent', () => {
  async function crear(nuevo: unknown) {
    const fixture = TestBed.createComponent(CambioHorarioComponent);
    fixture.componentRef.setInput('actual', citaDetalle());
    fixture.componentRef.setInput('nuevo', nuevo);
    await fixture.whenStable();
    return fixture;
  }

  it('muestra el horario actual y un hueco hasta elegir el nuevo', async () => {
    const fixture = await crear(null);
    const grupo = query(fixture, '[role="group"]');
    expect(grupo.getAttribute('aria-label')).toBe('Cambio de horario');
    const lados = Array.from(grupo.querySelectorAll('.cambio__lado')) as HTMLElement[];
    expect(lados[0].textContent).toContain('Horario actual');
    expect(lados[0].textContent).toContain('09:00');
    expect(lados[0].querySelector('app-ficha-fecha time')!.getAttribute('datetime')).toBe(
      '2026-11-04',
    );
    expect(lados[1].textContent).toContain('Elige un día y una hora');
    // La flecha es decorativa.
    expect(query(fixture, '.cambio__flecha').getAttribute('aria-hidden')).toBe('true');
  });

  it('muestra el nuevo horario (día y hora de Lima) con su sede', async () => {
    const fixture = await crear({
      id: 'h-1',
      inicio: '2026-11-06T15:30:00Z',
      fin: '2026-11-06T15:50:00Z',
      sede: { codigo: 'SURCO', nombre: 'Sede de prueba Surco' },
      profesional: { codigo: 'P01', nombre: 'Profesional P01' },
    });
    const nuevo = query(fixture, '.cambio__lado--nuevo');
    expect(nuevo.textContent).toContain('Nuevo horario');
    expect(nuevo.textContent).toContain('10:30');
    expect(nuevo.textContent).toContain('Sede de prueba Surco');
    expect(nuevo.querySelector('app-ficha-fecha time')!.getAttribute('datetime')).toBe('2026-11-06');
    expect(nuevo.textContent).not.toContain('Elige un día y una hora');
  });
});
