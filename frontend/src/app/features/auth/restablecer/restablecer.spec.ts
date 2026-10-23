import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { PACIENTE, adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, escribir, query, texto } from '../../../../testing/dom';
import { AuthService } from '../../../core/auth/auth.service';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { UsuarioSesion } from '../../../core/modelos/contrato';
import { MENSAJES_CLAVE } from '../compartido/politica-contrasena';
import { MENSAJE_CLAVE_RESTABLECIDA, RestablecerComponent } from './restablecer';

const URL = '/api/v1/auth/restablecer';
const CLAVE = 'Valle-de-Lurin-2026';

describe('RestablecerComponent', () => {
  let fixture: ComponentFixture<RestablecerComponent>;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.spyOn>;
  let quitarToken: ReturnType<typeof vi.spyOn>;
  let soltar: () => void;

  async function crear(token: string | undefined, usuario: UsuarioSesion | null = null) {
    TestBed.configureTestingModule({
      imports: [RestablecerComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'token' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    if (usuario) TestBed.inject(AuthService).establecerSesion(usuario);
    const router = TestBed.inject(Router);
    quitarToken = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    navegar = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(RestablecerComponent);
    fixture.componentRef.setInput('token', token);
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
  }

  afterEach(() => {
    soltar();
    http.verify();
  });

  const campo = (id: string) => query<HTMLInputElement>(fixture, `#restablecer-${id}`);
  function llenar(clave = CLAVE, confirmacion = clave) {
    escribir(campo('password'), clave);
    escribir(campo('confirmacion'), confirmacion);
  }
  async function enviar() {
    query<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('sin token explica que el enlace no es válido y ofrece pedir otro', async () => {
    await crear(undefined);
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Este enlace ya no es válido');
    expect(enlace(fixture, /Pedir otro enlace/)?.getAttribute('href')).toBe('/recuperar');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
    expect(quitarToken).not.toHaveBeenCalled(); // no hay nada que quitar de la URL
  });

  it('al abrir, guarda el token en memoria y lo quita de la URL reemplazando el historial', async () => {
    await crear('abc');
    expect(quitarToken).toHaveBeenCalledTimes(1);
    const [comandos, extras] = quitarToken.mock.calls[0] as [unknown[], Record<string, unknown>];
    expect(comandos).toEqual([]);
    expect(extras).toMatchObject({ queryParams: {}, replaceUrl: true });
    expect(extras['relativeTo']).toBeDefined(); // se queda en /restablecer

    // El router vuelve a enlazar la entrada sin el parámetro: el formulario sigue y usa el token
    // guardado.
    fixture.componentRef.setInput('token', undefined);
    await fixture.whenStable();
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Crea una contraseña nueva');
    llenar();
    await enviar();
    expect(http.expectOne(URL).request.body).toEqual({ token: 'abc', password: CLAVE });
  });

  it('un token vacío (?token=) también se quita de la URL y se trata como inválido', async () => {
    await crear('  ');
    expect(quitarToken).toHaveBeenCalledTimes(1);
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Este enlace ya no es válido');
  });

  it('pide la nueva contraseña con medidor y confirmación', async () => {
    await crear('abc');
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Crea una contraseña nueva');
    expect(campo('password').getAttribute('autocomplete')).toBe('new-password');
    escribir(campo('password'), 'corta1');
    await fixture.whenStable();
    expect(query(fixture, '#restablecer-clave-nivel').textContent).toContain('Débil');
    await enviar();
    expect(query(fixture, '#restablecer-password-error').textContent).toContain(
      MENSAJES_CLAVE.longitud,
    );
    expect(document.activeElement).toBe(campo('password'));
    http.expectNone(URL);
  });

  it('valida que la confirmación coincida', async () => {
    await crear('abc');
    llenar(CLAVE, 'Otra-Clave-2026');
    await enviar();
    expect(texto(fixture)).toContain('Las contraseñas no coinciden.');
    http.expectNone(URL);
  });

  it('al guardar va a /login con un aviso de éxito', async () => {
    await crear('abc');
    llenar();
    await enviar();
    expect(boton(fixture, /Guardar contraseña/)?.disabled).toBe(true);
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ token: 'abc', password: CLAVE });
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith('/login');
    expect(TestBed.inject(AvisoFlashService).consumir()).toEqual({
      tipo: 'exito',
      texto: MENSAJE_CLAVE_RESTABLECIDA,
    });
  });

  it('con sesión abierta la limpia (el servidor ya la revocó) y va a /login con el aviso', async () => {
    await crear('abc', PACIENTE);
    const auth = TestBed.inject(AuthService);
    const limpiar = vi.spyOn(auth, 'limpiarSesion');
    llenar();
    await enviar();
    http.expectOne(URL).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(limpiar).toHaveBeenCalled();
    expect(auth.usuario()).toBeNull();
    expect(navegar).toHaveBeenCalledTimes(1);
    expect(navegar).toHaveBeenCalledWith('/login');
    expect(TestBed.inject(AvisoFlashService).consumir()).toEqual({
      tipo: 'exito',
      texto: MENSAJE_CLAVE_RESTABLECIDA,
    });
  });

  it('422 ENLACE_INVALIDO: cambia a la explicación con el CTA y enfoca el título', async () => {
    await crear('vencido');
    llenar();
    await enviar();
    http.expectOne(URL).flush(problema(422, 'ENLACE_INVALIDO'), opcionesProblema(422));
    await fixture.whenStable();
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Este enlace ya no es válido');
    expect(document.activeElement).toBe(query(fixture, 'h1'));
    expect(enlace(fixture, /Pedir otro enlace/)).toBeDefined();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('400 VALIDACION: muestra el error del servidor junto a la contraseña', async () => {
    await crear('abc');
    llenar();
    await enviar();
    http.expectOne(URL).flush(
      problema(400, 'VALIDACION', {
        errores: [{ campo: 'password', mensaje: 'La contraseña es demasiado común' }],
      }),
      opcionesProblema(400),
    );
    await fixture.whenStable();
    expect(query(fixture, '#restablecer-password-error').textContent).toContain(
      'La contraseña es demasiado común',
    );
    expect(document.activeElement).toBe(campo('password'));
  });

  it('otros errores se anuncian en un aviso', async () => {
    await crear('abc');
    llenar();
    await enviar();
    http.expectOne(URL).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    const avisos = query(fixture, '.restablecer__avisos');
    expect(avisos.getAttribute('aria-live')).toBe('polite');
    expect(avisos.textContent).toContain('No pudimos actualizar tu contraseña');
  });
});
