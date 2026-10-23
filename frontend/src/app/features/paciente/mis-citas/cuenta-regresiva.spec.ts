import { capitalizar, cuentaRegresiva } from './cuenta-regresiva';

describe('cuentaRegresiva', () => {
  const CITA = '2026-11-04T14:00:00Z'; // 4 nov, 09:00 en Lima

  it.each([
    ['2026-11-01T15:00:00Z', 'en 3 días'],
    ['2026-11-03T23:00:00Z', 'mañana a las 09:00'], // 3 nov, 18:00 en Lima
    ['2026-11-04T05:30:00Z', 'hoy a las 09:00'], // 4 nov, 00:30 en Lima (en UTC aún es el 4)
    ['2026-11-04T04:30:00Z', 'mañana a las 09:00'], // 3 nov, 23:30 en Lima (en UTC ya es el 4)
  ])('con ahora=%s dice «%s» (días de calendario de Lima)', (ahora, esperado) => {
    expect(cuentaRegresiva(CITA, 'CONFIRMADA', new Date(ahora))).toBe(esperado);
  });

  it('no hay cuenta regresiva para citas pasadas o cerradas', () => {
    expect(cuentaRegresiva(CITA, 'PENDIENTE', new Date('2026-11-05T15:00:00Z'))).toBeNull();
    expect(cuentaRegresiva(CITA, 'CANCELADA', new Date('2026-11-01T15:00:00Z'))).toBeNull();
    expect(cuentaRegresiva(CITA, 'COMPLETADA', new Date('2026-11-01T15:00:00Z'))).toBeNull();
    expect(cuentaRegresiva('no-es-fecha', 'PENDIENTE', new Date())).toBeNull();
  });

  it('capitaliza la primera letra', () => {
    expect(capitalizar('en 3 días')).toBe('En 3 días');
    expect(capitalizar('')).toBe('');
  });
});
