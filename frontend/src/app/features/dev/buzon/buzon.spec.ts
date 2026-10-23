import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, query, texto } from '../../../../testing/dom';
import { CorreoSimulado } from '../../../core/modelos/contrato';
import { BuzonComponent, rutaInterna } from './buzon';

const URL = '/api/v1/dev/correos';

function correo(parcial: Partial<CorreoSimulado> = {}): CorreoSimulado {
  return {
    id: 'm-1',
    destinatario: 'lucia.paredes@correo.test',
    asunto: 'Restablece tu contraseña de SIGA-SP',
    cuerpo: 'Hola, Lucía:\nUsa este enlace para crear una contraseña nueva.',
    enlace: '/restablecer?token=abc123',
    enviadoEn: '2026-10-23T14:00:00Z',
    ...parcial,
  };
}

describe('BuzonComponent', () => {
  let fixture: ComponentFixture<BuzonComponent>;
  let http: HttpTestingController;
  let soltar: () => void;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [BuzonComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(BuzonComponent);
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    soltar();
    http.verify();
  });

  it('muestra un esqueleto con tamaño reservado mientras carga y aclara que es de pruebas', () => {
    const ocupado = query(fixture, '.buzon[aria-busy="true"]');
    expect(ocupado.querySelector('[role="status"]')?.textContent).toContain('Cargando los correos');
    expect(ocupado.querySelectorAll('.buzon__lista[aria-hidden="true"] .tarjeta')).toHaveLength(3);
    expect(texto(fixture)).toContain('Este es un buzón de pruebas');
    expect(texto(fixture)).toContain('no se envía ningún correo real');
    http.expectOne(URL).flush([]);
  });

  it('lista los correos (más reciente primero) con asunto, destinatario, fecha y cuerpo', async () => {
    http
      .expectOne(URL)
      .flush([
        correo({ id: 'viejo', asunto: 'Anterior', enviadoEn: '2026-10-22T10:00:00Z' }),
        correo(),
      ]);
    await fixture.whenStable();
    const asuntos = Array.from(fixture.nativeElement.querySelectorAll('h2')).map((h) =>
      (h as HTMLElement).textContent!.trim(),
    );
    expect(asuntos).toEqual(['Restablece tu contraseña de SIGA-SP', 'Anterior']);
    const primero = query(fixture, 'article');
    expect(primero.getAttribute('aria-labelledby')).toBe('correo-m-1');
    expect(primero.textContent).toContain('lucia.paredes@correo.test');
    expect(primero.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-23T14:00:00Z');
    expect(primero.textContent).toContain('23 oct 2026');
    expect(primero.querySelector('.buzon__cuerpo')?.textContent).toContain('Usa este enlace');
    expect(texto(fixture)).toContain('2 correos en el buzón.');
  });

  it('«Abrir enlace» lleva a la ruta interna del correo', async () => {
    http.expectOne(URL).flush([correo()]);
    await fixture.whenStable();
    const abrir = enlace(fixture, /Abrir enlace/)!;
    expect(abrir.getAttribute('href')).toBe('/restablecer?token=abc123');
    expect(abrir.textContent).toContain('del correo «Restablece tu contraseña de SIGA-SP»');
  });

  it('no ofrece enlaces externos ni sin enlace', async () => {
    http
      .expectOne(URL)
      .flush([
        correo({ id: 'a', enlace: 'https://otro.sitio/robar' }),
        correo({ id: 'b', enlace: '//otro.sitio' }),
        correo({ id: 'c', enlace: null }),
      ]);
    await fixture.whenStable();
    expect(enlace(fixture, /Abrir enlace/)).toBeUndefined();
  });

  it('un correo guardado sin contenido (cuerpo y enlace nulos) lo explica y no ofrece enlace', async () => {
    http.expectOne(URL).flush([correo({ cuerpo: null, enlace: null })]);
    await fixture.whenStable();
    expect(query(fixture, '.buzon__cuerpo').textContent).toContain(
      'No se guardó el contenido de este correo',
    );
    expect(enlace(fixture, /Abrir enlace/)).toBeUndefined();
  });

  it('sin correos muestra un estado vacío con un CTA', async () => {
    http.expectOne(URL).flush([]);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Aún no hay correos');
    expect(enlace(fixture, /Solicitar recuperación/)?.getAttribute('href')).toBe('/recuperar');
  });

  it('404 (producción): muestra «No disponible»', async () => {
    http.expectOne(URL).flush(problema(404, 'RECURSO_NO_ENCONTRADO'), opcionesProblema(404));
    await fixture.whenStable();
    expect(query(fixture, 'h2').textContent?.trim()).toBe('No disponible');
    expect(texto(fixture)).toContain('solo existe en el entorno de desarrollo');
  });

  it('otro error permite reintentar', async () => {
    http.expectOne(URL).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No pudimos cargar el buzón');
    boton(fixture, /Reintentar/)!.click();
    await fixture.whenStable();
    http.expectOne(URL).flush([correo()]);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('1 correo en el buzón.');
  });

  it('«Actualizar» vuelve a pedir la lista sin esqueleto y enfoca el resumen', async () => {
    http.expectOne(URL).flush([correo()]);
    await fixture.whenStable();
    boton(fixture, /Actualizar/)!.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.buzon__lista[aria-hidden="true"]')).toBeNull();
    http.expectOne(URL).flush([correo(), correo({ id: 'm-2' })]);
    await fixture.whenStable();
    expect(document.activeElement).toBe(query(fixture, '.buzon__estado'));
    expect(texto(fixture)).toContain('2 correos en el buzón.');
  });
});

describe('rutaInterna', () => {
  it('solo acepta rutas internas de la app', () => {
    const router = TestBed.inject(Router);
    expect(rutaInterna(router, '/restablecer?token=x')?.queryParams).toEqual({ token: 'x' });
    expect(rutaInterna(router, 'https://otro.sitio')).toBeNull();
    expect(rutaInterna(router, '//otro.sitio')).toBeNull();
    expect(rutaInterna(router, '/\\otro.sitio')).toBeNull();
    expect(rutaInterna(router, null)).toBeNull();
  });
});
