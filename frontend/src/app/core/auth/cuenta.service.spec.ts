import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { opcionesProblema, problema } from '../../../testing/datos-prueba';
import { CuerpoRegistro, UsuarioSesion } from '../modelos/contrato';
import { AuthService } from './auth.service';
import { CuentaService } from './cuenta.service';

const NUEVO: UsuarioSesion = {
  id: 'u-9',
  nombre: 'Lucía Paredes Rojas',
  email: 'lucia.paredes@correo.test',
  rol: 'PACIENTE',
};

const REGISTRO: CuerpoRegistro = {
  nombres: 'Lucía',
  apellidos: 'Paredes Rojas',
  email: 'lucia.paredes@correo.test',
  telefono: '+51 987 654 321',
  password: 'Clave-Segura-2026',
  aceptaPrivacidad: true,
};

describe('CuentaService', () => {
  let http: HttpTestingController;
  let token: string | null;

  beforeEach(() => {
    token = 'xsrf';
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => token } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('registrar: POST /auth/registro y deja la sesión iniciada con el usuario devuelto', () => {
    const cuenta = TestBed.inject(CuentaService);
    let recibido: UsuarioSesion | undefined;
    cuenta.registrar(REGISTRO).subscribe((u) => (recibido = u));
    const req = http.expectOne('/api/v1/auth/registro');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(REGISTRO);
    req.flush(NUEVO, { status: 201, statusText: 'Created' });
    expect(recibido).toEqual(NUEVO);
    expect(TestBed.inject(AuthService).usuario()).toEqual(NUEVO);
  });

  it('pide el token CSRF antes si la cookie aún no existe', () => {
    token = null;
    TestBed.inject(CuentaService).solicitarRecuperacion('ana@correo.test').subscribe();
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 't' });
    const req = http.expectOne('/api/v1/auth/recuperacion');
    expect(req.request.body).toEqual({ email: 'ana@correo.test' });
    req.flush(null, { status: 202, statusText: 'Accepted' });
  });

  it('ante CSRF_INVALIDO renueva el token y reintenta una sola vez', () => {
    let completado = false;
    TestBed.inject(CuentaService)
      .restablecer({ token: 'abc', password: 'Nueva-Clave-2026' })
      .subscribe({ complete: () => (completado = true) });
    http
      .expectOne('/api/v1/auth/restablecer')
      .flush(problema(403, 'CSRF_INVALIDO'), opcionesProblema(403));
    http.expectOne('/api/v1/auth/csrf').flush({ headerName: 'X-XSRF-TOKEN', token: 't' });
    http
      .expectOne('/api/v1/auth/restablecer')
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(completado).toBe(true);
  });

  it('propaga los demás errores sin tocar la sesión', () => {
    let codigo: number | undefined;
    TestBed.inject(CuentaService)
      .registrar(REGISTRO)
      .subscribe({ error: (e) => (codigo = e.status) });
    http
      .expectOne('/api/v1/auth/registro')
      .flush(problema(409, 'CORREO_REGISTRADO'), opcionesProblema(409));
    expect(codigo).toBe(409);
    expect(TestBed.inject(AuthService).usuario()).toBeNull();
  });

  it('cambiarContrasena: POST /cuenta/contrasena con la actual y la nueva', () => {
    TestBed.inject(CuentaService).cambiarContrasena({ actual: 'a', nueva: 'b' }).subscribe();
    const req = http.expectOne('/api/v1/cuenta/contrasena');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ actual: 'a', nueva: 'b' });
    req.flush(null, { status: 204, statusText: 'No Content' });
  });
});
