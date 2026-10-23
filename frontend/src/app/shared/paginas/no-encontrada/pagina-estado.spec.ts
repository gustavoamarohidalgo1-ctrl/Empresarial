import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { query } from '../../../../testing/dom';
import { PaginaEstadoComponent } from './pagina-estado';

@Component({
  imports: [PaginaEstadoComponent],
  template: `
    <app-pagina-estado ilustracion="acceso-denegado" titulo="Sin permiso" texto="Explicación">
      <p class="extra">Más contexto</p>
      <button acciones type="button" class="btn">Acción</button>
    </app-pagina-estado>
  `,
})
class AnfitrionComponent {}

@Component({
  imports: [PaginaEstadoComponent],
  template: `<app-pagina-estado titulo="Solo título" />`,
})
class MinimoComponent {}

describe('PaginaEstadoComponent', () => {
  it('pinta título (h1 que nombra la sección), texto, contenido y acciones', async () => {
    const fixture = TestBed.createComponent(AnfitrionComponent);
    await fixture.whenStable();
    const seccion = query(fixture, 'section.pe');
    const h1 = query(fixture, 'h1');
    expect(h1.textContent?.trim()).toBe('Sin permiso');
    expect(seccion.getAttribute('aria-labelledby')).toBe(h1.id);
    expect(query(fixture, '.pe__texto').textContent).toContain('Explicación');
    expect(query(fixture, '.extra').textContent).toContain('Más contexto');
    expect(query(fixture, '.pe__acciones button').textContent).toContain('Acción');
    expect(fixture.nativeElement.querySelector('.i-escudo')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.i-lupa')).toBeNull();
  });

  it('omite el código y el texto si no se indican', async () => {
    const fixture = TestBed.createComponent(MinimoComponent);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.pe__codigo')).toBeNull();
    expect(fixture.nativeElement.querySelector('.pe__texto')).toBeNull();
    expect(fixture.nativeElement.querySelector('.i-lupa')).not.toBeNull();
  });
});
