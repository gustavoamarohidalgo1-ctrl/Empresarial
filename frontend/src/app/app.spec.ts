import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { App, anioLima } from './app';
import { NotificacionesService } from './core/notificaciones/notificaciones.service';
import { AnuncioService } from './core/sistema/anuncio.service';
import { enlace } from '../testing/dom';

@Component({ template: '<p>Página</p>' })
class PaginaFalsa {}

const INFO = '/api/v1/sistema/info';

describe('App', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([
          { path: '', component: PaginaFalsa },
          { path: 'otra', component: PaginaFalsa },
          { path: 'tercera', component: PaginaFalsa },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: NotificacionesService,
          useValue: { noLeidas: signal(0), refrescarConteo: () => undefined },
        },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function crear(entorno: 'desarrollo' | 'produccion' | 'error' = 'produccion') {
    const fixture = TestBed.createComponent(App);
    const peticion = http.expectOne(INFO);
    if (entorno === 'error') {
      peticion.flush(null, { status: 500, statusText: 'Error' });
    } else {
      peticion.flush({ nombre: 'SIGA-SP', version: '1.1.0', entorno });
    }
    await fixture.whenStable();
    return fixture;
  }

  const raiz = (f: ComponentFixture<App>) => f.nativeElement as HTMLElement;

  it('ofrece «Saltar al contenido» como primer elemento enfocable y mueve el foco al principal', async () => {
    const fixture = await crear();
    document.body.appendChild(fixture.nativeElement);
    const primero = raiz(fixture).querySelector(
      'a, button, input, select, textarea',
    ) as HTMLAnchorElement;
    expect(primero.textContent?.trim()).toBe('Saltar al contenido');
    expect(primero.getAttribute('href')).toBe('#contenido');

    primero.click();
    expect(document.activeElement?.id).toBe('contenido');
    fixture.nativeElement.remove();
  });

  it('tiene las regiones principales (cabecera, main, pie)', async () => {
    const fixture = await crear();
    expect(raiz(fixture).querySelector('header')).toBeTruthy();
    expect(raiz(fixture).querySelector('main#contenido')).toBeTruthy();
    expect(raiz(fixture).querySelector('footer')?.textContent).toContain('hora de Lima');
  });

  it('el pie es profesional: ©, enlaces legales y hora de Lima, sin textos de prueba', async () => {
    const fixture = await crear();
    const pie = raiz(fixture).querySelector('footer')!;
    expect(pie.textContent).toContain(`© ${anioLima()} SIGA-SP`);
    expect(pie.textContent).toContain('Horarios en hora de Lima');
    expect(pie.textContent).not.toMatch(/sintétic|prueba|piloto|demo/i);
    expect(pie.querySelector('nav')?.getAttribute('aria-label')).toBe('Enlaces legales');
    expect(enlace(fixture, 'Privacidad')?.getAttribute('href')).toBe('/privacidad');
    expect(enlace(fixture, 'Accesibilidad')?.getAttribute('href')).toBe('/accesibilidad');
  });

  it('muestra la franja de entorno solo en desarrollo', async () => {
    const fixture = await crear('desarrollo');
    const franja = raiz(fixture).querySelector('.franja-entorno');
    expect(franja?.textContent?.trim()).toBe('Entorno de pruebas · datos ficticios');
    // No es enfocable ni va antes de «Saltar al contenido».
    expect(raiz(fixture).querySelector('a')?.textContent?.trim()).toBe('Saltar al contenido');
  });

  it('no muestra la franja en producción', async () => {
    const fixture = await crear('produccion');
    expect(raiz(fixture).querySelector('.franja-entorno')).toBeNull();
  });

  it('si /sistema/info falla, se comporta como producción', async () => {
    const fixture = await crear('error');
    expect(raiz(fixture).querySelector('.franja-entorno')).toBeNull();
  });

  it('la portada ocupa todo el ancho; las demás páginas usan el contenedor', async () => {
    const fixture = await crear();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await fixture.whenStable();
    const principal = raiz(fixture).querySelector('main')!;
    expect(principal.classList).toContain('principal--completa');
    expect(principal.querySelector(':scope > div:last-child')?.classList).not.toContain(
      'contenedor',
    );

    await router.navigateByUrl('/otra');
    await fixture.whenStable();
    expect(principal.classList).not.toContain('principal--completa');
    expect(principal.querySelector(':scope > div:last-child')?.classList).toContain('contenedor');
  });

  it('muestra el anuncio global tras la siguiente navegación y lo retira en la posterior', async () => {
    const fixture = await crear();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/otra');
    TestBed.inject(AnuncioService).publicar({
      tipo: 'exito',
      titulo: 'Te damos la bienvenida, Lucía',
      texto: 'Tu cuenta está lista.',
      accion: { texto: 'Reservar una cita', ruta: '/paciente/reservar' },
    });
    await fixture.whenStable();
    const region = raiz(fixture).querySelector('.anuncio-global')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).not.toContain('bienvenida'); // aún no se navegó

    await router.navigateByUrl('/tercera');
    await fixture.whenStable();
    expect(region.textContent).toContain('Te damos la bienvenida, Lucía');
    expect(region.querySelector('.aviso--exito')).not.toBeNull();
    expect(enlace(fixture, 'Reservar una cita')?.getAttribute('href')).toBe('/paciente/reservar');

    await router.navigateByUrl('/otra');
    await fixture.whenStable();
    expect(region.textContent).not.toContain('bienvenida');
  });

  it('el anuncio global se carga en diferido: la región viva existe desde el inicio', async () => {
    const fixture = await crear();
    const region = raiz(fixture).querySelector('.anuncio-global')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(raiz(fixture).querySelector('app-anuncio-global')).toBeNull();
    TestBed.inject(AnuncioService).publicar({ tipo: 'info', titulo: 'Aviso', texto: 'Texto.' });
    await TestBed.inject(Router).navigateByUrl('/otra');
    await fixture.whenStable();
    expect(region.querySelector('app-anuncio-global')).not.toBeNull();
    expect(region.classList).toContain('anuncio-global--visible');
    expect(region.textContent).toContain('Aviso');
  });

  it('«Cerrar aviso» retira el anuncio y deja el foco en el contenido', async () => {
    const fixture = await crear();
    document.body.appendChild(fixture.nativeElement);
    TestBed.inject(AnuncioService).publicar({ tipo: 'exito', titulo: 'Hola', texto: 'Listo.' });
    await TestBed.inject(Router).navigateByUrl('/otra');
    await fixture.whenStable();
    const cerrar = Array.from(raiz(fixture).querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Cerrar aviso'),
    )!;
    cerrar.click();
    await fixture.whenStable();
    expect(raiz(fixture).querySelector('.anuncio-global')?.textContent).not.toContain('Hola');
    expect(document.activeElement?.id).toBe('contenido');
    fixture.nativeElement.remove();
  });
});

describe('anioLima', () => {
  it('usa el año de Lima (UTC−5) aunque en UTC ya sea el año siguiente', () => {
    expect(anioLima(new Date('2027-01-01T03:00:00Z'))).toBe('2026');
    expect(anioLima(new Date('2027-01-01T06:00:00Z'))).toBe('2027');
  });
});
