import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resumenIndicadores } from '../../../../testing/indicadores-prueba';
import { boton } from '../../../../testing/dom';
import { ResumenIndicadores } from '../../../core/modelos/contrato';
import { sumarDias } from '../../../shared/utils/fecha-lima';
import { GraficoDiasComponent } from './grafico-dias';

const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** Texto visible con un espacio entre nodos de texto (las celdas no llevan espacios entre sí). */
function textoDe(el: Element | null | undefined): string {
  if (!el) return '';
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const partes: string[] = [];
  while (recorrido.nextNode()) partes.push(recorrido.currentNode.textContent ?? '');
  return normalizar(partes.join(' '));
}

describe('GraficoDiasComponent', () => {
  let fixture: ComponentFixture<GraficoDiasComponent>;
  let host: HTMLElement;

  async function crear(porDia: ResumenIndicadores['porDia'] = resumenIndicadores().porDia) {
    fixture = TestBed.createComponent(GraficoDiasComponent);
    fixture.componentRef.setInput('porDia', porDia);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  }

  const columnas = () => Array.from(host.querySelectorAll<SVGGElement>('.gd__columna'));
  const tooltip = () => host.querySelector<HTMLElement>('.gd__tooltip');

  it('tiene título, descripción y un SVG que los usa como nombre y descripción accesibles', async () => {
    await crear();
    const titulo = host.querySelector('h2')!;
    expect(titulo.textContent?.trim()).toBe('Citas por día');
    const svg = host.querySelector('svg.gd__svg')!;
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-labelledby')).toBe(titulo.id);
    const [descripcion, instrucciones] = svg.getAttribute('aria-describedby')!.split(' ');
    expect(host.querySelector(`#${descripcion}`)?.textContent).toContain('120 citas en total');
    expect(host.querySelector(`#${descripcion}`)?.textContent).toContain(
      'jueves, 1 de octubre de 2026',
    );
    expect(host.querySelector(`#${instrucciones}`)?.textContent).toContain('flechas');
  });

  it('dibuja una columna por día con su descripción y una sola parada de tabulación', async () => {
    await crear();
    const cols = columnas();
    expect(cols).toHaveLength(3);
    expect(cols[0].getAttribute('role')).toBe('img');
    expect(cols[0].getAttribute('aria-label')).toBe(
      'Jueves, 1 de octubre de 2026: 50 citas. completadas 30, sin asistencia 3, canceladas 5, otras 12.',
    );
    expect(cols.map((c) => c.getAttribute('tabindex'))).toEqual(['0', '-1', '-1']);
  });

  it('apila solo los segmentos con citas; «sin asistencia» lleva trama y la leyenda muestra totales', async () => {
    await crear();
    const [primera, , tercera] = columnas();
    expect(
      Array.from(primera.querySelectorAll('path.serie')).map((p) => p.getAttribute('data-serie')),
    ).toEqual(['completadas', 'noAsistio', 'canceladas', 'resto']);
    expect(primera.querySelectorAll('path.trama')).toHaveLength(1);
    expect(
      Array.from(tercera.querySelectorAll('path.serie')).map((p) => p.getAttribute('data-serie')),
    ).toEqual(['resto']);
    const leyenda = Array.from(host.querySelectorAll('.gd__leyenda-item')).map((li) => textoDe(li));
    expect(leyenda).toEqual(['Completadas 54', 'Sin asistencia 6', 'Canceladas 10', 'Otras 50']);
  });

  it('muestra el tooltip al pasar el ratón y lo oculta al salir o con Escape', async () => {
    await crear();
    columnas()[1].dispatchEvent(new Event('pointerenter'));
    await fixture.whenStable();
    expect(tooltip()?.getAttribute('aria-hidden')).toBe('true');
    expect(textoDe(tooltip())).toContain('Viernes, 2 de octubre de 2026');
    expect(textoDe(tooltip())).toContain('24 Completadas');
    expect(textoDe(tooltip())).toContain('40 citas');
    expect(columnas()[1].classList).toContain('gd__columna--activa');

    host.querySelector('.gd__lienzo')!.dispatchEvent(new Event('pointerleave'));
    await fixture.whenStable();
    expect(tooltip()).toBeNull();

    columnas()[0].dispatchEvent(new FocusEvent('focus'));
    await fixture.whenStable();
    expect(tooltip()).not.toBeNull();
    host
      .querySelector('svg.gd__svg')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await fixture.whenStable();
    expect(tooltip()).toBeNull();
  });

  it('las flechas, Inicio y Fin recorren las columnas (foco itinerante)', async () => {
    await crear();
    const svg = host.querySelector('svg.gd__svg')!;
    const tecla = async (key: string) => {
      svg.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      await fixture.whenStable();
    };
    await tecla('ArrowRight');
    expect(columnas().map((c) => c.getAttribute('tabindex'))).toEqual(['-1', '0', '-1']);
    await tecla('End');
    expect(columnas()[2].getAttribute('tabindex')).toBe('0');
    await tecla('Home');
    expect(columnas()[0].getAttribute('tabindex')).toBe('0');
    await tecla('ArrowLeft');
    expect(columnas()[0].getAttribute('tabindex')).toBe('0');
  });

  it('«Ver como tabla» muestra la tabla equivalente (botón de alternancia)', async () => {
    await crear();
    const alternar = boton(fixture, 'Ver como tabla')!;
    expect(alternar.getAttribute('aria-pressed')).toBe('false');
    const vistas = host.querySelectorAll<HTMLElement>('.mg__vista');
    expect(vistas[0].hidden).toBe(false);
    expect(vistas[1].hidden).toBe(true);

    alternar.click();
    await fixture.whenStable();
    expect(alternar.getAttribute('aria-pressed')).toBe('true');
    expect(vistas[0].hidden).toBe(true);
    expect(vistas[1].hidden).toBe(false);

    const filas = Array.from(host.querySelectorAll('tbody tr')).map((tr) =>
      Array.from(tr.children).map((c) => normalizar(c.textContent)),
    );
    expect(filas[0]).toEqual(['Jueves, 1 de octubre de 2026', '50', '30', '3', '5', '12']);
    expect(host.querySelectorAll('thead th')).toHaveLength(6);
    expect(textoDe(host.querySelector('tfoot tr'))).toBe('Total del periodo 120 54 6 10 50');
  });

  it('en periodos largos agrupa por semana (título, columnas y tabla)', async () => {
    const porDia = Array.from({ length: 90 }, (_, i) => ({
      fecha: sumarDias('2026-07-06', i), // lunes
      total: 2,
      completadas: 1,
      canceladas: 0,
      noAsistio: 1,
    }));
    await crear(porDia);
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Citas por semana');
    expect(columnas()).toHaveLength(13);
    expect(host.querySelector('thead th')?.textContent?.trim()).toBe('Semana');
    expect(normalizar(host.querySelector('.mg__descripcion')?.textContent)).toContain(
      'Agrupadas por semana',
    );
  });
});
