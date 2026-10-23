import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpXsrfTokenExtractor } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OPERADOR, PACIENTE, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, escribir, query, texto } from '../../../../testing/dom';
import { UsuarioSesion } from '../../../core/modelos/contrato';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CorreoRecordadoService } from '../compartido/correo-recordado';
import { MENSAJE_CLAVE_RESTABLECIDA } from '../restablecer/restablecer';
import { BENEFICIOS_LOGIN, LoginComponent, MENSAJE_LOGIN_FALLIDO } from './login';

describe('LoginComponent', () => {
  let fixture: ComponentFixture<LoginComponent>;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'token' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  function llenar(email = 'ana.demo@ejemplo.invalid', password = 'secreto') {
    escribir(query<HTMLInputElement>(fixture, '#login-email'), email);
    escribir(query<HTMLInputElement>(fixture, '#login-password'), password);
  }

  async function enviar() {
    query<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  async function iniciarComo(usuario: UsuarioSesion) {
    llenar();
    await enviar();
    http.expectOne('/api/v1/auth/login').flush(usuario);
    await fixture.whenStable();
  }

  it('muestra etiquetas visibles asociadas a los campos y ningún error al inicio', () => {
    const etiquetaCorreo = query<HTMLLabelElement>(fixture, 'label[for="login-email"]');
    const etiquetaClave = query<HTMLLabelElement>(fixture, 'label[for="login-password"]');
    expect(etiquetaCorreo.textContent).toContain('Correo');
    expect(etiquetaClave.textContent).toContain('Contraseña');
    expect(texto(fixture)).not.toContain(MENSAJE_LOGIN_FALLIDO);
    expect(fixture.nativeElement.querySelector('.error-campo')).toBeNull();
  });

  it('valida en el cliente sin llamar a la API', async () => {
    await enviar();
    expect(texto(fixture)).toContain('Escribe tu correo.');
    expect(texto(fixture)).toContain('Escribe tu contraseña.');
    expect(query(fixture, '#login-email').getAttribute('aria-invalid')).toBe('true');
    http.expectNone('/api/v1/auth/login');
  });

  it('deshabilita el botón mientras envía y explica por qué', async () => {
    llenar();
    await enviar();
    const b = boton(fixture, 'Iniciando sesión…');
    expect(b?.disabled).toBe(true);
    expect(texto(fixture)).toContain('Estamos verificando tus datos');
    http.expectOne('/api/v1/auth/login').flush(PACIENTE);
  });

  it('muestra el spinner sin ocultar el texto y enlaza la explicación al botón', async () => {
    llenar();
    await enviar();
    const b = boton(fixture, 'Iniciando sesión…')!;
    expect(b.classList).toContain('btn--cargando');
    expect(b.getAttribute('aria-describedby')).toBe('login-enviando');
    expect(query(fixture, '#login-enviando').getAttribute('role')).toBe('status');
    expect(query<HTMLFormElement>(fixture, 'form').getAttribute('aria-busy')).toBe('true');
    http.expectOne('/api/v1/auth/login').flush(PACIENTE);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#login-enviando')).toBeNull();
  });

  it('declara el autocompletado correcto para gestores de contraseñas', () => {
    const correo = query<HTMLInputElement>(fixture, '#login-email');
    const clave = query<HTMLInputElement>(fixture, '#login-password');
    expect(correo.getAttribute('autocomplete')).toBe('username');
    expect(correo.type).toBe('email');
    expect(clave.getAttribute('autocomplete')).toBe('current-password');
    expect(clave.type).toBe('password');
  });

  it('permite mostrar y ocultar la contraseña, y la oculta otra vez al enviar', async () => {
    const clave = query<HTMLInputElement>(fixture, '#login-password');
    const alternar = boton(fixture, 'Mostrar contraseña')!;
    expect(alternar.type).toBe('button');
    expect(alternar.getAttribute('aria-controls')).toBe('login-password');

    alternar.click();
    await fixture.whenStable();
    expect(clave.type).toBe('text');
    expect(clave.getAttribute('autocomplete')).toBe('current-password');
    expect(boton(fixture, 'Ocultar contraseña')).toBeDefined();

    llenar();
    await enviar();
    expect(clave.type).toBe('password');
    http.expectOne('/api/v1/auth/login').flush(PACIENTE);
  });

  it('avisa si Bloq Mayús está activado mientras se escribe la contraseña', async () => {
    const clave = query<HTMLInputElement>(fixture, '#login-password');
    const tecla = new KeyboardEvent('keydown', { key: 'A' });
    Object.defineProperty(tecla, 'getModifierState', { value: (m: string) => m === 'CapsLock' });
    clave.dispatchEvent(tecla);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Bloq Mayús está activado.');
    expect(clave.getAttribute('aria-describedby')).toBe('login-password-mayus');

    clave.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(texto(fixture)).not.toContain('Bloq Mayús');
    expect(clave.getAttribute('aria-describedby')).toBeNull();
  });

  it('enlaza a la vez el aviso de Bloq Mayús y el error de la contraseña', async () => {
    escribir(query<HTMLInputElement>(fixture, '#login-email'), 'ana.demo@ejemplo.invalid');
    await enviar();
    const clave = query<HTMLInputElement>(fixture, '#login-password');
    const tecla = new KeyboardEvent('keyup', { key: 'A' });
    Object.defineProperty(tecla, 'getModifierState', { value: () => true });
    clave.dispatchEvent(tecla);
    await fixture.whenStable();
    expect(clave.getAttribute('aria-describedby')).toBe(
      'login-password-mayus login-password-error',
    );
    expect(document.activeElement).toBe(clave);
  });

  it('presenta el panel de marca con tres beneficios y una ilustración decorativa', () => {
    const titulo = query(fixture, 'h1');
    expect(titulo.textContent).toContain('Inicia sesión');
    const panel = query(fixture, 'aside.login__panel');
    expect(panel.getAttribute('aria-labelledby')).toBe('login-panel-titulo');
    const beneficios = panel.querySelectorAll('.login__beneficios li');
    expect(beneficios.length).toBe(3);
    expect(BENEFICIOS_LOGIN.length).toBe(3);
    expect(panel.textContent).toContain(BENEFICIOS_LOGIN[0].titulo);
    expect(query(fixture, '.login__ilustracion').getAttribute('aria-hidden')).toBe('true');
    // En móvil queda la marca sobre el formulario (isotipo grande; el texto está en la cabecera).
    const marcaMovil = query(fixture, 'app-marca.login__marca-movil');
    expect(marcaMovil.classList).toContain('marca--lg');
    expect(marcaMovil.querySelector('.marca__nombre')).toBeNull();
    // Solo hay un h1 y está en el formulario (el panel usa h2).
    expect(fixture.nativeElement.querySelectorAll('h1').length).toBe(1);
  });

  it('anuncia el error del servidor en la región viva con un título', async () => {
    llenar();
    await enviar();
    http
      .expectOne('/api/v1/auth/login')
      .flush(problema(401, 'CREDENCIALES_INVALIDAS'), opcionesProblema(401));
    await fixture.whenStable();
    const region = query(fixture, '.login__avisos');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.querySelector('.aviso--error')).not.toBeNull();
    expect(region.textContent).toContain('No se inició la sesión');
    expect(region.textContent).toContain(MENSAJE_LOGIN_FALLIDO);
  });

  it('muestra un mensaje genérico solo después de un intento fallido', async () => {
    llenar();
    await enviar();
    http
      .expectOne('/api/v1/auth/login')
      .flush(
        problema(401, 'CREDENCIALES_INVALIDAS', { detail: 'Cuenta bloqueada' }),
        opcionesProblema(401),
      );
    await fixture.whenStable();
    expect(texto(fixture)).toContain(MENSAJE_LOGIN_FALLIDO);
    expect(texto(fixture)).not.toContain('bloqueada');
    expect(boton(fixture, 'Iniciar sesión')?.disabled).toBe(false);
    expect(query<HTMLInputElement>(fixture, '#login-password').value).toBe('');
    expect(navegar).not.toHaveBeenCalled();
  });

  it('redirige al paciente a /paciente/citas', async () => {
    await iniciarComo(PACIENTE);
    expect(navegar).toHaveBeenCalledWith('/paciente/citas');
  });

  it('redirige al operador a /operador', async () => {
    await iniciarComo(OPERADOR);
    expect(navegar).toHaveBeenCalledWith('/operador');
  });

  it('redirige a responsables y administradores a /indicadores', async () => {
    await iniciarComo({ ...PACIENTE, rol: 'RESPONSABLE' });
    expect(navegar).toHaveBeenCalledWith('/indicadores');
  });

  it('no usa lenguaje de prueba ni de piloto', () => {
    expect(texto(fixture)).not.toMatch(/piloto|prueba|sintétic|demo/i);
  });

  it('ofrece recuperar la contraseña y crear una cuenta', () => {
    expect(enlace(fixture, '¿Olvidaste tu contraseña?')?.getAttribute('href')).toBe('/recuperar');
    expect(enlace(fixture, 'Crear cuenta')?.getAttribute('href')).toBe('/registro');
    expect(texto(fixture)).toContain('¿No tienes cuenta?');
  });
});

