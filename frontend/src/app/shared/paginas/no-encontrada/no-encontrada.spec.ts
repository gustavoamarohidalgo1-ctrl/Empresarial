import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { enlace, query, texto } from '../../../../testing/dom';
import { NoEncontradaComponent } from './no-encontrada';

describe('NoEncontradaComponent', () => {
  it('explica que la dirección no existe y ofrece volver al inicio', async () => {
    TestBed.configureTestingModule({
      imports: [NoEncontradaComponent],
      providers: [provideRouter([])],
    });
    const fixture = TestBed.createComponent(NoEncontradaComponent);
    await fixture.whenStable();

    expect(query(fixture, 'h1').textContent?.trim()).toBe('Página no encontrada');
    expect(texto(fixture)).toContain('Error 404');
    expect(texto(fixture)).toContain('La dirección que abriste no existe en SIGA-SP.');
    const a = enlace(fixture, 'Ir al inicio');
    expect(a?.getAttribute('href')).toBe('/');
    expect(a?.classList).toContain('btn--primario');
    expect(query(fixture, 'svg.pe__ilustracion').getAttribute('aria-hidden')).toBe('true');
    expect(fixture.nativeElement.querySelector('.i-lupa')).not.toBeNull();
  });
});
