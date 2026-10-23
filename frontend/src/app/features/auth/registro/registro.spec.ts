import { HttpXsrfTokenExtractor, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, escribir, marcar, query, texto } from '../../../../testing/dom';
import { AuthService } from '../../../core/auth/auth.service';
import { UsuarioSesion } from '../../../core/modelos/contrato';
import { AnuncioService } from '../../../core/sistema/anuncio.service';
import { CorreoRecordadoService } from '../compartido/correo-recordado';
import { MENSAJES_CLAVE } from '../compartido/politica-contrasena';
import { MENSAJES_CONTACTO } from '../../../shared/validadores/contacto';
import { MENSAJES_REGISTRO, RegistroComponent } from './registro';

const URL = '/api/v1/auth/registro';
const NUEVO: UsuarioSesion = {
  id: 'u-9',
  nombre: 'Lucía Paredes Rojas',
  email: 'lucia.paredes@correo.test',
  rol: 'PACIENTE',
};

describe('RegistroComponent', () => {
  let fixture: ComponentFixture<RegistroComponent>;
  let http: HttpTestingController;
  let navegar: ReturnType<typeof vi.spyOn>;
  let soltar: () => void;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [RegistroComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: HttpXsrfTokenExtractor, useValue: { getToken: () => 'token' } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(RegistroComponent);
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => {
    soltar();
    http.verify();
  });

  const campo = (id: string) => query<HTMLInputElement>(fixture, `#registro-${id}`);

  function llenar(clave = 'Valle-de-Lurin-2026') {
    escribir(campo('nombres'), '  Lucía ');
    escribir(campo('apellidos'), 'Paredes  Rojas');
    escribir(campo('email'), ' lucia.paredes@correo.test ');
    escribir(campo('telefono'), '+51 987 654 321');
    escribir(campo('password'), clave);
    escribir(campo('confirmacion'), clave);
    marcar(campo('privacidad'));
  }

  async function enviar() {
    query<HTMLFormElement>(fixture, 'form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  }

  it('presenta el formulario con etiquetas visibles, autocompletado y consentimiento', () => {
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Crea tu cuenta');
    const etiquetas: Record<string, string> = {
      nombres: 'Nombres',
      apellidos: 'Apellidos',
      email: 'Correo electrónico',
      telefono: 'Teléfono celular',
      password: 'Crea una contraseña',
      confirmacion: 'Confirma tu contraseña',
    };
    for (const [id, etiqueta] of Object.entries(etiquetas)) {
      expect(query(fixture, `label[for="registro-${id}"]`).textContent).toContain(etiqueta);
    }
    expect(campo('nombres').getAttribute('autocomplete')).toBe('given-name');
    expect(campo('apellidos').getAttribute('autocomplete')).toBe('family-name');
    expect(campo('email').getAttribute('autocomplete')).toBe('email');
    expect(campo('telefono').getAttribute('autocomplete')).toBe('tel');
    expect(campo('password').getAttribute('autocomplete')).toBe('new-password');
    const privacidad = enlace(fixture, /Política de privacidad/)!;
    expect(privacidad.getAttribute('href')).toBe('/privacidad');
    expect(privacidad.getAttribute('target')).toBe('_blank');
    expect(privacidad.textContent).toContain('se abre en una pestaña nueva');
    expect(texto(fixture)).toContain('Ley N.º 29733');
    // El consentimiento nombra la versión de la política y los datos de salud (sensibles).
    const consentimiento = query(fixture, 'label[for="registro-privacidad"]').textContent!;
    expect(consentimiento.replace(/\s+/g, ' ')).toContain('(versión 1.0)');
    expect(consentimiento).toContain('datos de salud');
    expect(enlace(fixture, 'Inicia sesión')?.getAttribute('href')).toBe('/login');
    expect(fixture.nativeElement.querySelector('.error-campo')).toBeNull();
  });

  it('valida en línea al salir de un campo', async () => {
    campo('nombres').dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    expect(query(fixture, '#registro-nombres-error').textContent).toContain(
      MENSAJES_REGISTRO.nombresRequerido,
    );
    expect(campo('nombres').getAttribute('aria-invalid')).toBe('true');
    expect(campo('nombres').getAttribute('aria-describedby')).toBe('registro-nombres-error');

    escribir(campo('nombres'), 'L4ura');
    await fixture.whenStable();
    expect(query(fixture, '#registro-nombres-error').textContent).toContain(
      MENSAJES_REGISTRO.nombreFormato,
    );
    escribir(campo('nombres'), "María-José O'Brien");
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#registro-nombres-error')).toBeNull();
  });

  it('al enviar vacío muestra los errores, enfoca el primero y no llama a la API', async () => {
    await enviar();
    expect(texto(fixture)).toContain(MENSAJES_REGISTRO.nombresRequerido);
    expect(texto(fixture)).toContain(MENSAJES_REGISTRO.apellidosRequerido);
    expect(texto(fixture)).toContain(MENSAJES_CLAVE.requerida);
    expect(texto(fixture)).toContain(MENSAJES_REGISTRO.privacidad);
    expect(document.activeElement).toBe(campo('nombres'));
    http.expectNone(URL);
  });

  it('el medidor refleja la política mientras se escribe la contraseña', async () => {
    escribir(campo('email'), 'lucia@correo.test');
    escribir(campo('password'), 'corta1');
    await fixture.whenStable();
    expect(query(fixture, '#registro-clave-nivel').textContent).toContain('Débil');
    expect(campo('password').getAttribute('aria-describedby')).toContain(
      'registro-clave-requisitos',
    );
    escribir(campo('password'), 'Valle-de-Lurin-2026');
    await fixture.whenStable();
    expect(query(fixture, '#registro-clave-nivel').textContent).toContain('Muy segura');
  });

  it('avisa si la confirmación no coincide y no envía', async () => {
    llenar();
    escribir(campo('confirmacion'), 'Otra-Clave-2026');
    await enviar();
    expect(query(fixture, '#registro-confirmacion-error').textContent).toContain(
      'Las contraseñas no coinciden.',
    );
    expect(document.activeElement).toBe(campo('confirmacion'));
    http.expectNone(URL);
  });

  it('crea la cuenta, inicia la sesión y va a «Mis citas» con la bienvenida', async () => {
    llenar();
    await enviar();
    expect(boton(fixture, /Creando tu cuenta/)?.disabled).toBe(true);
    expect(query(fixture, '#registro-enviando').getAttribute('role')).toBe('status');
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      nombres: 'Lucía',
      apellidos: 'Paredes Rojas',
      email: 'lucia.paredes@correo.test',
      telefono: '+51 987 654 321',
      password: 'Valle-de-Lurin-2026',
      aceptaPrivacidad: true,
    });
    const anuncios = TestBed.inject(AnuncioService);
    const publicar = vi.spyOn(anuncios, 'publicar');
    req.flush(NUEVO, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(TestBed.inject(AuthService).usuario()).toEqual(NUEVO);
    expect(publicar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'exito', titulo: 'Te damos la bienvenida, Lucía' }),
    );
    expect(navegar).toHaveBeenCalledWith('/paciente/citas');
  });

  it('muestra los errores del servidor (errores[]) junto a cada campo', async () => {
    llenar();
    await enviar();
    http.expectOne(URL).flush(
      problema(400, 'VALIDACION', {
        errores: [
          { campo: 'telefono', mensaje: 'Formato de teléfono inválido' },
          { campo: 'password', mensaje: 'La contraseña es demasiado común' },
          { campo: 'otro', mensaje: 'Dato adicional inválido' },
        ],
      }),
      opcionesProblema(400),
    );
    await fixture.whenStable();
    expect(query(fixture, '#registro-telefono-error').textContent).toContain(
      'Formato de teléfono inválido',
    );
    expect(query(fixture, '#registro-password-error').textContent).toContain(
      'La contraseña es demasiado común',
    );
    expect(texto(fixture)).toContain('Revisa los datos marcados');
    expect(texto(fixture)).toContain('Dato adicional inválido');
    expect(document.activeElement).toBe(campo('telefono'));

    // Al corregir, el error del servidor desaparece.
    escribir(campo('telefono'), '+51 900 000 002');
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#registro-telefono-error')).toBeNull();
  });

  it('409 CORREO_REGISTRADO: lo marca en el correo y ofrece iniciar sesión o recuperar', async () => {
    llenar();
    await enviar();
    http.expectOne(URL).flush(problema(409, 'CORREO_REGISTRADO'), opcionesProblema(409));
    await fixture.whenStable();
    expect(query(fixture, '#registro-email-error').textContent).toContain(
      MENSAJES_REGISTRO.correoRegistrado,
    );
    expect(texto(fixture)).toContain('Este correo ya tiene una cuenta');
    const login = enlace(fixture, 'Iniciar sesión')!;
    expect(login.getAttribute('href')).toBe('/login?desde=registro');
    expect(enlace(fixture, 'Recuperar contraseña')?.getAttribute('href')).toBe('/recuperar');
    expect(document.activeElement).toBe(query(fixture, '.registro__avisos .foco-resultado'));
    // El correo pasa en memoria (nunca en la URL) a la pantalla siguiente.
    expect(TestBed.inject(CorreoRecordadoService).consumir()).toBe('lucia.paredes@correo.test');
    expect(TestBed.inject(AuthService).usuario()).toBeNull();
    expect(navegar).not.toHaveBeenCalled();
  });

  it('429 DEMASIADOS_INTENTOS: muestra el mensaje del servidor', async () => {
    llenar();
    await enviar();
    http
      .expectOne(URL)
      .flush(
        problema(429, 'DEMASIADOS_INTENTOS', { detail: 'Inténtalo de nuevo en 40 minutos.' }),
        opcionesProblema(429),
      );
    await fixture.whenStable();
    const avisos = query(fixture, '.registro__avisos');
    expect(avisos.getAttribute('aria-live')).toBe('polite');
    expect(avisos.textContent).toContain('Demasiados intentos');
    expect(avisos.textContent).toContain('Inténtalo de nuevo en 40 minutos.');
    expect(boton(fixture, 'Crear cuenta')?.disabled).toBe(false);
  });

  it('rechaza en el cliente lo que el servidor rechazaría: «Ana--María», «a@b» y teléfonos raros', async () => {
    llenar();
    escribir(campo('nombres'), 'Ana--María');
    escribir(campo('email'), 'a@b');
    escribir(campo('telefono'), '+51 98-765-4321');
    await enviar();
    expect(query(fixture, '#registro-nombres-error').textContent).toContain(
      MENSAJES_REGISTRO.nombreFormato,
    );
    expect(query(fixture, '#registro-email-error').textContent).toContain(
      MENSAJES_CONTACTO.emailInvalido,
    );
    expect(query(fixture, '#registro-telefono-error').textContent).toContain(
      MENSAJES_CONTACTO.telefonoInvalido,
    );
    expect(document.activeElement).toBe(campo('nombres'));
    http.expectNone(URL);
  });

  it('el teléfono es obligatorio', async () => {
    // Admite lo mismo que el servidor: hasta 30 caracteres (20 dígitos con espacios y «+»).
    expect(campo('telefono').getAttribute('maxlength')).toBe('30');
    llenar();
    escribir(campo('telefono'), '   ');
    await enviar();
    expect(query(fixture, '#registro-telefono-error').textContent).toContain(
      MENSAJES_CONTACTO.telefonoRequerido,
    );
    expect(document.activeElement).toBe(campo('telefono'));
    http.expectNone(URL);
  });

  it('envía los datos normalizados como los guarda el servidor', async () => {
    llenar();
    escribir(campo('nombres'), ' María   José ');
    escribir(campo('apellidos'), 'D’Angelo  Ruiz');
    escribir(campo('telefono'), ' +51  987 654 321 ');
    await enviar();
    const req = http.expectOne(URL);
    expect(req.request.body).toMatchObject({
      nombres: 'María José',
      apellidos: "D'Angelo Ruiz",
      email: 'lucia.paredes@correo.test',
      telefono: '+51 987 654 321',
    });
    req.flush(NUEVO, { status: 201, statusText: 'Created' });
  });

  it('la contraseña no puede ser lo que va antes de la @ del correo', async () => {
    llenar('juanperez2024');
    escribir(campo('email'), 'JuanPerez2024@correo.test');
    await enviar();
    expect(query(fixture, '#registro-password-error').textContent).toContain(MENSAJES_CLAVE.correo);
    http.expectNone(URL);
  });

  it('no usa lenguaje de prueba ni de piloto', () => {
    // «Se comprueba al enviar» (medidor) es el verbo comprobar: se buscan palabras completas.
    expect(texto(fixture)).not.toMatch(/\b(piloto|prueba|demo)\b/i);
  });
});
