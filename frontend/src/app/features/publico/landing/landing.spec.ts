import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { enlaces, query, texto } from '../../../../testing/dom';
import { BENEFICIOS, CONFIANZA, PASOS, PREGUNTAS } from './contenido';
import { LandingComponent } from './landing';

describe('LandingComponent', () => {
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [LandingComponent], providers: [provideRouter([])] });
    fixture = TestBed.createComponent(LandingComponent);
    await fixture.whenStable();
  });

  const raiz = () => fixture.nativeElement as HTMLElement;
  const destinos = (patron: RegExp) =>
    enlaces(fixture)
      .filter((a) => patron.test(a.textContent ?? ''))
      .map((a) => a.getAttribute('href'));

  it('tiene un único h1 con el titular y las llamadas a crear cuenta e iniciar sesión', () => {
    const h1 = raiz().querySelectorAll('h1');
    expect(h1).toHaveLength(1);
    expect(h1[0].textContent).toContain('Reserva y gestiona tus citas médicas');
    expect(destinos(/Crear cuenta/)).toContain('/registro');
    expect(destinos(/Iniciar sesión|Ya tengo cuenta/)).toContain('/login');
  });

  it('incluye una ilustración propia y decorativa', () => {
    const svg = query(fixture, 'app-ilustracion-hero svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  it('presenta beneficios, «Cómo funciona» en 3 pasos y la sección de confianza', () => {
    expect(raiz().querySelectorAll('.beneficio')).toHaveLength(BENEFICIOS.length);
    const pasos = Array.from(raiz().querySelectorAll('ol.pasos > li'));
    expect(PASOS.map((p) => p.titulo)).toEqual([
      'Reserva',
      'Confirma o reprograma',
      'Llega y atiéndete',
    ]);
    expect(pasos).toHaveLength(3);
    expect(pasos[0].querySelector('h3')?.textContent).toContain('Paso 1: Reserva');
    expect(raiz().querySelectorAll('.confianza__item')).toHaveLength(CONFIANZA.length);
    expect(texto(fixture)).toContain('Ley N.º 29733');
    expect(texto(fixture)).toContain('WCAG 2.2');
    expect(destinos(/política de privacidad/i)).toContain('/privacidad');
    expect(destinos(/accesibilidad/i)).toContain('/accesibilidad');
  });

  it('cada sección está nombrada por su encabezado', () => {
    const secciones = Array.from(raiz().querySelectorAll('section'));
    expect(secciones.length).toBeGreaterThanOrEqual(6);
    for (const s of secciones) {
      const id = s.getAttribute('aria-labelledby')!;
      expect(raiz().querySelector(`#${id}`)?.matches('h1, h2')).toBe(true);
    }
  });

  it('las preguntas frecuentes usan <details> nativo', () => {
    const detalles = raiz().querySelectorAll('details.pregunta');
    expect(detalles).toHaveLength(PREGUNTAS.length);
    expect(detalles[0].querySelector('summary')?.textContent).toContain(PREGUNTAS[0].pregunta);
  });

  it('describe las contraseñas como protegidas con hash, no «cifradas»', () => {
    expect(texto(fixture)).toContain('Contraseñas protegidas con hash');
    expect(texto(fixture)).not.toMatch(/contraseñas cifradas/i);
  });

  it('no usa la palabra demo, prueba ni piloto ni el nombre de una clínica real', () => {
    expect(texto(fixture)).not.toMatch(/demo|prueba|piloto|clínica/i);
    expect(texto(fixture)).toContain('SIGA-SP');
  });
});
