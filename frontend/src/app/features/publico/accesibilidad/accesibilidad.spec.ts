import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { enlace, query, texto } from '../../../../testing/dom';
import { AccesibilidadComponent, INDICE_ACCESIBILIDAD } from './accesibilidad';

describe('AccesibilidadComponent', () => {
  let fixture: ComponentFixture<AccesibilidadComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [AccesibilidadComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(AccesibilidadComponent);
    await fixture.whenStable();
  });

  it('declara el compromiso WCAG 2.2 AA, las funciones y cómo reportar una barrera', () => {
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Accesibilidad');
    const t = texto(fixture);
    expect(t).toContain('WCAG) 2.2, nivel AA');
    expect(t).toContain('Saltar al contenido');
    expect(t).toContain('4,5:1');
    expect(t).toContain('Reporta una barrera');
    for (const entrada of INDICE_ACCESIBILIDAD) {
      expect(query(fixture, `#${entrada.id}`).tagName).toBe('H2');
    }
    expect(enlace(fixture, 'política de privacidad')?.getAttribute('href')).toBe('/privacidad');
    expect(t).not.toMatch(/demo|piloto/i);
  });
});