describe('LoginComponent con la sesión expirada', () => {
  it('explica que la sesión terminó', async () => {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ sesion: 'expirada' })) },
        },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    const region = query(fixture, '.login__avisos');
    expect(region.querySelector('.aviso--info')).not.toBeNull();
    expect(region.textContent).toContain('Tu sesión terminó');
    expect(region.textContent).toContain('Inicia sesión de nuevo para continuar.');
  });
});

describe('LoginComponent con avisos de otras pantallas', () => {
  function crear(parametros: Record<string, string> = {}) {
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(parametros)) } },
      ],
    });
  }

  it('muestra el éxito al llegar desde «Restablecer contraseña» (una sola vez)', async () => {
    crear();
    TestBed.inject(AvisoFlashService).publicar({
      tipo: 'exito',
      texto: MENSAJE_CLAVE_RESTABLECIDA,
    });
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    const region = query(fixture, '.login__avisos');
    expect(region.querySelector('.aviso--exito')).not.toBeNull();
    expect(region.textContent).toContain('Contraseña actualizada');
    expect(region.textContent).toContain(MENSAJE_CLAVE_RESTABLECIDA);
    expect(TestBed.inject(AvisoFlashService).consumir()).toBeNull();
  });

  it('al llegar desde «Crear cuenta» explica que el correo ya tiene cuenta y lo rellena', async () => {
    crear({ desde: 'registro' });
    TestBed.inject(CorreoRecordadoService).recordar('lucia.paredes@correo.test');
    const fixture = TestBed.createComponent(LoginComponent);
    await fixture.whenStable();
    const region = query(fixture, '.login__avisos');
    expect(region.textContent).toContain('Ya tienes una cuenta');
    expect(enlace(fixture, 'recupera tu contraseña')?.getAttribute('href')).toBe('/recuperar');
    expect(query<HTMLInputElement>(fixture, '#login-email').value).toBe(
      'lucia.paredes@correo.test',
    );
  });
});
