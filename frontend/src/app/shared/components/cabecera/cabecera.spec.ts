import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { CLAVE_TEMA } from '../../../core/tema/tema';
import { OPERADOR, PACIENTE, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, texto } from '../../../../testing/dom';
import { UsuarioSesion } from '../../../core/modelos/contrato';
import { NotificacionesService } from '../../../core/notificaciones/notificaciones.service';
import { CabeceraComponent, MENSAJE_ERROR_CIERRE, iniciales } from './cabecera';
import { textoContador } from './contador/contador-no-leidas';

describe('CabeceraComponent', () => {
  let fixture: ComponentFixture<CabeceraComponent>;
  let http: HttpTestingController;
  let noLeidas: WritableSignal<number>;
  let refrescarConteo: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    noLeidas = signal(0);
    refrescarConteo = vi.fn();
    TestBed.configureTestingModule({
      imports: [CabeceraComponent],
      providers: [
        provideRouter([{ path: 'otra', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        // El servicio real sondea la API; aquí solo interesa su contador y su refresco.
        { provide: NotificacionesService, useValue: { noLeidas, refrescarConteo } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    fixture?.nativeElement.remove();
    document.documentElement.classList.remove('tema-claro', 'tema-oscuro');
    localStorage.removeItem(CLAVE_TEMA);
  });

  async function conSesion(usuario: UsuarioSesion | null) {
    const auth = TestBed.inject(AuthService);
    if (usuario) {
      auth.verificarSesion().subscribe();
      http.expectOne('/api/v1/auth/sesion').flush(usuario);
    }
    fixture = TestBed.createComponent(CabeceraComponent);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  }

  const raiz = () => fixture.nativeElement as HTMLElement;
  const textosNavegacion = () =>
    Array.from(raiz().querySelectorAll('nav a')).map((a) => a.textContent!.trim());
  const chip = () => raiz().querySelector<HTMLButtonElement>('.cab__chip')!;
  const menu = () => raiz().querySelector<HTMLElement>('#cab-menu-usuario')!;

  async function abrirMenu() {
    chip().click();
    await fixture.whenStable();
  }

  it('sin sesión muestra la marca (lleva a la portada), «Iniciar sesión» y «Crear cuenta»', async () => {
    await conSesion(null);
    expect(texto(fixture)).toContain('SIGA-SP');
    const marca = raiz().querySelector<HTMLAnchorElement>('a.cab__marca')!;
    expect(marca.getAttribute('href')).toBe('/');
    expect(enlace(fixture, 'Iniciar sesión')?.getAttribute('href')).toBe('/login');
    expect(enlace(fixture, 'Crear cuenta')?.getAttribute('href')).toBe('/registro');
    expect(raiz().querySelector('nav')).toBeNull();
    expect(boton(fixture, 'Cerrar sesión')).toBeUndefined();
    expect(refrescarConteo).not.toHaveBeenCalled();
  });

  it('no muestra textos de datos de prueba', async () => {
    await conSesion(PACIENTE);
    expect(texto(fixture)).not.toMatch(/sintétic|prueba|piloto/i);
  });

  it('muestra nombre, rol, iniciales y los enlaces del paciente con icono', async () => {
    await conSesion(PACIENTE);
    expect(texto(fixture)).toContain('Ana Demo');
    expect(texto(fixture)).toContain('Paciente');
    expect(raiz().querySelector('.cab__chip .cab__avatar')?.textContent?.trim()).toBe('AD');
    expect(textosNavegacion()).toEqual([
      'Mis citas',
      'Reservar cita',
      'Notificaciones',
      'Mi perfil',
    ]);
    const nav = raiz().querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Navegación principal');
    expect(nav.querySelectorAll('a app-icono[aria-hidden="true"]')).toHaveLength(4);
    expect(raiz().querySelector('a.cab__marca')?.getAttribute('href')).toBe('/paciente/citas');
    expect(enlace(fixture, 'Crear cuenta')).toBeUndefined();
  });

  it('muestra el contador de no leídas en «Notificaciones» y un punto en el menú móvil', async () => {
    await conSesion(PACIENTE);
    expect(raiz().querySelector('.insignia-numero')).toBeNull();
    noLeidas.set(3);
    await fixture.whenStable();
    const notificaciones = Array.from(raiz().querySelectorAll('nav a')).find((a) =>
      a.textContent!.includes('Notificaciones'),
    )!;
    const insignia = notificaciones.querySelector('.insignia-numero')!;
    expect(insignia.textContent!.trim()).toBe('3');
    expect(insignia.getAttribute('aria-hidden')).toBe('true');
    expect(notificaciones.querySelector('.solo-lectores')!.textContent).toContain('3 sin leer');
    const botonNav = raiz().querySelector<HTMLButtonElement>('.cab__boton-nav')!;
    expect(botonNav.textContent).toContain('tienes notificaciones sin leer');
    expect(botonNav.querySelector('.insignia-punto')?.getAttribute('aria-hidden')).toBe('true');

    noLeidas.set(14);
    await fixture.whenStable();
    expect(raiz().querySelector('.insignia-numero')!.textContent!.trim()).toBe('9+');
  });

  it('no muestra el contador a otros roles (ni carga su componente)', async () => {
    noLeidas.set(5);
    await conSesion(OPERADOR);
    expect(raiz().querySelector('.insignia-numero')).toBeNull();
    expect(raiz().querySelector('.insignia-punto')).toBeNull();
    expect(raiz().querySelector('app-contador-no-leidas')).toBeNull();
  });

  it('refresca el contador del paciente al navegar, salvo en la primera navegación de la sesión', async () => {
    await conSesion(PACIENTE);
    const router = TestBed.inject(Router);
    // La primera (la del inicio de sesión o de la carga) no pide nada: el servicio de
    // notificaciones ya consultó el contador al empezar la sesión (no dos conteos a la vez).
    await router.navigateByUrl('/otra');
    expect(refrescarConteo).not.toHaveBeenCalled();
    await router.navigateByUrl('/');
    expect(refrescarConteo).toHaveBeenCalledTimes(1);
    await router.navigateByUrl('/otra');
    expect(refrescarConteo).toHaveBeenCalledTimes(2);
  });

  it('no refresca el contador de otros roles al navegar', async () => {
    await conSesion(OPERADOR);
    await TestBed.inject(Router).navigateByUrl('/otra');
    expect(refrescarConteo).not.toHaveBeenCalled();
  });

  const enlacesMenu = () =>
    Array.from(menu().querySelectorAll<HTMLAnchorElement>('a.cab__menu-enlace')).map((a) => [
      a.textContent!.trim(),
      a.getAttribute('href'),
    ]);

  it('el menú del paciente ofrece «Mi perfil» y «Seguridad de la cuenta»', async () => {
    await conSesion(PACIENTE);
    await abrirMenu();
    expect(enlacesMenu()).toEqual([
      ['Mi perfil', '/paciente/perfil'],
      ['Seguridad de la cuenta', '/cuenta/seguridad'],
    ]);
  });

  it('el menú de cualquier otro rol ofrece «Seguridad de la cuenta» (no «Mi perfil»)', async () => {
    await conSesion(OPERADOR);
    await abrirMenu();
    expect(enlacesMenu()).toEqual([['Seguridad de la cuenta', '/cuenta/seguridad']]);
  });

  it('el panel del menú se carga en diferido: antes de abrirlo solo existe el destino de aria-controls', async () => {
    await conSesion(PACIENTE);
    expect(raiz().querySelector('app-menu-usuario')).toBeNull();
    expect(menu().hidden).toBe(true);
    expect(menu().children).toHaveLength(0);
    expect(raiz().querySelectorAll('#cab-menu-usuario')).toHaveLength(1);
    await abrirMenu();
    expect(raiz().querySelector('app-menu-usuario')).not.toBeNull();
    expect(raiz().querySelectorAll('#cab-menu-usuario')).toHaveLength(1);
    expect(menu().hidden).toBe(false);
  });

  it('muestra los enlaces del operador', async () => {
    await conSesion(OPERADOR);
    expect(texto(fixture)).toContain('Operador');
    expect(textosNavegacion()).toEqual(['Panel del día']);
  });

  it('el chip abre y cierra el menú de usuario (aria-expanded) y Escape devuelve el foco', async () => {
    await conSesion(PACIENTE);
    expect(chip().getAttribute('aria-controls')).toBe('cab-menu-usuario');
    expect(chip().getAttribute('aria-expanded')).toBe('false');
    expect(menu().hidden).toBe(true);

    await abrirMenu();
    expect(chip().getAttribute('aria-expanded')).toBe('true');
    expect(menu().hidden).toBe(false);
    expect(menu().textContent).toContain(PACIENTE.email);

    boton(fixture, 'Cerrar sesión')!.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(menu().hidden).toBe(true);
    expect(document.activeElement).toBe(chip());
  });

  it('un clic fuera cierra el menú; uno dentro no', async () => {
    await conSesion(PACIENTE);
    await abrirMenu();
    menu().click();
    await fixture.whenStable();
    expect(menu().hidden).toBe(false);
    document.body.click();
    await fixture.whenStable();
    expect(menu().hidden).toBe(true);
  });

  it('el botón de menú móvil controla la navegación', async () => {
    await conSesion(PACIENTE);
    const botonNav = raiz().querySelector<HTMLButtonElement>('.cab__boton-nav')!;
    expect(botonNav.getAttribute('aria-controls')).toBe('cab-navegacion');
    expect(botonNav.textContent).toContain('Menú de navegación');
    botonNav.click();
    await fixture.whenStable();
    expect(botonNav.getAttribute('aria-expanded')).toBe('true');
    expect(raiz().querySelector('#cab-navegacion')?.classList).toContain('cab__nav--abierta');
  });

  it('el selector de tema (Claro/Oscuro/Sistema) aplica y guarda la preferencia', async () => {
    await conSesion(PACIENTE);
    await abrirMenu();
    const radios = Array.from(menu().querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    expect(radios.map((r) => r.value)).toEqual(['claro', 'oscuro', 'sistema']);
    expect(menu().querySelector('legend')?.textContent?.trim()).toBe('Tema');
    expect(radios[2].checked).toBe(true);

    radios[1].click();
    await fixture.whenStable();
    expect(document.documentElement.classList).toContain('tema-oscuro');
    expect(localStorage.getItem(CLAVE_TEMA)).toBe('oscuro');

    radios[2].click();
    await fixture.whenStable();
    expect(document.documentElement.classList).not.toContain('tema-oscuro');
    expect(localStorage.getItem(CLAVE_TEMA)).toBeNull();
  });

  it('Cerrar sesión hace POST /auth/logout y vuelve a /login', async () => {
    await conSesion(PACIENTE);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await abrirMenu();
    boton(fixture, 'Cerrar sesión')!.click();
    await fixture.whenStable();
    expect(boton(fixture, 'Cerrando sesión…')?.disabled).toBe(true);
    expect(raiz().querySelector('#cabecera-estado')?.textContent).toContain('Cerrando sesión');
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/logout' })
      .flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/login']);
    expect(TestBed.inject(AuthService).usuario()).toBeNull();
  });

  it('si el servidor no cierra la sesión, la conserva y muestra el error sin salir', async () => {
    await conSesion(PACIENTE);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await abrirMenu();
    boton(fixture, 'Cerrar sesión')!.click();
    await fixture.whenStable();
    http
      .expectOne({ method: 'POST', url: '/api/v1/auth/logout' })
      .flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    expect(navegar).not.toHaveBeenCalled();
    expect(TestBed.inject(AuthService).usuario()).toEqual(PACIENTE);
    expect(texto(fixture)).toContain(MENSAJE_ERROR_CIERRE);
    const estado = raiz().querySelector('#cabecera-estado')!;
    expect(estado.getAttribute('aria-live')).toBe('polite');
    expect(estado.textContent).toContain(MENSAJE_ERROR_CIERRE);
    const salir = boton(fixture, 'Cerrar sesión')!;
    expect(salir.disabled).toBe(false);
    expect(salir.getAttribute('aria-describedby')).toBe('cabecera-estado');
  });

  it('si la sesión ya no existía (401), vuelve a /login', async () => {
    await conSesion(PACIENTE);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await abrirMenu();
    boton(fixture, 'Cerrar sesión')!.click();
    await fixture.whenStable();
    http
      .expectOne('/api/v1/auth/logout')
      .flush(problema(401, 'NO_AUTENTICADO'), opcionesProblema(401));
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/login']);
    expect(texto(fixture)).not.toContain(MENSAJE_ERROR_CIERRE);
  });
});

describe('iniciales', () => {
  it('toma la inicial del primer y del último nombre', () => {
    expect(iniciales('Ana Demo')).toBe('AD');
    expect(iniciales('  maría  del  carmen  quispe ')).toBe('MQ');
    expect(iniciales('Olga')).toBe('OL');
    expect(iniciales('')).toBe('?');
  });
});

describe('textoContador', () => {
  it('muestra la cifra hasta 9 y «9+» desde 10', () => {
    expect(textoContador(1)).toBe('1');
    expect(textoContador(9)).toBe('9');
    expect(textoContador(10)).toBe('9+');
  });
});
