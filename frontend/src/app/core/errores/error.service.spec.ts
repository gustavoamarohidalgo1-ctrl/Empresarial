import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { errorHttp, operacion, problema } from '../../../testing/datos-prueba';
import {
  ErrorService,
  MENSAJES_POR_CODIGO,
  codigoDe,
  minutosDeEspera,
  problemaDe,
} from './error.service';

describe('ErrorService', () => {
  let servicio: ErrorService;

  beforeEach(() => {
    servicio = TestBed.inject(ErrorService);
  });

  it('usa el detail y el codigo del problem+json', () => {
    const error = errorHttp(
      409,
      problema(409, 'VERSION_OBSOLETA', { detail: 'La cita fue modificada.' }),
    );
    const r = servicio.traducir(error);
    expect(r.status).toBe(409);
    expect(r.codigo).toBe('VERSION_OBSOLETA');
    expect(r.mensaje).toBe('La cita fue modificada.');
    expect(r.requestId).toBe('req-123');
    expect(r.sinConexion).toBe(false);
  });

  it('usa el mensaje por codigo cuando no hay detail', () => {
    const r = servicio.traducir(errorHttp(409, problema(409, 'HORARIO_NO_DISPONIBLE')));
    expect(r.mensaje).toBe(MENSAJES_POR_CODIGO['HORARIO_NO_DISPONIBLE']);
  });

  it('usa un mensaje por estado HTTP si no hay cuerpo problem+json', () => {
    expect(servicio.traducir(errorHttp(404, null)).mensaje).toContain('No encontramos');
    expect(servicio.traducir(errorHttp(422, 'texto plano')).mensaje).toContain(
      'No se pudo completar',
    );
  });

  it('nunca muestra el detalle de un 5xx y conserva el requestId', () => {
    const r = servicio.traducir(
      errorHttp(
        500,
        problema(500, 'ERROR_INTERNO', { detail: 'NullPointerException en X', requestId: 'abc' }),
      ),
    );
    expect(r.mensaje).toBe(`${MENSAJES_POR_CODIGO['ERROR_INTERNO']} Código de referencia: abc.`);
    expect(r.mensaje).not.toContain('NullPointer');
    expect(r.requestId).toBe('abc');
  });

  it('marca el error de red (status 0) como sin conexión', () => {
    const r = servicio.traducir(errorHttp(0, new ProgressEvent('error')));
    expect(r.sinConexion).toBe(true);
    expect(r.mensaje).toContain('No pudimos conectar');
  });

  it('agrupa errores[] por campo', () => {
    const r = servicio.traducir(
      errorHttp(
        400,
        problema(400, 'VALIDACION', {
          errores: [
            { campo: 'email', mensaje: 'Formato de correo inválido' },
            { campo: 'telefono', mensaje: 'Teléfono inválido' },
          ],
        }),
      ),
    );
    expect(servicio.erroresPorCampo(r)).toEqual({
      email: 'Formato de correo inválido',
      telefono: 'Teléfono inválido',
    });
  });

  it('traduce una operación RECHAZADA consultada en /operaciones', () => {
    const r = servicio.desdeOperacion({
      clave: 'k',
      tipo: 'CONFIRMAR_CITA',
      recursoId: 'c-1',
      estado: 'RECHAZADA',
      httpStatus: 422,
      codigoError: 'FUERA_DE_PLAZO',
      registradaEn: '2026-11-04T13:00:00Z',
    });
    expect(r.status).toBe(422);
    expect(r.codigo).toBe('FUERA_DE_PLAZO');
    expect(r.mensaje).toBe(MENSAJES_POR_CODIGO['FUERA_DE_PLAZO']);
  });

  it('lee el problem+json aunque llegue como texto', () => {
    const error = errorHttp(403, JSON.stringify(problema(403, 'CSRF_INVALIDO')));
    expect(problemaDe(error)?.codigo).toBe('CSRF_INVALIDO');
    expect(codigoDe(error)).toBe('CSRF_INVALIDO');
  });

  it('devuelve un mensaje genérico para errores que no son HTTP', () => {
    expect(servicio.traducir(new Error('x')).mensaje).toContain('No se pudo completar');
  });

  it('tiene mensajes para los códigos de la ampliación v1.1', () => {
    for (const codigo of [
      'CORREO_REGISTRADO',
      'CONTRASENA_INCORRECTA',
      'ENLACE_INVALIDO',
      'LIMITE_CITAS',
      'DEMASIADOS_INTENTOS',
    ]) {
      expect(MENSAJES_POR_CODIGO[codigo]).toBeTruthy();
      expect(MENSAJES_POR_CODIGO[codigo]).not.toMatch(/demo|prueba|piloto/i);
    }
  });

  it('el texto general de LIMITE_CITAS cubre las tres reglas: máximo, especialidad y cruce', () => {
    const texto = MENSAJES_POR_CODIGO['LIMITE_CITAS'];
    expect(texto).toContain('máximo de citas activas');
    expect(texto).toContain('especialidad ese día');
    expect(texto).toContain('se cruza con este horario');
  });

  it('prefiere el detail concreto del servidor (LIMITE_CITAS con la especialidad y la fecha)', () => {
    const detail = 'Ya tienes una cita de Cardiología el 6 de noviembre. Elige otro día.';
    const r = servicio.traducir(errorHttp(422, problema(422, 'LIMITE_CITAS', { detail })));
    expect(r.mensaje).toBe(detail);
    expect(r.codigo).toBe('LIMITE_CITAS');
  });

  it('si no hay detail, usa el campo mensaje del servidor', () => {
    const r = servicio.traducir(
      errorHttp(429, { codigo: 'DEMASIADOS_INTENTOS', mensaje: 'Inténtalo en 3 minutos.' }),
    );
    expect(r.mensaje).toBe('Inténtalo en 3 minutos.');
  });

  it('usa el mensaje por código de los nuevos errores cuando falta el detail', () => {
    const r = servicio.traducir(errorHttp(422, problema(422, 'ENLACE_INVALIDO')));
    expect(r.mensaje).toBe(MENSAJES_POR_CODIGO['ENLACE_INVALIDO']);
  });

  describe('429 (demasiados intentos)', () => {
    function error429(cabeceras: Record<string, string> = {}, cuerpo: unknown = null) {
      return new HttpErrorResponse({
        status: 429,
        error: cuerpo,
        url: '/api/v1/auth/registro',
        headers: new HttpHeaders(cabeceras),
      });
    }

    it('con el detail del servidor, lo muestra tal cual', () => {
      const detail =
        'Hiciste demasiadas solicitudes de registro. Inténtalo nuevamente en 40 minutos.';
      const r = servicio.traducir(error429({}, problema(429, 'DEMASIADOS_INTENTOS', { detail })));
      expect(r.mensaje).toBe(detail);
      expect(r.status).toBe(429);
    });

    it('sin cuerpo, usa Retry-After para decir cuánto esperar', () => {
      expect(servicio.traducir(error429({ 'Retry-After': '120' })).mensaje).toBe(
        'Hiciste demasiados intentos. Inténtalo de nuevo en 2 minutos.',
      );
      expect(servicio.traducir(error429({ 'Retry-After': '30' })).mensaje).toBe(
        'Hiciste demasiados intentos. Inténtalo de nuevo en 1 minuto.',
      );
    });

    it('sin cuerpo ni Retry-After, da un mensaje genérico', () => {
      expect(servicio.traducir(error429()).mensaje).toBe(
        MENSAJES_POR_CODIGO['DEMASIADOS_INTENTOS'],
      );
      // Con código pero sin detail: también el genérico.
      expect(servicio.traducir(error429({}, problema(429, 'DEMASIADOS_INTENTOS'))).mensaje).toBe(
        MENSAJES_POR_CODIGO['DEMASIADOS_INTENTOS'],
      );
    });

    it('minutosDeEspera entiende segundos y fechas HTTP y redondea hacia arriba', () => {
      expect(minutosDeEspera('61')).toBe(2);
      expect(minutosDeEspera('1')).toBe(1);
      expect(minutosDeEspera(null)).toBeNull();
      expect(minutosDeEspera('abc')).toBeNull();
      expect(minutosDeEspera('0')).toBeNull();
      const ahora = Date.parse('2026-10-23T15:00:00Z');
      expect(minutosDeEspera('Fri, 23 Oct 2026 15:05:00 GMT', ahora)).toBe(5);
    });
  });

  it('una operación RECHAZADA por LIMITE_CITAS se traduce con su mensaje', () => {
    const r = servicio.desdeOperacion(
      operacion({ estado: 'RECHAZADA', httpStatus: 422, codigoError: 'LIMITE_CITAS' }),
    );
    expect(r.mensaje).toBe(MENSAJES_POR_CODIGO['LIMITE_CITAS']);
  });

  it('una operación rechazada con texto concreto lo prefiere al mensaje por código', () => {
    const r = servicio.desdeOperacion({
      ...operacion({ estado: 'RECHAZADA', httpStatus: 422, codigoError: 'LIMITE_CITAS' }),
      mensaje: 'Ya tienes 5 citas activas.',
    } as Parameters<ErrorService['desdeOperacion']>[0]);
    expect(r.mensaje).toBe('Ya tienes 5 citas activas.');
  });
});
