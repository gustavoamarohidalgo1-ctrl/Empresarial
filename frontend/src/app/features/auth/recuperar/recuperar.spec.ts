import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, escribir, query, texto } from '../../../../testing/dom';
import { CorreoRecordadoService } from '../compartido/correo-recordado';
import { MENSAJE_RECUPERACION_ENVIADA, RecuperarComponent } from './recuperar';

const URL = '/api/v1/auth/recuperacion';
const INFO = '/api/v1/sistema/info';

describe('RecuperarComponent', () => {
  let fixture: ComponentFixture<RecuperarComponent>;
  let http: HttpTestingController;
  let soltar: () => void;

  async function crear(entorno: 'desarrollo' | 'produccion' = 'produccion', correo?: string) {
    TestBed.configureTestingModule({
      imports: [RecuperarComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'token' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    if (correo) TestBed.inject(CorreoRecordadoService).recordar(correo);
    fixture = TestBed.createComponent(RecuperarComponent);
    soltar = adjuntar(fixture.nativeElement);
    http.expectOne(INFO).flush({ nombre: 'SIGA-SP', version: '1.1.0', entorno });
    await fixture.whenStable();
  }

  afterEach(() => {
    soltar();
    http.verify();
  });

  const correo = () => query<HTMLInputElement>(fixture, '#recuperar-email');
  async function enviar() {
    query<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('pide el correo con etiqueta visible y valida antes de enviar', async () => {
    await crear();
    expect(query(fixture, 'h1').textContent?.trim()).toBe('¿Olvidaste tu contraseña?');
    expect(query(fixture, 'label[for="recuperar-email"]').textContent).toContain('Correo');
    await enviar();
    expect(texto(fixture)).toContain('Escribe tu correo.');
    expect(document.activeElement).toBe(correo());
    http.expectNone(URL);
  });

  it('rechaza en el cliente un correo sin dominio completo («a@b»), como el servidor', async () => {
    await crear();
    escribir(correo(), 'a@b');
    await enviar();
    expect(texto(fixture)).toContain('Escribe un correo válido');
    http.expectNone(URL);
  });

  it('rellena el correo recordado de otra pantalla', async () => {
    await crear('produccion', 'ana@correo.test');
    expect(correo().value).toBe('ana@correo.test');
  });

  it('tras enviar muestra siempre la misma confirmación neutra y enfoca el título', async () => {
    await crear();
    escribir(correo(), ' ana@correo.test ');
    await enviar();
    expect(boton(fixture, /Enviar enlace/)?.disabled).toBe(true);
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ email: 'ana@correo.test' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Revisa tu correo');
    expect(document.activeElement).toBe(query(fixture, 'h1'));
    expect(texto(fixture)).toContain(MENSAJE_RECUPERACION_ENVIADA);
    expect(texto(fixture)).toContain('30 minutos');
    expect(enlace(fixture, /Volver a iniciar sesión/)?.getAttribute('href')).toBe('/login');
    // En producción no hay enlace al buzón simulado.
    expect(enlace(fixture, /buzón/i)).toBeUndefined();
  });

  it('en desarrollo ofrece un enlace discreto al buzón simulado', async () => {
    await crear('desarrollo');
    escribir(correo(), 'ana@correo.test');
    await enviar();
    http.expectOne(URL).flush(null, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();
    expect(enlace(fixture, 'Abrir buzón de correo simulado')?.getAttribute('href')).toBe(
      '/dev/buzon',
    );
    const aviso = fixture.nativeElement.querySelector('.recuperar__dev') as HTMLElement;
    expect(aviso.textContent).toContain('Entorno de desarrollo');
    expect(aviso.textContent).not.toMatch(/prueba|demo|piloto/i);
  });

  it('«Usar otro correo» vuelve al formulario con el foco en el campo', async () => {
    await crear();
    escribir(correo(), 'ana@correo.test');
    await enviar();
    http.expectOne(URL).flush(null, { status: 202, statusText: 'Accepted' });
    await fixture.whenStable();
    boton(fixture, 'Usar otro correo')!.click();
    await fixture.whenStable();
    expect(document.activeElement).toBe(correo());
  });

  it('429: muestra el mensaje del servidor y no la confirmación', async () => {
    await crear();
    escribir(correo(), 'ana@correo.test');
    await enviar();
    http
      .expectOne(URL)
      .flush(
        problema(429, 'DEMASIADOS_INTENTOS', { detail: 'Vuelve a intentarlo en 15 minutos.' }),
        opcionesProblema(429),
      );
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Demasiadas solicitudes');
    expect(texto(fixture)).toContain('Vuelve a intentarlo en 15 minutos.');
    expect(texto(fixture)).not.toContain(MENSAJE_RECUPERACION_ENVIADA);
    expect(document.activeElement).toBe(query(fixture, '.recuperar__avisos .foco-resultado'));
  });
});
