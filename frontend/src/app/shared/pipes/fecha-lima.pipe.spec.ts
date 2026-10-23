import { FechaLimaPipe } from './fecha-lima.pipe';
import {
  claveDiaLima,
  cuentaRegresivaLima,
  diasHastaLima,
  partesCalendarioLima,
  esFechaIsoValida,
  formatearDiaLargo,
  formatearFechaHora,
  formatearFechaSinHora,
  formatearHora,
  hoyEnLima,
  sumarDias,
} from '../utils/fecha-lima';

describe('FechaLimaPipe', () => {
  const pipe = new FechaLimaPipe();

  it('muestra un instante UTC en hora de Lima (UTC−5)', () => {
    expect(pipe.transform('2026-11-04T14:00:00Z')).toBe('04 nov 2026, 09:00');
    expect(pipe.transform('2026-11-04T14:00:00Z', 'hora')).toBe('09:00');
    expect(pipe.transform('2026-11-04T14:00:00Z', 'fecha')).toBe('04 nov 2026');
  });

  it('cambia de día según Lima y no según UTC ni el navegador', () => {
    // 03:30 UTC del 5 de noviembre = 22:30 del 4 de noviembre en Lima.
    expect(pipe.transform('2026-11-05T03:30:00Z')).toBe('04 nov 2026, 22:30');
    expect(claveDiaLima('2026-11-05T03:30:00Z')).toBe('2026-11-04');
  });

  it('usa el formato es-PE (setiembre) y el día largo con mayúscula inicial', () => {
    expect(pipe.transform('2026-09-10T15:00:00Z', 'fecha')).toBe('10 set 2026');
    expect(pipe.transform('2026-11-04T14:00:00Z', 'dia')).toBe('Miércoles, 4 de noviembre de 2026');
    expect(formatearDiaLargo('2026-11-04T14:00:00Z')).toBe('Miércoles, 4 de noviembre de 2026');
  });

  it('devuelve texto vacío ante valores nulos o inválidos', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('no-es-fecha')).toBe('');
  });

  it('acepta objetos Date', () => {
    expect(formatearFechaHora(new Date(Date.UTC(2026, 10, 6, 15, 25)))).toBe('06 nov 2026, 10:25');
    expect(formatearHora(new Date(Date.UTC(2026, 10, 6, 0, 0)))).toBe('19:00');
  });
});

describe('utilidades de fecha (Lima)', () => {
  it('hoyEnLima usa el día de Lima', () => {
    expect(hoyEnLima(new Date('2026-11-06T04:59:00Z'))).toBe('2026-11-05');
    expect(hoyEnLima(new Date('2026-11-06T05:00:00Z'))).toBe('2026-11-06');
  });

  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-11-01', 13)).toBe('2026-11-14');
    expect(sumarDias('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('formatea fechas sin hora sin desplazarlas de día', () => {
    expect(formatearFechaSinHora('2026-11-06')).toBe('06 nov 2026');
    expect(formatearFechaSinHora('06/11/2026')).toBe('');
  });

  it('valida fechas YYYY-MM-DD', () => {
    expect(esFechaIsoValida('2026-11-06')).toBe(true);
    expect(esFechaIsoValida('2026-02-30')).toBe(false);
    expect(esFechaIsoValida('')).toBe(false);
  });
});

describe('ficha de calendario y cuenta regresiva (Lima)', () => {
  it('partesCalendarioLima da mes, día y día de la semana en Lima', () => {
    expect(partesCalendarioLima('2026-11-04T14:00:00Z')).toEqual({
      iso: '2026-11-04',
      dia: '4',
      mes: 'nov',
      diaSemana: 'mié',
      anio: '2026',
    });
    // 03:30 UTC del 5 = 22:30 del 4 en Lima.
    expect(partesCalendarioLima('2026-11-05T03:30:00Z')?.dia).toBe('4');
    expect(partesCalendarioLima('2026-09-01T15:00:00Z')?.mes).toBe('set');
    expect(partesCalendarioLima(null)).toBeNull();
    expect(partesCalendarioLima('no-es-fecha')).toBeNull();
  });

  it('diasHastaLima cuenta días de calendario de Lima, no horas', () => {
    const ahora = new Date('2026-11-04T04:00:00Z'); // 3 nov, 23:00 en Lima
    expect(diasHastaLima('2026-11-04T06:00:00Z', ahora)).toBe(1); // 4 nov, 01:00 en Lima
    expect(diasHastaLima('2026-11-04T03:00:00Z', ahora)).toBe(0);
    expect(diasHastaLima(undefined, ahora)).toBeNull();
  });

  it('cuentaRegresivaLima describe la cercanía de la cita', () => {
    const ahora = new Date('2026-11-04T13:00:00Z'); // 4 nov, 08:00 en Lima
    expect(cuentaRegresivaLima('2026-11-04T14:00:00Z', ahora)).toBe('hoy a las 09:00');
    expect(cuentaRegresivaLima('2026-11-05T14:00:00Z', ahora)).toBe('mañana a las 09:00');
    expect(cuentaRegresivaLima('2026-11-07T14:00:00Z', ahora)).toBe('en 3 días');
    expect(cuentaRegresivaLima('2026-11-03T14:00:00Z', ahora)).toBe('ayer');
    expect(cuentaRegresivaLima('2026-10-30T14:00:00Z', ahora)).toBe('hace 5 días');
    expect(cuentaRegresivaLima('', ahora)).toBe('');
  });
});
