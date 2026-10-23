import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PACIENTE, opcionesProblema, problema } from '../../../testing/datos-prueba';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let servicio: AuthService;
  let http: HttpTestingController;
  let token: string | null;

  beforeEach(() => {
    token = null;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => token } },
      ],
    });
    servicio = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide el token CSRF antes del login si aún no existe y no lo vuelve a pedir después', () => {
    let usuario: unknown;
    servicio
      .login({ email: 'ana.demo@ejemplo.invalid', password: 'x' })
      .subscribe((u) => (usuario = u));

    http
      .expectOne({ method: 'GET', url: '/api/v1/auth/csrf' })
      .flush({ headerName: 'X-XSRF-TOKEN', token: 't1' });
    const login = http.expectOne({ method: 'POST', url: '/api/v1/auth/login' });
    expect(login.request.body).toEqual({ email: 'ana.demo@ejemplo.invalid', password: 'x' });
    login.flush(PACIENTE);
    // docs/api.md: el token sigue siendo válido después del login.
    http.expectNone('/api/v1/auth/csrf');

    expect(usuario).toEqual(PACIENTE);
    expect(servicio.usuario()).toEqual(PACIENTE);
    expect(servicio.autenticado()).toBe(true);
  });

  it('no pide el token antes del login si la cookie ya existe', () => {
    token = 'existente';
    servicio.login({ email: 'a@b.pe', password: 'x' }).subscribe();
    http.expectOne({ method: 'POST', url: '/api/v1/auth/login' }).flush(PACIENTE);
    http.expectNone('/api/v1/auth/csrf');
    expect(servicio.usuario()?.rol).toBe('PACIENTE');
  });

  it('renueva el CSRF y reintenta una vez si el login responde CSRF_INVALIDO', () => {
    token = 'viejo';
    servicio.login({ email: 'a@b.pe', password: 'x' }).subscribe();
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/login' })
      .flush(problema(403, 'CSRF_INVALIDO'), opcionesProblema(403));
    http.expectOne('/api/v1/auth/csrf').flush({});
    http.expectOne({ method: 'POST', url: '/api/v1/auth/login' }).flush(PACIENTE);
    expect(servicio.usuario()).toEqual(PACIENTE);
  });

  it('propaga el 401 del login sin guardar sesión', () => {
    token = 't';
    let status = 0;
    servicio
      .login({ email: 'a@b.pe', password: 'mal' })
      .subscribe({ error: (e) => (status = e.status) });
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/login' })
      .flush(problema(401, 'CREDENCIALES_INVALIDAS'), opcionesProblema(401));
    expect(status).toBe(401);
    expect(servicio.usuario()).toBeNull();
  });

  it('verificarSesion consulta GET /auth/sesion una sola vez aunque la pidan varias guardas', () => {
    const resultados: unknown[] = [];
    servicio.verificarSesion().subscribe((u) => resultados.push(u));
    servicio.verificarSesion().subscribe((u) => resultados.push(u));
    http.expectOne({ method: 'GET', url: '/api/v1/auth/sesion' }).flush(PACIENTE);
    expect(resultados).toEqual([PACIENTE, PACIENTE]);

    // Ya conocida: no vuelve a pedirla.
    servicio.verificarSesion().subscribe((u) => resultados.push(u));
    http.expectNone('/api/v1/auth/sesion');
    expect(resultados.length).toBe(3);
  });

  it('verificarSesion devuelve null ante 401', () => {
    let resultado: unknown = 'sin-valor';
    servicio.verificarSesion().subscribe((u) => (resultado = u));
    http
      .expectOne('/api/v1/auth/sesion')
      .flush(problema(401, 'NO_AUTENTICADO'), opcionesProblema(401));
    expect(resultado).toBeNull();
    expect(servicio.autenticado()).toBe(false);
  });

  function iniciarSesion() {
    servicio.verificarSesion().subscribe();
    http.expectOne('/api/v1/auth/sesion').flush(PACIENTE);
  }

  it('logout con 204 limpia la sesión local antes de emitir', () => {
    iniciarSesion();
    let usuarioAlEmitir: unknown = 'sin-valor';
    servicio.logout().subscribe(() => (usuarioAlEmitir = servicio.usuario()));
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/logout' })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(usuarioAlEmitir).toBeNull();
    expect(servicio.usuario()).toBeNull();
  });

  it('logout con 401 también da la sesión por cerrada (ya no existía en el servidor)', () => {
    iniciarSesion();
    let completado = false;
    servicio.logout().subscribe(() => (completado = true));
    http
      .expectOne('/api/v1/auth/logout')
      .flush(problema(401, 'NO_AUTENTICADO'), opcionesProblema(401));
    expect(completado).toBe(true);
    expect(servicio.usuario()).toBeNull();
  });

  it('logout con 403 CSRF_INVALIDO renueva el token y reintenta una vez', () => {
    iniciarSesion();
    let completado = false;
    servicio.logout().subscribe(() => (completado = true));
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/logout' })
      .flush(problema(403, 'CSRF_INVALIDO'), opcionesProblema(403));
    http.expectOne({ method: 'GET', url: '/api/v1/auth/csrf' }).flush({});
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/logout' })
      .flush(null, { status: 204, statusText: 'No Content' });
    expect(completado).toBe(true);
    expect(servicio.usuario()).toBeNull();
  });

  it('logout con otro error conserva la sesión local y propaga el error', () => {
    iniciarSesion();
    let status = 0;
    let completado = false;
    servicio.logout().subscribe({
      next: () => (completado = true),
      error: (e) => (status = e.status),
    });
    http.expectOne('/api/v1/auth/logout').flush(null, { status: 500, statusText: 'Error' });
    expect(completado).toBe(false);
    expect(status).toBe(500);
    expect(servicio.usuario()).toEqual(PACIENTE);
  });

  it('revalidarSesion descarta el usuario en caché y lo vuelve a pedir', () => {
    iniciarSesion();
    let resultado: unknown;
    servicio.revalidarSesion().subscribe((u) => (resultado = u));
    http.expectOne('/api/v1/auth/sesion').flush({ ...PACIENTE, rol: 'OPERADOR' });
    expect((resultado as { rol: string }).rol).toBe('OPERADOR');
    expect(servicio.usuario()?.rol).toBe('OPERADOR');
  });
});
