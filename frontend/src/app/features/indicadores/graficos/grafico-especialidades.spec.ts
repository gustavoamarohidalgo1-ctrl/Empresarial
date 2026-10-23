import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resumenIndicadores } from '../../../../testing/indicadores-prueba';
import { boton } from '../../../../testing/dom';
import { GraficoEspecialidadesComponent } from './grafico-especialidades';

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

describe('GraficoEspecialidadesComponent', () => {
  let fixture: ComponentFixture<GraficoEspecialidadesComponent>;
  let host: HTMLElement;

  beforeEach(async () => {
    fixture = TestBed.createComponent(GraficoEspecialidadesComponent);
    fixture.componentRef.setInput('porEspecialidad', resumenIndicadores().porEspecialidad);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  });

  const filas = () => Array.from(host.querySelectorAll<HTMLElement>('.gesp__fila'));

  it('ordena de mayor a menor número de citas, con nombre y descripción accesible', () => {
    expect(filas().map((f) => f.querySelector('.gesp__nombre')?.textContent?.trim())).toEqual([
      'Cardiología',
      'Medicina general',
      'Dermatología',
    ]);
    expect(normalizar(filas()[0].getAttribute('aria-label'))).toBe(
      'Cardiología: 50 citas (41.7 % del total); inasistencia 10.0 %.',
    );
    expect(filas().map((f) => f.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
    const grupo = host.querySelector('[role="group"]')!;
    expect(grupo.getAttribute('aria-labelledby')).toBe(host.querySelector('h2')!.id);
  });

  it('escala cada panel por separado y muestra «No calculable» sin barra', () => {
    const [cardio, medicina, derma] = filas();
    const barras = (f: HTMLElement) =>
      Array.from(f.querySelectorAll('rect')).map((r) => r.getAttribute('width'));
    // Citas: 50 es el máximo (80 %); inasistencia: 20 % es el máximo de una escala hasta 20.
    expect(barras(cardio)).toEqual(['80%', '40%']);
    expect(barras(medicina)).toEqual(['64%', '80%']);
    expect(barras(derma)).toEqual(['48%']);
    expect(normalizar(derma.textContent)).toContain('No calculable');
    expect(normalizar(host.querySelector('.mg__descripcion')?.textContent)).toContain(
      'la mayor inasistencia es la de Medicina general (20.0 %)',
    );
  });

  it('muestra un tooltip al pasar el ratón o enfocar, y las flechas recorren las filas', async () => {
    filas()[1].dispatchEvent(new Event('pointerenter'));
    await fixture.whenStable();
    const tooltip = host.querySelector('.gesp__tooltip');
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true');
    expect(textoDe(tooltip)).toBe(
      'Medicina general 40 citas · 33.3 % del total Inasistencia: 20.0 %',
    );

    host
      .querySelector('.gesp')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(host.querySelector('.gesp__tooltip')).toBeNull();

    host
      .querySelector('.gesp')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    await fixture.whenStable();
    expect(filas()[1].getAttribute('tabindex')).toBe('0');
  });

  it('tiene tabla equivalente', async () => {
    boton(fixture, 'Ver como tabla')!.click();
    await fixture.whenStable();
    const tabla = Array.from(host.querySelectorAll('tbody tr')).map((tr) => textoDe(tr));
    expect(tabla).toEqual([
      'Cardiología 50 41.7 % 10.0 %',
      'Medicina general 40 33.3 % 20.0 %',
      'Dermatología 30 25.0 % No calculable',
    ]);
  });
});
