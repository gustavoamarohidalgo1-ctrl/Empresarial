import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CacheService } from '../../../core/cache/cache.service';
import { adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, escribir, query, texto } from '../../../../testing/dom';
import { PerfilComponent, inicialesPerfil } from './perfil';

const URL = '/api/v1/pacientes/me/perfil';
const PERFIL = {
  nombres: 'Ana',
  apellidos: 'Demo',
  email: 'ana.demo@ejemplo.invalid',
  telefono: '+51 900 000 001',
};

function configurar(): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [PerfilComponent],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(HttpTestingController);
}

describe('PerfilComponent', () => {
  let fixture: ComponentFixture<PerfilComponent>;
  let http: HttpTestingController;
  let soltar: () => void;

  beforeEach(async () => {
    http = configurar();
    fixture = TestBed.createComponent(PerfilComponent);
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
    // Sin datos guardados: esqueleto con el estado anunciado.
    const ocupado = query(fixture, '[aria-busy="true"]');
    expect(ocupado.querySelector('[role="status"]')!.textContent).toContain('Cargando tu perfil…');
    http.expectOne(URL).flush(PERFIL);
    await fixture.whenStable();
  });

  afterEach(() => {
    soltar();
    http.verify();
  });

  /** Datos registrados que se muestran fuera del formulario (identidad de la tarjeta). */
  const identidad = () => query(fixture, '.identidad').textContent!;
  const editar = async () => {
    boton(fixture, 'Editar datos de contacto')!.click();
    await fixture.whenStable();
  };

  it('muestra la tarjeta con avatar de iniciales, nombre y datos registrados', () => {
    const avatar = query(fixture, '.avatar');
    expect(avatar.textContent!.trim()).toBe('AD');
    expect(avatar.getAttribute('aria-hidden')).toBe('true');
    expect(query(fixture, 'h2#perfil-nombre').textContent!.trim()).toBe('Ana Demo');
    const contacto = query(fixture, 'dl.contacto').textContent!;
    expect(contacto).toContain(PERFIL.email);
    expect(contacto).toContain(PERFIL.telefono);
    // En modo lectura no hay formulario.
    expect(fixture.nativeElement.querySelector('#perfil-email')).toBeNull();
    expect(texto(fixture)).toContain('Solo puedes cambiar tu correo y tu teléfono.');
  });

  it('al editar, prellena el formulario, lleva el foco al correo y deshabilita Guardar sin cambios', async () => {
    await editar();
    const email = query<HTMLInputElement>(fixture, '#perfil-email');
    expect(email.value).toBe(PERFIL.email);
    expect(document.activeElement).toBe(email);
    expect(email.getAttribute('aria-describedby')).toBe('perfil-email-ayuda');
    expect(boton(fixture, 'Guardar cambios')!.disabled).toBe(true);
    expect(texto(fixture)).toContain('No hay cambios por guardar');
    expect(boton(fixture, 'Editar datos de contacto')).toBeUndefined();
  });

  it('valida en el cliente antes de enviar', async () => {
    await editar();
    escribir(query<HTMLInputElement>(fixture, '#perfil-telefono'), 'abc');
    await fixture.whenStable();
    boton(fixture, 'Guardar cambios')!.click();
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Escribe un teléfono válido');
    const telefono = query(fixture, '#perfil-telefono');
    expect(telefono.getAttribute('aria-invalid')).toBe('true');
    expect(telefono.getAttribute('aria-describedby')).toBe(
      'perfil-telefono-ayuda perfil-telefono-error',
    );
    expect(document.activeElement).toBe(telefono);
    http.expectNone(URL);
  });

  it('envía solo los campos cambiados y actualiza los datos registrados', async () => {
    await editar();
    escribir(query<HTMLInputElement>(fixture, '#perfil-telefono'), '+51 911 222 333');
    await fixture.whenStable();
    const guardar = boton(fixture, 'Guardar cambios')!;
    guardar.click();
    await fixture.whenStable();
    // Mientras guarda: estado de carga sin cambiar el texto del botón.
    expect(guardar.disabled).toBe(true);
    expect(guardar.classList.contains('btn--cargando')).toBe(true);
    expect(query(fixture, '#perfil-explicacion').getAttribute('role')).toBe('status');

    const req = http.expectOne({ method: 'PATCH', url: URL });
    expect(req.request.body).toEqual({ telefono: '+51 911 222 333' });
    const actualizado = { ...PERFIL, telefono: '+51 911 222 333' };
    req.flush(actualizado);
    await fixture.whenStable();
    // Vuelve al modo lectura con el dato nuevo, anuncia el resultado y le da el foco.
    expect(query(fixture, 'dl.contacto').textContent).toContain('+51 911 222 333');
    expect(texto(fixture)).toContain('Tus datos de contacto se guardaron.');
    expect((document.activeElement as HTMLElement).classList.contains('foco-resultado')).toBe(true);
    expect(TestBed.inject(CacheService).leer('perfil')).toEqual(actualizado);
  });

  it('muestra errores[] junto a cada campo y conserva el valor anterior', async () => {
    await editar();
    escribir(query<HTMLInputElement>(fixture, '#perfil-email'), 'nuevo@ejemplo.invalid');
    await fixture.whenStable();
    boton(fixture, 'Guardar cambios')!.click();
    await fixture.whenStable();
    http.expectOne(URL).flush(
      problema(400, 'VALIDACION', {
        errores: [{ campo: 'email', mensaje: 'El correo ya está en uso' }],
      }),
      opcionesProblema(400),
    );
    await fixture.whenStable();
    expect(query(fixture, '#perfil-email-error').textContent).toContain('El correo ya está en uso');
    expect(query(fixture, '#perfil-email').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement?.id).toBe('perfil-email');
    expect(identidad()).toContain(PERFIL.email);
    expect(identidad()).not.toContain('nuevo@ejemplo.invalid');
    expect(texto(fixture)).toContain('se conservan tus datos anteriores');
    expect(TestBed.inject(CacheService).leer('perfil')).toEqual(PERFIL);
  });

  it('enlaza a «Seguridad de la cuenta» para cambiar la contraseña (sin duplicar el formulario)', () => {
    const seguridad = query(fixture, 'section[aria-labelledby="perfil-seguridad-titulo"]');
    expect(seguridad.querySelector('h2')?.textContent?.trim()).toBe('Seguridad');
    expect(enlace(fixture, 'Seguridad de la cuenta')?.getAttribute('href')).toBe(
      '/cuenta/seguridad',
    );
    expect(fixture.nativeElement.querySelector('app-seguridad-cuenta')).toBeNull();
    expect(boton(fixture, 'Cambiar contraseña')).toBeUndefined();
  });

  it('valida el contacto como el servidor: «a@b» no es un correo y el teléfono es obligatorio', async () => {
    await editar();
    escribir(query<HTMLInputElement>(fixture, '#perfil-email'), 'a@b');
    escribir(query<HTMLInputElement>(fixture, '#perfil-telefono'), ' ');
    await fixture.whenStable();
    boton(fixture, 'Guardar cambios')!.click();
    await fixture.whenStable();
    expect(query(fixture, '#perfil-email-error').textContent).toContain('correo válido');
    expect(query(fixture, '#perfil-telefono-error').textContent).toContain('Escribe tu teléfono');
    http.expectNone(URL);
  });

  it('envía el teléfono normalizado (sin espacios dobles) como lo guarda el servidor', async () => {
    await editar();
    escribir(query<HTMLInputElement>(fixture, '#perfil-telefono'), ' +51  911 222 333 ');
    await fixture.whenStable();
    boton(fixture, 'Guardar cambios')!.click();
    await fixture.whenStable();
    const req = http.expectOne({ method: 'PATCH', url: URL });
    expect(req.request.body).toEqual({ telefono: '+51 911 222 333' });
    req.flush({ ...PERFIL, telefono: '+51 911 222 333' });
    await fixture.whenStable();
  });

  it('Cancelar descarta los cambios y devuelve el foco a «Editar»', async () => {
    await editar();
    escribir(query<HTMLInputElement>(fixture, '#perfil-email'), 'otro@ejemplo.invalid');
    await fixture.whenStable();
    boton(fixture, 'Cancelar')!.click();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#perfil-email')).toBeNull();
    expect(query(fixture, 'dl.contacto').textContent).toContain(PERFIL.email);
    expect(document.activeElement).toBe(boton(fixture, 'Editar datos de contacto'));
    // Al volver a editar, el formulario parte de los datos registrados.
    await editar();
    expect(query<HTMLInputElement>(fixture, '#perfil-email').value).toBe(PERFIL.email);
  });
});

