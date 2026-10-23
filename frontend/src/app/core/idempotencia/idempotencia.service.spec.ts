import { HttpClient, HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Operacion } from '../modelos/contrato';
import { UUID_V4, opcionesProblema, problema } from '../../../testing/datos-prueba';
import {
  CABECERA_IDEMPOTENCIA,
  IdempotenciaService,
  IntencionIdempotente,
  ResultadoOperacion,
  esRespuestaPerdida,
  generarClave,
} from './idempotencia.service';
import { HttpErrorResponse } from '@angular/common/http';

const URL = '/api/v1/pacientes/me/citas/c-1/confirmacion';

function operacion(parcial: Partial<Operacion>): Operacion {
  return {
    clave: 'k',
    tipo: 'CONFIRMAR_CITA',
    recursoId: 'c-1',
    estado: 'COMPLETADA',
    httpStatus: 200,
    codigoError: null,
    registradaEn: '2026-11-04T13:00:00Z',
    ...parcial,
  };
}

describe('IntencionIdempotente', () => {
  it('reutiliza la clave mientras el contenido no cambie', () => {
    let n = 0;
    const intencion = new IntencionIdempotente(() => `clave-${++n}`);
    expect(intencion.clavePara({ v: 1 })).toBe('clave-1');
    expect(intencion.clavePara({ v: 1 })).toBe('clave-1');
  });

  it('genera otra clave si el contenido cambia (otra intención)', () => {
    let n = 0;
    const intencion = new IntencionIdempotente(() => `clave-${++n}`);
    intencion.clavePara({ v: 1 });
    expect(intencion.clavePara({ v: 2 })).toBe('clave-2');
  });

  it('genera otra clave después de cerrar la intención', () => {
    let n = 0;
    const intencion = new IntencionIdempotente(() => `clave-${++n}`);
    intencion.clavePara({ v: 1 });
    intencion.cerrar();
    expect(intencion.claveActual).toBeNull();
    expect(intencion.clavePara({ v: 1 })).toBe('clave-2');
  });
});

