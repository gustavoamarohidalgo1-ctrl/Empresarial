import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resumenIndicadores } from '../../../../testing/indicadores-prueba';
import { boton } from '../../../../testing/dom';
import { GraficoEstadosComponent } from './grafico-estados';

const normalizar = (t: string | null | undefined) =>
  (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

/** Texto visible con un espacio entre nodos de texto (las celdas no llevan espacios entre sí). */
function textoDe(el: Element | null | undefined): string {
  if (!el) return '';
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const partes: string[] = [];
  while (recorrido.nextNode()) partes.push(recorrido.currentNode.textContent ?? '');
  return normalizar(partes.join(' '));
}

describe('GraficoEstadosComponent', () => {
  let fixture: ComponentFixture<GraficoEstadosComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    const r = resumenIndicadores();
    fixture = TestBed.createComponent(GraficoEstadosComponent);
    fixture.componentRef.setInput('porEstado', r.porEstado);
    fixture.componentRef.setInput('totalCitas', r.totalCitas);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  });

  const sectores = () => Array.from(host.querySelectorAll<SVGPathElement>('.ge__sector'));
  const centro = () => normalizar(host.querySelector('svg g[aria-hidden]')?.textContent);

  it('dibuja un sector por estado con citas, en orden fijo y con su descripción', () => {
    expect(sectores().map((s) => s.getAttribute('data-estado'))).toEqual([
      'PENDIENTE',
      'CONFIRMADA',
      'COMPLETADA',
      'CANCELADA',
      'NO_ASISTIO',
    ]);
    expect(normalizar(sectores()[0].getAttribute('aria-label'))).toBe(
      'Pendiente: 20 citas, 16.7 % del total.',
    );
    expect(sectores().map((s) => s.getAttribute('tabindex'))).toEqual([
      '0',
      '-1',
      '-1',
      '-1',
      '-1',
    ]);
    expect(centro()).toBe('120 citas en el periodo');
  });

  it('la leyenda lista los 8 estados con icono, cantidad y porcentaje (los vacíos atenuados)', () => {
    const filas = Array.from(host.querySelectorAll('.ge__fila'));
    expect(filas).toHaveLength(8);
    expect(filas.every((f) => f.querySelector('app-icono'))).toBe(true);
    expect(textoDe(filas[5])).toBe('Completada 54 45.0 %');
    expect(filas[2].classList).toContain('ge__fila--vacia');
    expect(normalizar(host.querySelector('.mg__descripcion')?.textContent)).toContain(
      '«Completada» (45.0 %)',
    );
  });

  it('al pasar el ratón o enfocar un sector, el centro muestra su detalle y los demás se atenúan', async () => {
    sectores()[3].dispatchEvent(new Event('pointerenter'));
    await fixture.whenStable();
    expect(centro()).toBe('10 Cancelada 8.3 %');
    expect(sectores()[0].classList).toContain('ge__sector--atenuado');
    expect(sectores()[3].classList).not.toContain('ge__sector--atenuado');
    expect(host.querySelector('.ge__fila--activa')?.getAttribute('data-estado')).toBe('CANCELADA');

    host.querySelector('.ge__dona')!.dispatchEvent(new Event('pointerleave'));
    await fixture.whenStable();
    expect(centro()).toBe('120 citas en el periodo');

    sectores()[1].dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    expect(centro()).toBe('30 Confirmada 25.0 %');
    expect(sectores()[1].getAttribute('tabindex')).toBe('0');
  });

  it('las flechas recorren los sectores', async () => {
    const svg = host.querySelector('svg.ge__svg')!;
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    await fixture.whenStable();
    expect(sectores()[4].getAttribute('tabindex')).toBe('0');
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    await fixture.whenStable();
    expect(sectores()[3].getAttribute('tabindex')).toBe('0');
  });

  it('tiene tabla equivalente con los 8 estados y el total', async () => {
    boton(fixture, 'Ver como tabla')!.click();
    await fixture.whenStable();
    const filas = Array.from(host.querySelectorAll('tbody tr')).map((tr) => textoDe(tr));
    expect(filas).toHaveLength(8);
    expect(filas[0]).toBe('Pendiente 20 16.7 %');
    expect(textoDe(host.querySelector('tfoot'))).toBe('Total 120');
  });
});
