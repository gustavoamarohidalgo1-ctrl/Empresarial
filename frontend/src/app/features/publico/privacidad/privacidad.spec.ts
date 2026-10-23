import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { enlace, query, texto } from '../../../../testing/dom';
import { INDICE_PRIVACIDAD, PrivacidadComponent, VERSION_PRIVACIDAD } from './privacidad';

describe('PrivacidadComponent', () => {
  let fixture: ComponentFixture<PrivacidadComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PrivacidadComponent],
      providers: [provideRouter([])],
    });
    fixture = TestBed.createComponent(PrivacidadComponent);
    await fixture.whenStable();
  });

  it('es la política de SIGA-SP con un índice que apunta a cada sección', () => {
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Política de privacidad');
    for (const entrada of INDICE_PRIVACIDAD) {
      const destino = query(fixture, `#${entrada.id}`);
      expect(destino.tagName).toBe('H2');
      expect(destino.getAttribute('tabindex')).toBe('-1');
    }
    expect(fixture.nativeElement.querySelectorAll('.doc__indice li')).toHaveLength(
      INDICE_PRIVACIDAD.length,
    );
  });

  it('cubre datos, finalidades, base legal, derechos ARCO, conservación y seguridad', () => {
    const t = texto(fixture);
    expect(t).toContain('Ley N.º 29733');
    expect(t).toContain('D.S. N.º 016-2024-JUS');
    expect(t).toContain('consentimiento');
    for (const derecho of ['Acceso', 'Rectificación', 'Cancelación', 'Oposición']) {
      expect(t).toContain(derecho);
    }
    expect(t).toContain('Autoridad Nacional de Protección de Datos Personales');
    expect(t).toContain('30 minutos');
    expect(t).toContain('cookies técnicas');
    expect(enlace(fixture, 'Mi perfil')?.getAttribute('href')).toBe('/paciente/perfil');
  });

  it('no usa lenguaje de prueba ni de piloto', () => {
    expect(texto(fixture)).not.toMatch(/\bdemo\b|prueba|piloto/i);
  });

  it('muestra la versión vigente: «Versión 1.0 · vigente desde el 23 de octubre de 2026»', () => {
    expect(VERSION_PRIVACIDAD).toEqual({ numero: '1.0', vigenteDesde: '23 de octubre de 2026' });
    expect(query(fixture, '.doc__meta').textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Versión 1.0 · vigente desde el 23 de octubre de 2026',
    );
    expect(texto(fixture)).toContain('Guardamos la fecha en que lo diste y la versión');
  });

  it('reconoce la especialidad y los datos de atención como datos sensibles de salud', () => {
    const seccion = query(fixture, 'section[aria-labelledby="privacidad-sensibles"]');
    const t = seccion.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('Ley N.º 29733');
    expect(t).toContain('datos sensibles');
    expect(t).toContain('especialidad');
    expect(t).toContain('datos de tu atención');
    expect(t).toContain('consentimiento expreso y por escrito');
    expect(t).toContain('acceso restringido');
    expect(t).toContain('no almacena tu historia clínica');
  });

  it('habla de contraseñas protegidas con hash, no «cifradas»', () => {
    const t = texto(fixture);
    expect(t).toContain('protegida con hash');
    expect(t).not.toMatch(/contraseña[^.]*cifrad/i);
  });
});
