import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { OPERADOR } from '../testing/datos-prueba';
import { routes } from './app.routes';
import { inicioPorRolGuard } from './core/auth/auth.guard';
import { AuthService } from './core/auth/auth.service';
import { InfoSistema, UsuarioSesion } from './core/modelos/contrato';
import { SistemaService } from './core/sistema/sistema.service';

describe('Rutas de la app', () => {
  let usuario: UsuarioSesion | null;
  let info: InfoSistema | null;
  let http: HttpTestingController;

  beforeEach(() => {
    usuario = null;
    info = null;
    TestBed.configureTestingModule({
      providers: [
        // Igual que app.config.ts: los parámetros de la URL llegan como entradas (`?token=`).
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: {
            verificarSesion: (): Observable<UsuarioSesion | null> => of(usuario),
            usuario: () => usuario,
          },
        },
        { provide: SistemaService, useValue: { obtener: () => of(info) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const url = () => TestBed.inject(Router).url;

  describe('/inicio', () => {
    // Las redirecciones por rol las prueba `guards.spec.ts` (inicioPorRolGuard).
    it('redirige según el rol con la guarda, no a /indicadores para todos', () => {
      const inicio = routes.find((r) => r.path === 'inicio')!;
      expect(inicio.redirectTo).toBeUndefined();
      expect(inicio.canActivate).toEqual([inicioPorRolGuard]);
    });
  });

  describe('/dev/buzon', () => {
    it('en producción muestra la página 404 (sin cargar el buzón ni llamar a su API)', async () => {
      info = { nombre: 'SIGA-SP', version: '1.1.0', entorno: 'produccion' };
      const harness = await RouterTestingHarness.create('/dev/buzon');
      expect(url()).toBe('/dev/buzon');
      expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
      http.expectNone('/api/v1/dev/correos');
    });

    it('si /sistema/info no responde, también se trata como producción', async () => {
      info = null;
      const harness = await RouterTestingHarness.create('/dev/buzon');
      expect(harness.routeNativeElement?.textContent).toContain('Página no encontrada');
    });

    it('en desarrollo abre el buzón', async () => {
      info = { nombre: 'SIGA-SP', version: '1.1.0', entorno: 'desarrollo' };
      const harness = await RouterTestingHarness.create('/dev/buzon');
      http.expectOne('/api/v1/dev/correos').flush([]);
      await harness.fixture.whenStable();
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Buzón');
    });
  });

  describe('/cuenta/seguridad', () => {
    it('sin sesión lleva a /login', async () => {
      await RouterTestingHarness.create('/cuenta/seguridad');
      expect(url()).toBe('/login');
    });

    it('cualquier rol con sesión la abre', async () => {
      usuario = OPERADOR;
      const harness = await RouterTestingHarness.create('/cuenta/seguridad');
      expect(url()).toBe('/cuenta/seguridad');
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe(
        'Seguridad de la cuenta',
      );
    });
  });

  describe('/restablecer', () => {
    it('lee el token del enlace, lo guarda en memoria y lo quita de la URL', async () => {
      const harness = await RouterTestingHarness.create('/restablecer?token=abc123');
      await harness.fixture.whenStable();
      expect(url()).toBe('/restablecer');
      expect(TestBed.inject(Location).path()).toBe('/restablecer');
      // El formulario sigue disponible con el token guardado.
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent?.trim()).toBe(
        'Crea una contraseña nueva',
      );
    });
  });
});
