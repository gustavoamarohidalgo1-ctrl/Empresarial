import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CacheService } from '../../../core/cache/cache.service';
import { NotificacionPaciente } from '../../../core/modelos/contrato';
import { NotificacionesService } from '../../../core/notificaciones/notificaciones.service';
import { adjuntar, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, query, texto } from '../../../../testing/dom';
import { CLAVE_NOTIFICACIONES, NotificacionesComponent } from './notificaciones';

const LISTA = '/api/v1/pacientes/me/notificaciones';

/** Destino del enlace a la cita (la navegación no importa en estas pruebas). */
@Component({ template: '' })
class DestinoComponent {}

/** «Ahora» es el viernes 23 de octubre de 2026 a las 10:00 de Lima. */
const AHORA = '2026-10-23T15:00:00Z';

function notificacion(parcial: Partial<NotificacionPaciente>): NotificacionPaciente {
  return {
    id: 'n-1',
    tipo: 'RECORDATORIO',
    titulo: 'Recordatorio de tu cita',
    mensaje: 'Tienes la cita SP-2026-000124 de Cardiología mañana a las 09:00 en Sede Surco.',
    citaId: 'c-1',
    citaCodigo: 'SP-2026-000124',
    creadaEn: '2026-10-23T14:05:00Z',
    leida: false,
    ...parcial,
  };
}

const NOTIFICACIONES: NotificacionPaciente[] = [
  notificacion({ id: 'n-1' }), // hoy 09:05, no leída
  notificacion({
    id: 'n-2',
    tipo: 'CAMBIO',
    titulo: 'Cita reprogramada',
    mensaje: 'Tu cita SP-2026-000120 se reprogramó al lunes 26 de octubre a las 11:00.',
    citaId: 'c-2',
    citaCodigo: 'SP-2026-000120',
    creadaEn: '2026-10-22T20:30:00Z', // ayer 15:30
    leida: true,
  }),
  notificacion({
    id: 'n-3',
    tipo: 'CAMBIO',
    titulo: 'Reserva registrada',
    citaId: 'c-3',
    citaCodigo: 'SP-2026-000101',
    creadaEn: '2026-10-19T13:00:00Z', // lunes 19, 08:00
    leida: false,
  }),
];