describe('generarClave', () => {
  it('genera un UUID v4', () => {
    expect(generarClave()).toMatch(UUID_V4);
    expect(generarClave()).not.toBe(generarClave());
  });

  it('usa getRandomValues si randomUUID no existe (contexto no seguro)', () => {
    const original = globalThis.crypto.randomUUID;
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
      value: undefined,
      configurable: true,
    });
    try {
      expect(generarClave()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('esRespuestaPerdida', () => {
  it('considera perdida la respuesta con status 0 o un 502/503/504 sin problem+json', () => {
    expect(esRespuestaPerdida(new HttpErrorResponse({ status: 0 }))).toBe(true);
    expect(
      esRespuestaPerdida(new HttpErrorResponse({ status: 504, error: 'Gateway Timeout' })),
    ).toBe(true);
    expect(
      esRespuestaPerdida(
        new HttpErrorResponse({ status: 503, error: problema(503, 'ERROR_INTERNO') }),
      ),
    ).toBe(false);
    expect(
      esRespuestaPerdida(
        new HttpErrorResponse({ status: 409, error: problema(409, 'VERSION_OBSOLETA') }),
      ),
    ).toBe(false);
    expect(esRespuestaPerdida(new Error('x'))).toBe(false);
  });
});

describe('IdempotenciaService', () => {
  let servicio: IdempotenciaService;
  let http: HttpClient;
  let control: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    servicio = TestBed.inject(IdempotenciaService);
    http = TestBed.inject(HttpClient);
    control = TestBed.inject(HttpTestingController);
  });

  afterEach(() => control.verify());

  const peticion = (cuerpo: unknown) => (headers: HttpHeaders) =>
    http.post<{ ok: boolean }>(URL, cuerpo, { headers });

  function ejecutar(intencion: IntencionIdempotente, cuerpo: unknown) {
    const resultados: ResultadoOperacion<{ ok: boolean }>[] = [];
    servicio.ejecutar(intencion, cuerpo, peticion(cuerpo)).subscribe((r) => resultados.push(r));
    return resultados;
  }

  function perderRespuesta() {
    const req = control.expectOne({ method: 'POST', url: URL });
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA);
    req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
    return clave;
  }

  it('envía la cabecera Idempotency-Key con un UUID y devuelve éxito', () => {
    const intencion = servicio.nuevaIntencion();
    const r = ejecutar(intencion, { versionAgenda: 1 });
    const req = control.expectOne({ method: 'POST', url: URL });
    expect(req.request.headers.get(CABECERA_IDEMPOTENCIA)).toMatch(UUID_V4);
    req.flush({ ok: true });
    expect(r).toEqual([{ estado: 'exito', datos: { ok: true } }]);
    expect(intencion.claveActual).toBeNull();
  });

  it('respuesta perdida + /operaciones COMPLETADA → éxito verificado', () => {
    const r = ejecutar(servicio.nuevaIntencion(), { versionAgenda: 1 });
    const clave = perderRespuesta();
    const consulta = control.expectOne({ method: 'GET', url: `/api/v1/operaciones/${clave}` });
    consulta.flush(operacion({ clave: clave!, estado: 'COMPLETADA' }));
    expect(r[0].estado).toBe('exito-verificado');
  });

  it('respuesta perdida + /operaciones RECHAZADA → rechazo con el mensaje del código', () => {
    const r = ejecutar(servicio.nuevaIntencion(), { versionAgenda: 1 });
    const clave = perderRespuesta();
    control
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(operacion({ estado: 'RECHAZADA', httpStatus: 409, codigoError: 'VERSION_OBSOLETA' }));
    expect(r[0].estado).toBe('rechazada');
    if (r[0].estado === 'rechazada') {
      expect(r[0].error.codigo).toBe('VERSION_OBSOLETA');
      expect(r[0].error.status).toBe(409);
    }
  });

  it('respuesta perdida + 404 → no registrada, y el reintento usa la MISMA clave', () => {
    const intencion = servicio.nuevaIntencion();
    const cuerpo = { versionAgenda: 1 };
    const primero = ejecutar(intencion, cuerpo);
    const clave = perderRespuesta();
    control
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(problema(404, 'RECURSO_NO_ENCONTRADO'), opcionesProblema(404));
    expect(primero).toEqual([{ estado: 'no-registrada', clave }]);

    const segundo = ejecutar(intencion, cuerpo);
    const reintento = control.expectOne({ method: 'POST', url: URL });
    expect(reintento.request.headers.get(CABECERA_IDEMPOTENCIA)).toBe(clave);
    reintento.flush({ ok: true });
    expect(segundo[0].estado).toBe('exito');
  });

  it('si la consulta también falla, el resultado queda sin confirmar (no afirma éxito ni rechazo)', () => {
    const intencion = servicio.nuevaIntencion();
    const r = ejecutar(intencion, { versionAgenda: 1 });
    const clave = perderRespuesta();
    control
      .expectOne(`/api/v1/operaciones/${clave}`)
      .error(new ProgressEvent('error'), { status: 0 });
    expect(r).toEqual([{ estado: 'sin-confirmar', clave }]);
    expect(intencion.claveActual).toBe(clave);
  });

  it('un error del servidor (409) es un rechazo definitivo: no consulta /operaciones', () => {
    const intencion = servicio.nuevaIntencion();
    const r = ejecutar(intencion, { versionAgenda: 1 });
    control
      .expectOne({ method: 'POST', url: URL })
      .flush(
        problema(409, 'VERSION_OBSOLETA', { detail: 'La cita fue modificada.' }),
        opcionesProblema(409),
      );
    control.expectNone((req) => req.url.startsWith('/api/v1/operaciones'));
    expect(r[0].estado).toBe('rechazada');
    expect(intencion.claveActual).toBeNull();
  });

  it('un 504 sin problem+json se trata como respuesta perdida', () => {
    const r = ejecutar(servicio.nuevaIntencion(), { versionAgenda: 1 });
    const req = control.expectOne({ method: 'POST', url: URL });
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA);
    req.flush('Gateway Timeout', { status: 504, statusText: 'Gateway Timeout' });
    control.expectOne(`/api/v1/operaciones/${clave}`).flush(operacion({ estado: 'COMPLETADA' }));
    expect(r[0].estado).toBe('exito-verificado');
  });

  it('una intención nueva usa una clave distinta', () => {
    ejecutar(servicio.nuevaIntencion(), { versionAgenda: 1 });
    const a = control.expectOne(URL);
    const claveA = a.request.headers.get(CABECERA_IDEMPOTENCIA);
    a.flush({ ok: true });
    ejecutar(servicio.nuevaIntencion(), { versionAgenda: 1 });
    const b = control.expectOne(URL);
    expect(b.request.headers.get(CABECERA_IDEMPOTENCIA)).not.toBe(claveA);
    b.flush({ ok: true });
  });
});
