import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OPERADOR, PACIENTE } from '../../../testing/datos-prueba';
import { AuthService } from '../auth/auth.service';
import { UsuarioSesion } from '../modelos/contrato';
import {
  ESPERA_MAXIMA_CONSULTA_MS,
  INTERVALO_SONDEO_MS,
  LIMITE_INACTIVIDAD_MS,
  NotificacionesService,
  RETRASO_AVISO_ASINCRONO_MS,
  SEPARACION_MINIMA_MS,
} from './notificaciones.service';

const CONTEO = '/api/v1/pacientes/me/notificaciones/no-leidas';

describe('NotificacionesService', () => {
  let usuario: WritableSignal<UsuarioSesion | null>;
  let http: HttpTestingController;
  let visibilidad: DocumentVisibilityState;

  function crear(inicial: UsuarioSesion | null = PACIENTE): NotificacionesService {
    usuario = signal(inicial);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { usuario } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const servicio = TestBed.inject(NotificacionesService);
    TestBed.tick();
    return servicio;
  }

  function cambiarVisibilidad(valor: DocumentVisibilityState): void {
    visibilidad = valor;
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function conteos() {
    return http.match(CONTEO);
  }

  function interactuar(tipo = 'pointerdown'): void {
    document.dispatchEvent(new Event(tipo));
  }

  /** Avanza el reloj respondiendo cada consulta del sondeo; devuelve cuántas hubo. */
  function avanzarRespondiendo(ms: number, paso = INTERVALO_SONDEO_MS): number {
    let total = 0;
    for (let t = 0; t < ms; t += paso) {
      vi.advanceTimersByTime(Math.min(paso, ms - t));
      const pendientes = conteos();
      pendientes.forEach((r) => r.flush({ total: 1 }));
      total += pendientes.length;
    }
    return total;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    visibilidad = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibilidad);
  });

  afterEach(() => {
    http.verify();
    TestBed.resetTestingModule();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('con un paciente en sesión consulta el contador al empezar', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 3 });
    expect(servicio.noLeidas()).toBe(3);
  });

  it('sondea cada 60 s mientras la pestaña está visible', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 1 });

    vi.advanceTimersByTime(INTERVALO_SONDEO_MS - 1);
    expect(conteos().length).toBe(0);
    vi.advanceTimersByTime(1);
    http.expectOne(CONTEO).flush({ total: 4 });
    expect(servicio.noLeidas()).toBe(4);

    vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
    http.expectOne(CONTEO).flush({ total: 2 });
    expect(servicio.noLeidas()).toBe(2);
  });

  it('se pausa con la pestaña oculta y consulta en el acto al volver', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 1 });

    cambiarVisibilidad('hidden');
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS * 5);
    expect(conteos().length).toBe(0);

    cambiarVisibilidad('visible');
    http.expectOne(CONTEO).flush({ total: 5 });
    expect(servicio.noLeidas()).toBe(5);

    vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
    http.expectOne(CONTEO).flush({ total: 5 });
  });

  it('se detiene al cerrar sesión y deja el contador en 0', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 3 });

    usuario.set(null);
    TestBed.tick();
    expect(servicio.noLeidas()).toBe(0);
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS * 3);
    expect(conteos().length).toBe(0);
    cambiarVisibilidad('visible');
    expect(conteos().length).toBe(0);
  });

  it('no consulta nada para otros roles, ni siquiera si se pide refrescar', () => {
    const servicio = crear(OPERADOR);
    servicio.refrescarConteo();
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS * 2);
    expect(conteos().length).toBe(0);
    expect(servicio.noLeidas()).toBe(0);
  });

  it('al cambiar de rol se detiene; al volver un paciente empieza de nuevo', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 2 });

    usuario.set(OPERADOR);
    TestBed.tick();
    expect(servicio.noLeidas()).toBe(0);
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
    expect(conteos().length).toBe(0);

    usuario.set({ ...PACIENTE, id: 'u-9' });
    TestBed.tick();
    http.expectOne(CONTEO).flush({ total: 7 });
    expect(servicio.noLeidas()).toBe(7);
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
    http.expectOne(CONTEO).flush({ total: 7 });
  });

  it('descarta la respuesta que llega después de cerrar sesión', () => {
    const servicio = crear();
    const pendiente = http.expectOne(CONTEO);
    usuario.set(null);
    TestBed.tick();
    expect(pendiente.cancelled).toBe(true);
    expect(servicio.noLeidas()).toBe(0);
  });

  it('un error conserva el último valor y el sondeo sigue', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 2 });
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
    http.expectOne(CONTEO).flush(null, { status: 503, statusText: 'No disponible' });
    expect(servicio.noLeidas()).toBe(2);
    vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
    http.expectOne(CONTEO).flush({ total: 0 });
    expect(servicio.noLeidas()).toBe(0);
  });

  it('listar pide el límite indicado (máximo 100)', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 0 });
    servicio.listar(500).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/pacientes/me/notificaciones');
    expect(req.request.params.get('limite')).toBe('100');
    req.flush([]);
  });

  it('marcarLeida envía el POST y vuelve a pedir el contador', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 2 });
    servicio.marcarLeida('n 1').subscribe();
    const req = http.expectOne('/api/v1/pacientes/me/notificaciones/n%201/lectura');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne(CONTEO).flush({ total: 1 });
    expect(servicio.noLeidas()).toBe(1);
  });

  it('marcarTodas deja el contador en 0', () => {
    const servicio = crear();
    http.expectOne(CONTEO).flush({ total: 6 });
    servicio.marcarTodas().subscribe();
    const req = http.expectOne('/api/v1/pacientes/me/notificaciones/lectura');
    expect(req.request.method).toBe('POST');
    req.flush(null, { status: 204, statusText: 'No Content' });
    expect(servicio.noLeidas()).toBe(0);
  });
  describe('inactividad', () => {
    it('sin interacción durante 15 min deja de sondear; la primera interacción consulta en el acto', () => {
      const servicio = crear();
      http.expectOne(CONTEO).flush({ total: 1 });

      // Minutos 1 a 14: sondea; en el 15 ya no (la sesión del servidor puede caducar).
      expect(avanzarRespondiendo(LIMITE_INACTIVIDAD_MS - INTERVALO_SONDEO_MS)).toBe(14);
      vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
      expect(conteos().length).toBe(0);
      vi.advanceTimersByTime(INTERVALO_SONDEO_MS * 30);
      expect(conteos().length).toBe(0);

      interactuar('pointerdown');
      http.expectOne(CONTEO).flush({ total: 6 });
      expect(servicio.noLeidas()).toBe(6);
      // Interacciones seguidas no repiten la consulta.
      interactuar('pointerdown');
      expect(conteos().length).toBe(0);

      // El sondeo se reanuda.
      vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
      http.expectOne(CONTEO).flush({ total: 6 });
    });

    it.each(['keydown', 'wheel', 'touchstart'])('«%s» también cuenta como interacción', (tipo) => {
      crear();
      http.expectOne(CONTEO).flush({ total: 0 });
      avanzarRespondiendo(LIMITE_INACTIVIDAD_MS);
      expect(conteos().length).toBe(0);

      interactuar(tipo);
      http.expectOne(CONTEO).flush({ total: 0 });
    });

    it('con interacción frecuente sigue sondeando más allá de 15 min', () => {
      crear();
      http.expectOne(CONTEO).flush({ total: 0 });
      let consultas = 0;
      for (let minuto = 0; minuto < 30; minuto += 10) {
        consultas += avanzarRespondiendo(10 * 60_000);
        interactuar('keydown');
      }
      expect(consultas).toBe(30);
    });

    it('volver a la pestaña tras 15 min sin interacción no consulta hasta que la persona actúa', () => {
      crear();
      http.expectOne(CONTEO).flush({ total: 2 });
      cambiarVisibilidad('hidden');
      vi.advanceTimersByTime(LIMITE_INACTIVIDAD_MS + 1);

      cambiarVisibilidad('visible');
      vi.advanceTimersByTime(INTERVALO_SONDEO_MS * 3);
      expect(conteos().length).toBe(0);

      interactuar('pointerdown');
      http.expectOne(CONTEO).flush({ total: 2 });
      vi.advanceTimersByTime(INTERVALO_SONDEO_MS);
      http.expectOne(CONTEO).flush({ total: 2 });
    });

    it('en reposo ignora los refrescos sin forzar (p. ej. una navegación sin interacción)', () => {
      const servicio = crear();
      http.expectOne(CONTEO).flush({ total: 0 });
      avanzarRespondiendo(LIMITE_INACTIVIDAD_MS);

      servicio.refrescarConteo();
      expect(conteos().length).toBe(0);
      servicio.refrescarConteo({ forzar: true });
      http.expectOne(CONTEO).flush({ total: 1 });
    });

    it('escucha las interacciones con oyentes pasivos en captura y los retira al destruirse', () => {
      const alta = vi.spyOn(document, 'addEventListener');
      const baja = vi.spyOn(document, 'removeEventListener');
      crear(null);
      for (const tipo of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
        expect(alta).toHaveBeenCalledWith(tipo, expect.any(Function), {
          capture: true,
          passive: true,
        });
      }
      TestBed.resetTestingModule();
      for (const tipo of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
        expect(baja).toHaveBeenCalledWith(tipo, expect.any(Function), {
          capture: true,
          passive: true,
        });
      }
    });
  });

  describe('consultas duplicadas', () => {
    it('al iniciar sesión, el refresco de la cabecera no repite la consulta', () => {
      const servicio = crear(null);
      usuario.set(PACIENTE);
      TestBed.tick();
      servicio.refrescarConteo(); // NavigationEnd tras el login
      http.expectOne(CONTEO).flush({ total: 2 });
      servicio.refrescarConteo(); // otra navegación enseguida
      expect(conteos().length).toBe(0);
      expect(servicio.noLeidas()).toBe(2);
    });

    it('no lanza otra si hay una en vuelo ni si la última fue hace menos de 5 s', () => {
      const servicio = crear();
      const enVuelo = http.expectOne(CONTEO);
      vi.advanceTimersByTime(SEPARACION_MINIMA_MS * 2);
      servicio.refrescarConteo();
      expect(conteos().length).toBe(0);
      enVuelo.flush({ total: 1 });

      vi.advanceTimersByTime(1_000);
      interactuar();
      servicio.refrescarConteo();
      expect(conteos().length).toBe(0);
    });

    it('una consulta colgada más de 30 s no bloquea el sondeo', () => {
      const servicio = crear();
      const colgada = http.expectOne(CONTEO);
      vi.advanceTimersByTime(ESPERA_MAXIMA_CONSULTA_MS - 1);
      servicio.refrescarConteo();
      expect(conteos().length).toBe(0);
      vi.advanceTimersByTime(INTERVALO_SONDEO_MS - ESPERA_MAXIMA_CONSULTA_MS + 1);
      expect(colgada.cancelled).toBe(true);
      http.expectOne(CONTEO).flush({ total: 2 });
      expect(servicio.noLeidas()).toBe(2);
    });

    it('pasados 5 s desde la última, vuelve a consultar', () => {
      const servicio = crear();
      http.expectOne(CONTEO).flush({ total: 1 });
      vi.advanceTimersByTime(SEPARACION_MINIMA_MS - 1);
      servicio.refrescarConteo();
      expect(conteos().length).toBe(0);
      vi.advanceTimersByTime(1);
      servicio.refrescarConteo();
      http.expectOne(CONTEO).flush({ total: 3 });
      expect(servicio.noLeidas()).toBe(3);
    });

    it('un error no bloquea la consulta siguiente pasados 5 s', () => {
      const servicio = crear();
      http.expectOne(CONTEO).flush(null, { status: 503, statusText: 'No disponible' });
      vi.advanceTimersByTime(SEPARACION_MINIMA_MS);
      servicio.refrescarConteo();
      http.expectOne(CONTEO).flush({ total: 4 });
      expect(servicio.noLeidas()).toBe(4);
    });

    it('forzar descarta la consulta en vuelo y lanza una nueva en el acto', () => {
      const servicio = crear();
      const anterior = http.expectOne(CONTEO);
      servicio.refrescarConteo({ forzar: true });
      expect(anterior.cancelled).toBe(true);
      http.expectOne(CONTEO).flush({ total: 8 });
      expect(servicio.noLeidas()).toBe(8);
    });

    it('marcarTodas descarta la consulta en vuelo para que no devuelva un valor anterior', () => {
      const servicio = crear();
      const enVuelo = http.expectOne(CONTEO);
      servicio.marcarTodas().subscribe();
      http
        .expectOne('/api/v1/pacientes/me/notificaciones/lectura')
        .flush(null, { status: 204, statusText: 'No Content' });
      expect(enVuelo.cancelled).toBe(true);
      expect(servicio.noLeidas()).toBe(0);
    });
  });

  describe('refrescarTrasAccion', () => {
    it('consulta en el acto y otra vez a los 2,5 s, aunque la última sea reciente', () => {
      const servicio = crear();
      http.expectOne(CONTEO).flush({ total: 0 });

      servicio.refrescarTrasAccion();
      http.expectOne(CONTEO).flush({ total: 0 });
      vi.advanceTimersByTime(RETRASO_AVISO_ASINCRONO_MS - 1);
      expect(conteos().length).toBe(0);
      vi.advanceTimersByTime(1);
      http.expectOne(CONTEO).flush({ total: 1 });
      expect(servicio.noLeidas()).toBe(1);
      vi.advanceTimersByTime(RETRASO_AVISO_ASINCRONO_MS * 2);
      expect(conteos().length).toBe(0);
    });

    it('el refresco diferido se cancela al cerrar sesión', () => {
      const servicio = crear();
      http.expectOne(CONTEO).flush({ total: 0 });
      servicio.refrescarTrasAccion();
      http.expectOne(CONTEO).flush({ total: 0 });
      usuario.set(null);
      TestBed.tick();
      vi.advanceTimersByTime(RETRASO_AVISO_ASINCRONO_MS);
      expect(conteos().length).toBe(0);
    });

    it('sin paciente en sesión no hace nada', () => {
      const servicio = crear(OPERADOR);
      servicio.refrescarTrasAccion();
      vi.advanceTimersByTime(RETRASO_AVISO_ASINCRONO_MS);
      expect(conteos().length).toBe(0);
    });
  });
});
