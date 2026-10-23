import { ComponentFixture, TestBed } from '@angular/core/testing';
import { boton, query } from '../../../../testing/dom';
import { ProgresoReservaComponent } from './progreso-reserva';
import { PASOS_RESERVA } from './reservar';

describe('ProgresoReservaComponent', () => {
  let fixture: ComponentFixture<ProgresoReservaComponent>;

  async function crear(actual: number, bloqueado = false): Promise<void> {
    fixture = TestBed.createComponent(ProgresoReservaComponent);
    fixture.componentRef.setInput('pasos', PASOS_RESERVA);
    fixture.componentRef.setInput('actual', actual);
    fixture.componentRef.setInput('bloqueado', bloqueado);
    await fixture.whenStable();
  }

  function pasos(): HTMLLIElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('li'));
  }

  it('es una lista ordenada dentro de un nav con «Paso X de 4»', async () => {
    await crear(3);
    const nav = query(fixture, 'nav');
    expect(nav.getAttribute('aria-label')).toBe('Progreso de la reserva');
    expect(nav.textContent!.replace(/\s+/g, ' ')).toContain('Paso 3 de 4 · Fecha y hora');
    expect(query(fixture, 'ol').children.length).toBe(4);
  });

  it('marca el paso actual con aria-current="step" y anuncia el estado de cada paso', async () => {
    await crear(2);
    const [uno, dos, tres] = pasos();
    expect(dos.getAttribute('aria-current')).toBe('step');
    expect(uno.getAttribute('aria-current')).toBeNull();
    expect(uno.textContent).toContain('completado');
    expect(dos.textContent).toContain('paso actual');
    expect(tres.textContent).toContain('pendiente');
  });

  it('los pasos completados son botones que emiten el número del paso', async () => {
    await crear(3);
    const emitidos: number[] = [];
    fixture.componentInstance.irA.subscribe((n) => emitidos.push(n));
    expect(pasos()[2].querySelector('button')).toBeNull();
    expect(pasos()[3].querySelector('button')).toBeNull();
    boton(fixture, /^Profesional/)!.click();
    expect(emitidos).toEqual([2]);
  });

  it('mientras se envía no permite volver a otro paso', async () => {
    await crear(4, true);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('button').length).toBe(0);
  });
});
