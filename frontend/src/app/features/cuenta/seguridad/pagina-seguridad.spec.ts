import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { OPERADOR, adjuntar } from '../../../../testing/datos-prueba';
import { boton, escribir, query, texto } from '../../../../testing/dom';
import { AuthService } from '../../../core/auth/auth.service';
import { UsuarioSesion } from '../../../core/modelos/contrato';
import { MENSAJES_CLAVE } from '../../auth/compartido/politica-contrasena';
import { PaginaSeguridadComponent } from './pagina-seguridad';

/** Cualquier rol: aquí, el operador (antes no tenía dónde cambiar su contraseña). */
const OPERADORA: UsuarioSesion = { ...OPERADOR, email: 'olga.ruiz2026@sede.pe' };

describe('PaginaSeguridadComponent', () => {
  let fixture: ComponentFixture<PaginaSeguridadComponent>;
  let http: HttpTestingController;
  let soltar: () => void;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PaginaSeguridadComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'token' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).establecerSesion(OPERADORA);
    fixture = TestBed.createComponent(PaginaSeguridadComponent);
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    soltar();
    http.verify();
  });

  it('es la página «Seguridad de la cuenta» con el cambio de contraseña', () => {
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Seguridad de la cuenta');
    expect(query(fixture, 'app-seguridad-cuenta h2').textContent?.trim()).toBe('Contraseña');
    expect(boton(fixture, 'Cambiar contraseña')).toBeDefined();
    expect(texto(fixture)).toContain(OPERADORA.email);
    expect(texto(fixture)).toContain('protegida con hash');
  });

  it('usa el correo de la sesión para la regla «Distinta de tu correo» (también lo de antes de la @)', async () => {
    boton(fixture, 'Cambiar contraseña')!.click();
    await fixture.whenStable();
    escribir(query<HTMLInputElement>(fixture, '#seguridad-actual'), 'Clave-Anterior-1');
    escribir(query<HTMLInputElement>(fixture, '#seguridad-nueva'), 'Olga.Ruiz2026');
    escribir(query<HTMLInputElement>(fixture, '#seguridad-confirmacion'), 'Olga.Ruiz2026');
    query<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    expect(query(fixture, '#seguridad-nueva-error').textContent).toContain(MENSAJES_CLAVE.correo);
    http.expectNone('/api/v1/cuenta/contrasena');
  });

  it('no usa lenguaje de prueba ni de piloto', () => {
    // «Se comprueba al enviar» (medidor) es el verbo comprobar: se buscan palabras completas.
    expect(texto(fixture)).not.toMatch(/\b(demo|prueba|piloto)\b/i);
  });
});
