import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { OPERADOR, PACIENTE } from '../../../testing/datos-prueba';
import { UsuarioSesion } from '../modelos/contrato';
import { authGuard, inicioPorRolGuard, invitadoGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { roleGuard } from './role.guard';

describe('Guardas', () => {
  let usuario: UsuarioSesion | null;
  let router: Router;

  beforeEach(() => {
    usuario = null;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { verificarSesion: () => of(usuario) } },
      ],
    });
    router = TestBed.inject(Router);
  });

  function ruta(data: Record<string, unknown> = {}): ActivatedRouteSnapshot {
    return { data } as unknown as ActivatedRouteSnapshot;
  }

  async function ejecutar(guarda: typeof authGuard, data: Record<string, unknown> = {}) {
    const resultado = TestBed.runInInjectionContext(() =>
      guarda(ruta(data), {} as RouterStateSnapshot),
    ) as Observable<boolean | UrlTree>;
    return firstValueFrom(resultado);
  }

  function url(resultado: boolean | UrlTree): string | boolean {
    return resultado instanceof UrlTree ? router.serializeUrl(resultado) : resultado;
  }

  describe('authGuard', () => {
    it('permite el paso con sesión', async () => {
      usuario = PACIENTE;
      expect(await ejecutar(authGuard)).toBe(true);
    });

    it('redirige a /login sin sesión', async () => {
      expect(url(await ejecutar(authGuard))).toBe('/login');
    });
  });

  describe('roleGuard', () => {
    it('permite el paso si el rol está en data.roles', async () => {
      usuario = PACIENTE;
      expect(await ejecutar(roleGuard, { roles: ['PACIENTE'] })).toBe(true);
    });

    it('lleva a /acceso-denegado si el rol no corresponde', async () => {
      usuario = OPERADOR;
      expect(url(await ejecutar(roleGuard, { roles: ['PACIENTE'] }))).toBe('/acceso-denegado');
    });

    it('lleva a /login si no hay sesión', async () => {
      expect(url(await ejecutar(roleGuard, { roles: ['PACIENTE'] }))).toBe('/login');
    });

    it('niega el paso si la ruta no declara roles', async () => {
      usuario = PACIENTE;
      expect(url(await ejecutar(roleGuard))).toBe('/acceso-denegado');
    });
  });

  describe('invitadoGuard e inicioPorRolGuard', () => {
    it('/login deja entrar sin sesión', async () => {
      expect(await ejecutar(invitadoGuard)).toBe(true);
    });

    it('/login lleva al inicio del rol si ya hay sesión', async () => {
      usuario = OPERADOR;
      expect(url(await ejecutar(invitadoGuard))).toBe('/operador');
    });

    it('la raíz redirige según el rol', async () => {
      usuario = { ...PACIENTE, rol: 'ADMINISTRADOR' };
      expect(url(await ejecutar(inicioPorRolGuard))).toBe('/indicadores');
      usuario = null;
      expect(url(await ejecutar(inicioPorRolGuard))).toBe('/login');
    });

    it('/inicio lleva al inicio de CADA rol (paciente y operador no acaban en acceso denegado)', async () => {
      const esperado: Record<UsuarioSesion['rol'], string> = {
        PACIENTE: '/paciente/citas',
        OPERADOR: '/operador',
        RESPONSABLE: '/indicadores',
        ADMINISTRADOR: '/indicadores',
      };
      for (const [rol, destino] of Object.entries(esperado)) {
        usuario = { ...PACIENTE, rol: rol as UsuarioSesion['rol'] };
        expect(url(await ejecutar(inicioPorRolGuard))).toBe(destino);
      }
    });
  });
});