describe('NotificacionesComponent', () => {
  let fixture: ComponentFixture<NotificacionesComponent>;
  let http: HttpTestingController;
  let soltar: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(AHORA));
    TestBed.configureTestingModule({
      imports: [NotificacionesComponent],
      providers: [
        provideRouter([{ path: 'paciente/citas/:id', component: DestinoComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    soltar();
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function crear(): Promise<void> {
    fixture = TestBed.createComponent(NotificacionesComponent);
    soltar = adjuntar(fixture.nativeElement);
    await fixture.whenStable();
  }

  function listar() {
    return http.expectOne((r) => r.url === LISTA);
  }

  async function cargar(lista = NOTIFICACIONES): Promise<void> {
    await crear();
    const req = listar();
    expect(req.request.params.get('limite')).toBe('50');
    req.flush(lista);
    await fixture.whenStable();
  }

  it('muestra esqueletos con aria-busy mientras carga', async () => {
    await crear();
    const panel = query(fixture, '.panel');
    expect(panel.getAttribute('aria-busy')).toBe('true');
    expect(panel.textContent).toContain('Cargando tus notificaciones…');
    expect(el().querySelectorAll('.panel .notif').length).toBe(4);
    listar().flush([]);
    await fixture.whenStable();
    expect(panel.getAttribute('aria-busy')).toBe('false');
  });

  it('agrupa por día («Hoy», «Ayer», fecha) de la más reciente a la más antigua', async () => {
    await cargar();
    const titulos = Array.from(el().querySelectorAll('h2.grupo__titulo')).map((h) => h.textContent);
    expect(titulos).toEqual(['Hoy', 'Ayer', 'Lunes, 19 de octubre de 2026']);
    const secciones = el().querySelectorAll('section.grupo');
    expect(secciones[0].getAttribute('aria-labelledby')).toBe('grupo-2026-10-23');
    expect(texto(fixture)).toContain('Se muestran 3 notificaciones, 2 sin leer.');
  });

  it('cada notificación tiene icono por tipo, título, mensaje, hora, estado y enlace a la cita', async () => {
    await cargar();
    const [primera, segunda] = Array.from(el().querySelectorAll<HTMLElement>('li.notif'));
    expect(primera.classList.contains('notif--no-leida')).toBe(true);
    expect(primera.querySelector('h3')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'No leída: Recordatorio de tu cita',
    );
    expect(primera.querySelector('time')!.textContent!.trim()).toBe('09:05');
    expect(primera.querySelector('time')!.getAttribute('datetime')).toBe('2026-10-23T14:05:00Z');
    expect(primera.textContent).toContain('Tienes la cita SP-2026-000124 de Cardiología');
    expect(primera.textContent).toContain('Recordatorio');
    expect(primera.querySelector('.notif__nueva')!.textContent).toContain('No leída');
    expect(primera.querySelector('.notif__icono--cambio')).toBeNull();
    expect(primera.querySelector('a')!.getAttribute('href')).toBe('/paciente/citas/c-1');

    expect(segunda.classList.contains('notif--no-leida')).toBe(false);
    expect(segunda.querySelector('.notif__icono--cambio')).toBeTruthy();
    expect(segunda.textContent).toContain('Cambio en tu cita');
    expect(segunda.querySelector('.notif__nueva')).toBeNull();
    expect(segunda.querySelector('time')!.textContent!.trim()).toBe('15:30');
  });

  it('el subtítulo y el filtro muestran cuántas hay sin leer', async () => {
    await cargar();
    expect(query(fixture, 'app-encabezado-pagina').textContent).toContain('Tienes 2 sin leer.');
    const noLeidas = boton(fixture, /^No leídas/)!;
    expect(noLeidas.textContent).toContain('2');
    expect(boton(fixture, 'Todas')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('el filtro «No leídas» deja solo las no leídas y, si no hay, dice que estás al día', async () => {
    await cargar();
    boton(fixture, /^No leídas/)!.click();
    await fixture.whenStable();
    expect(boton(fixture, /^No leídas/)!.getAttribute('aria-pressed')).toBe('true');
    expect(el().querySelectorAll('li.notif').length).toBe(2);
    expect(texto(fixture)).not.toContain('Cita reprogramada');

    boton(fixture, 'Marcar todas como leídas')!.click();
    await fixture.whenStable();
    http.expectOne(`${LISTA}/lectura`).flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Estás al día');
    boton(fixture, 'Ver todas')!.click();
    await fixture.whenStable();
    expect(el().querySelectorAll('li.notif').length).toBe(3);
  });

  it('«Marcar todas como leídas» las marca, lo anuncia y mueve el foco al resultado', async () => {
    const servicio = TestBed.inject(NotificacionesService);
    servicio.noLeidas.set(2);
    await cargar();
    const marcar = boton(fixture, 'Marcar todas como leídas')!;
    marcar.click();
    await fixture.whenStable();
    expect(marcar.classList.contains('btn--cargando')).toBe(true);
    expect(marcar.getAttribute('aria-disabled')).toBe('true');
    const req = http.expectOne(`${LISTA}/lectura`);
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await fixture.whenStable();

    expect(el().querySelectorAll('.notif--no-leida').length).toBe(0);
    expect(servicio.noLeidas()).toBe(0);
    expect(boton(fixture, 'Marcar todas como leídas')!.disabled).toBe(true);
    const activo = document.activeElement as HTMLElement;
    expect(activo.classList.contains('foco-resultado')).toBe(true);
    expect(activo.textContent).toContain('Marcamos todas tus notificaciones como leídas.');
    // La lista guardada también queda al día.
    const guardada =
      TestBed.inject(CacheService).leer<NotificacionPaciente[]>(CLAVE_NOTIFICACIONES)!;
    expect(guardada.every((n) => n.leida)).toBe(true);
  });

  it('si «Marcar todas» falla, lo explica sin cambiar la lista', async () => {
    await cargar();
    boton(fixture, 'Marcar todas como leídas')!.click();
    await fixture.whenStable();
    http.expectOne(`${LISTA}/lectura`).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No pudimos marcarlas como leídas');
    expect(el().querySelectorAll('.notif--no-leida').length).toBe(2);
  });

  it('al abrir una notificación no leída se marca como leída', async () => {
    await cargar();
    const servicio = TestBed.inject(NotificacionesService);
    const marcar = vi.spyOn(servicio, 'marcarLeida');
    enlace(fixture, /Recordatorio de tu cita/)!.click();
    await fixture.whenStable();
    expect(marcar).toHaveBeenCalledWith('n-1');
    http.expectOne(`${LISTA}/n-1/lectura`).flush(null, { status: 204, statusText: 'No Content' });
    expect(el().querySelectorAll('.notif--no-leida').length).toBe(1);

    // Una ya leída no vuelve a marcarse.
    marcar.mockClear();
    enlace(fixture, /Cita reprogramada/)!.click();
    expect(marcar).not.toHaveBeenCalled();
  });

  it('si marcar una como leída falla, se olvida la lista guardada', async () => {
    await cargar();
    enlace(fixture, /Recordatorio de tu cita/)!.click();
    await fixture.whenStable();
    http
      .expectOne(`${LISTA}/n-1/lectura`)
      .flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    expect(TestBed.inject(CacheService).leer(CLAVE_NOTIFICACIONES)).toBeUndefined();
  });

  it('sin notificaciones muestra un estado vacío con «Reservar cita»', async () => {
    await cargar([]);
    expect(texto(fixture)).toContain('Aún no tienes notificaciones');
    expect(enlace(fixture, 'Reservar cita')!.getAttribute('href')).toBe('/paciente/reservar');
    expect(boton(fixture, 'Marcar todas como leídas')).toBeUndefined();
    expect(texto(fixture)).toContain('No tienes notificaciones.');
  });

  it('muestra el error con un botón de reintento', async () => {
    await crear();
    listar().flush(problema(503, 'ERROR_INTERNO'), opcionesProblema(503));
    await fixture.whenStable();
    expect(query(fixture, '[role="alert"]').textContent).toContain(
      'No pudimos cargar tus notificaciones',
    );
    boton(fixture, 'Reintentar')!.click();
    await fixture.whenStable();
    listar().flush(NOTIFICACIONES);
    await fixture.whenStable();
    expect(el().querySelectorAll('li.notif').length).toBe(3);
  });

  it('al volver muestra lo guardado al instante y lo actualiza en segundo plano', async () => {
    TestBed.inject(CacheService).guardar(CLAVE_NOTIFICACIONES, NOTIFICACIONES);
    await crear();
    expect(el().querySelectorAll('li.notif').length).toBe(3);
    expect(query(fixture, '.panel').getAttribute('aria-busy')).toBe('false');
    expect(texto(fixture)).toContain('Actualizando…');
    listar().flush(NOTIFICACIONES.slice(0, 1));
    await fixture.whenStable();
    expect(el().querySelectorAll('li.notif').length).toBe(1);
    expect(texto(fixture)).not.toContain('Actualizando…');
  });

  it('al cargar la lista pone al día el contador de la cabecera', async () => {
    const refrescar = vi.spyOn(TestBed.inject(NotificacionesService), 'refrescarConteo');
    await cargar();
    expect(refrescar).toHaveBeenCalled();
  });
});
