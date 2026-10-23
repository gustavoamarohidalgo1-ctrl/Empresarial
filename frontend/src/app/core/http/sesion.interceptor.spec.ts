import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { opcionesProblema, problema } from '../../../testing/datos-prueba';
import { AuthService } from '../auth/auth.service';
import { sesionInterceptor } from './sesion.interceptor';

describe('sesionInterceptor', () => {
  let http: HttpClient;
  let control: HttpTestingController;
  let router: Router;
  let navegar: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([sesionInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    control = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => control.verify());

  it('ante 401 fuera del login limpia la sesión y vuelve a /login', () => {
    const limpiar = vi.spyOn(TestBed.inject(AuthService), 'limpiarSesion');
    let status = 0;
    http.get('/api/v1/pacientes/me/citas').subscribe({ error: (e) => (status = e.status) });
    control
      .expectOne('/api/v1/pacientes/me/citas')
      .flush(problema(401, 'NO_AUTENTICADO'), opcionesProblema(401));
    expect(status).toBe(401);
    expect(limpiar).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/login'], { queryParams: { sesion: 'expirada' } });
  });

  it('no redirige ante el 401 del propio login', () => {
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    control
      .expectOne('/api/v1/auth/login')
      .flush(problema(401, 'CREDENCIALES_INVALIDAS'), opcionesProblema(401));
    expect(navegar).not.toHaveBeenCalled();
  });

  it('ante 403 vuelve a verificar la sesión (rol en caché) y muestra acceso denegado', () => {
    const auth = TestBed.inject(AuthService);
    auth.verificarSesion().subscribe();
    control
      .expectOne('/api/v1/auth/sesion')
      .flush({ id: 'u', nombre: 'Ana', email: 'a@b.pe', rol: 'PACIENTE' });

    http.get('/api/v1/pacientes/me/citas').subscribe({ error: () => undefined });
    control
      .expectOne('/api/v1/pacientes/me/citas')
      .flush(problema(403, 'ACCESO_DENEGADO'), opcionesProblema(403));
    // El rol cambió en otra pestaña: se descarta la caché y se vuelve a pedir.
    expect(auth.usuario()).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
    control
      .expectOne({ method: 'GET', url: '/api/v1/auth/sesion' })
      .flush({ id: 'u', nombre: 'Ana', email: 'a@b.pe', rol: 'OPERADOR' });
    expect(auth.usuario()?.rol).toBe('OPERADOR');
    expect(navegar).toHaveBeenCalledWith(['/acceso-denegado']);
  });

  it('ante 403 CSRF_INVALIDO renueva el token y no cambia de página', () => {
    http.post('/api/v1/pacientes/me/perfil', {}).subscribe({ error: () => undefined });
    control
      .expectOne('/api/v1/pacientes/me/perfil')
      .flush(problema(403, 'CSRF_INVALIDO'), opcionesProblema(403));
    control.expectOne({ method: 'GET', url: '/api/v1/auth/csrf' }).flush({});
    expect(navegar).not.toHaveBeenCalled();
  });

  it('deja pasar otros errores sin navegar', () => {
    http.get('/api/v1/x').subscribe({ error: () => undefined });
    control.expectOne('/api/v1/x').flush(problema(409, 'VERSION_OBSOLETA'), opcionesProblema(409));
    expect(navegar).not.toHaveBeenCalled();
  });
});
