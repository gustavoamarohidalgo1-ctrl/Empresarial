import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, escribir, query, texto } from '../../../../testing/dom';
import { MENSAJES_CLAVE } from '../../auth/compartido/politica-contrasena';
import { MENSAJES_SEGURIDAD, SeguridadCuentaComponent } from './seguridad-cuenta';

const URL = '/api/v1/cuenta/contrasena';
const NUEVA = 'Valle-de-Lurin-2026';

describe('SeguridadCuentaComponent', () => {
  let fixture: ComponentFixture<SeguridadCuentaComponent>;
  let http: HttpTestingController;
  let soltar: () => void;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [SeguridadCuentaComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'token' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(SeguridadCuentaComponent);
    fixture.componentRef.setInput('correo', 'ana2026@correo.test');
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    soltar();
    http.verify();
  });

  const campo = (id: string) => query<HTMLInputElement>(fixture, `#seguridad-${id}`);
  async function abrir() {
    boton(fixture, 'Cambiar contraseña')!.click();
    await fixture.whenStable();
  }
  function llenar(actual = 'Clave-Anterior-1', nueva = NUEVA, confirmacion = nueva) {
    escribir(campo('actual'), actual);
    escribir(campo('nueva'), nueva);
    escribir(campo('confirmacion'), confirmacion);
  }
  async function guardar() {
    query<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('presenta la sección «Contraseña» y abre el formulario con el foco en la contraseña actual', async () => {
    expect(query(fixture, 'h2').textContent?.trim()).toBe('Contraseña');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    await abrir();
    expect(document.activeElement).toBe(campo('actual'));
    expect(campo('actual').getAttribute('autocomplete')).toBe('current-password');
    expect(campo('nueva').getAttribute('autocomplete')).toBe('new-password');
    expect(query(fixture, 'label[for="seguridad-confirmacion"]').textContent).toContain(
      'Confirma la nueva contraseña',
    );
  });

  it('valida en el cliente, con la regla del correo, y no llama a la API', async () => {
    await abrir();
    llenar('', 'Ana2026@correo.test', 'x');
    await guardar();
    expect(query(fixture, '#seguridad-actual-error').textContent).toContain(
      MENSAJES_SEGURIDAD.actualRequerida,
    );
    expect(query(fixture, '#seguridad-nueva-error').textContent).toContain(MENSAJES_CLAVE.correo);
    expect(query(fixture, '#seguridad-confirmacion-error').textContent).toContain(
      'Las contraseñas no coinciden.',
    );
    expect(document.activeElement).toBe(campo('actual'));
    http.expectNone(URL);
  });

  it('cambia la contraseña, cierra el formulario y enfoca el aviso de éxito', async () => {
    await abrir();
    llenar();
    await guardar();
    expect(boton(fixture, /Guardar contraseña/)?.disabled).toBe(true);
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ actual: 'Clave-Anterior-1', nueva: NUEVA });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(texto(fixture)).toContain('Contraseña actualizada');
    expect(texto(fixture)).toContain(MENSAJES_SEGURIDAD.exito);
    expect(document.activeElement).toBe(query(fixture, '.seguridad__resultado'));
  });

  it('la regla del correo incluye lo que va antes de la @', async () => {
    fixture.componentRef.setInput('correo', 'ana2026xyz@correo.test');
    await abrir();
    llenar('Clave-Anterior-1', 'Ana2026xyz');
    await guardar();
    expect(query(fixture, '#seguridad-nueva-error').textContent).toContain(MENSAJES_CLAVE.correo);
    http.expectNone(URL);
  });

  it('429 DEMASIADOS_INTENTOS (bloqueo): avisa con el tiempo de espera y cierra el formulario', async () => {
    await abrir();
    llenar();
    await guardar();
    http.expectOne(URL).flush(
      problema(429, 'DEMASIADOS_INTENTOS', {
        detail:
          'Hiciste demasiadas solicitudes de cambio de contraseña. Inténtalo nuevamente en 15 minutos.',
      }),
      opcionesProblema(429, 'Too Many Requests'),
    );
    await fixture.whenStable();
    const aviso = query(fixture, '.seguridad__resultado');
    expect(aviso.querySelector('.aviso--advertencia')).not.toBeNull();
    expect(aviso.textContent).toContain('Demasiados intentos');
    expect(aviso.textContent).toContain(MENSAJES_SEGURIDAD.bloqueo);
    expect(aviso.textContent).toContain('Inténtalo nuevamente en 15 minutos.');
    expect(aviso.textContent).toContain('Tu contraseña no cambió.');
    expect(document.activeElement).toBe(aviso);
    // Sin contraseñas escritas ni el error de «Contraseña actual» (el bloqueo no dice nada de ella).
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="password"]')).toBeNull();
    expect(texto(fixture)).not.toContain(MENSAJES_SEGURIDAD.actualIncorrecta);

    // Se puede volver a intentar más tarde, con el formulario vacío.
    await abrir();
    expect(campo('actual').value).toBe('');
    expect(campo('nueva').value).toBe('');
  });

  it('429 sin detalle del servidor usa el mensaje genérico de demasiados intentos', async () => {
    await abrir();
    llenar();
    await guardar();
    http.expectOne(URL).flush(null, { status: 429, statusText: 'Too Many Requests' });
    await fixture.whenStable();
    expect(query(fixture, '.seguridad__resultado').textContent).toContain('demasiados intentos');
  });

  it('422 CONTRASENA_INCORRECTA: lo indica junto a «Contraseña actual» y la vacía', async () => {
    await abrir();
    llenar();
    await guardar();
    http.expectOne(URL).flush(problema(422, 'CONTRASENA_INCORRECTA'), opcionesProblema(422));
    await fixture.whenStable();
    expect(query(fixture, '#seguridad-actual-error').textContent).toContain(
      MENSAJES_SEGURIDAD.actualIncorrecta,
    );
    expect(campo('actual').value).toBe('');
    expect(campo('actual').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(campo('actual'));
  });

  it('400 VALIDACION: muestra errores[] de «nueva» junto al campo', async () => {
    await abrir();
    llenar();
    await guardar();
    http.expectOne(URL).flush(
      problema(400, 'VALIDACION', {
        errores: [{ campo: 'nueva', mensaje: 'La contraseña es demasiado común' }],
      }),
      opcionesProblema(400),
    );
    await fixture.whenStable();
    expect(query(fixture, '#seguridad-nueva-error').textContent).toContain(
      'La contraseña es demasiado común',
    );
    expect(document.activeElement).toBe(campo('nueva'));
  });

  it('otros errores se anuncian sin cerrar el formulario', async () => {
    await abrir();
    llenar();
    await guardar();
    http.expectOne(URL).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No se cambió la contraseña');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
  });

  it('Cancelar cierra el formulario y devuelve el foco a «Cambiar contraseña»', async () => {
    await abrir();
    boton(fixture, 'Cancelar')!.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(document.activeElement).toBe(boton(fixture, 'Cambiar contraseña'));
  });
});