describe('PerfilComponent con el perfil guardado (stale-while-revalidate)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PerfilComponent>;

  beforeEach(async () => {
    http = configurar();
    TestBed.inject(CacheService).guardar('perfil', PERFIL);
    fixture = TestBed.createComponent(PerfilComponent);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('pinta el perfil al instante, sin esqueleto, y lo actualiza al revalidar', async () => {
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    expect(query(fixture, 'dl.contacto').textContent).toContain(PERFIL.telefono);
    http.expectOne(URL).flush({ ...PERFIL, telefono: '+51 900 000 777' });
    await fixture.whenStable();
    expect(query(fixture, 'dl.contacto').textContent).toContain('+51 900 000 777');
  });

  it('no pisa lo que la persona está escribiendo cuando llega la versión fresca', async () => {
    boton(fixture, 'Editar datos de contacto')!.click();
    await fixture.whenStable();
    const telefono = query<HTMLInputElement>(fixture, '#perfil-telefono');
    escribir(telefono, '+51 911 222 333');
    telefono.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    http.expectOne(URL).flush({ ...PERFIL, email: 'ana.nueva@ejemplo.invalid' });
    await fixture.whenStable();
    expect(query<HTMLInputElement>(fixture, '#perfil-telefono').value).toBe('+51 911 222 333');
    // La identidad muestra lo registrado más reciente.
    expect(query(fixture, '.identidad').textContent).toContain('ana.nueva@ejemplo.invalid');
  });

  it('si falla la revalidación, avisa que muestra lo último que cargó', async () => {
    http.expectOne(URL).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Mostramos lo último que cargamos');
    expect(query(fixture, 'dl.contacto').textContent).toContain(PERFIL.email);
  });
});

describe('inicialesPerfil', () => {
  it('usa la primera letra del primer nombre y del primer apellido', () => {
    expect(inicialesPerfil({ nombres: 'ana lucía', apellidos: 'Demo Pérez' })).toBe('AD');
    expect(inicialesPerfil({ nombres: 'Ñique', apellidos: '' })).toBe('Ñ');
    expect(inicialesPerfil({ nombres: ' ', apellidos: ' ' })).toBe('?');
  });
});
