import { resumenIndicadores } from '../../../../testing/indicadores-prueba';
import { NO_CALCULABLE, formatearMinutos, formatearTasa, plural, porcentaje } from './formato';
import { construirTarjetas, explicacionProvisional, tarjetasCargando } from './tarjetas';

const sinEspacios = (t: string) => t.replace(/ /g, ' ');

describe('formato de cifras', () => {
  it('formatea tasas con un decimal y «No calculable» si la tasa es null (nunca 0 %)', () => {
    expect(sinEspacios(formatearTasa(50))).toBe('50.0 %');
    expect(sinEspacios(formatearTasa(8.333))).toBe('8.3 %');
    expect(sinEspacios(formatearTasa(0))).toBe('0.0 %');
    expect(formatearTasa(null)).toBe(NO_CALCULABLE);
  });

  it('formatea minutos, porcentajes y plurales', () => {
    expect(sinEspacios(formatearMinutos(12.44))).toBe('12.4 min');
    expect(formatearMinutos(null)).toBe(NO_CALCULABLE);
    expect(porcentaje(20, 120)).toBe(16.7);
    expect(porcentaje(3, 0)).toBe(0);
    expect(plural(1, 'cita', 'citas')).toBe('1 cita');
    expect(plural(1200, 'cita', 'citas')).toBe('1,200 citas');
  });
});

describe('tarjetas de indicadores', () => {
  it('muestra el valor, «numerador de denominador» y el medidor de cada tasa', () => {
    const [confirmacion, cancelacion, reprogramacion, inasistencia, espera] =
      construirTarjetas(resumenIndicadores());
    expect(confirmacion).toMatchObject({
      titulo: 'Confirmación',
      detalle: '60 de 120 citas',
      medidor: 50,
    });
    expect(sinEspacios(confirmacion.valor)).toBe('50.0 %');
    expect(cancelacion.detalle).toBe('10 de 120 citas');
    expect(reprogramacion.detalle).toBe('15 de 120 citas');
    // 18 reprogramaciones en 15 citas: la tarjeta lo dice.
    expect(reprogramacion.nota).toBe(
      'En total, 18 reprogramaciones: algunas citas se reprogramaron más de una vez.',
    );
    expect(confirmacion.nota).toBeNull();
    expect(inasistencia.detalle).toBe('6 de 40 citas vencidas');
    expect(inasistencia.provisional).toBeNull();
    expect(sinEspacios(espera.valor)).toBe('12.4 min');
    expect(espera.detalle).toBe('De 30 atenciones medidas');
    expect(espera.nota).toBe('2 atenciones excluidas por datos incompletos.');
    expect(espera.medidor).toBeNull();
  });

  it('sin citas reprogramadas más de una vez no añade la nota de reprogramaciones', () => {
    const r = resumenIndicadores();
    r.indicadores.reprogramacion = { numerador: 15, denominador: 120, tasa: 12.5, eventos: 15 };
    expect(construirTarjetas(r)[2].nota).toBeNull();
    r.indicadores.reprogramacion = { numerador: 0, denominador: 0, tasa: null, eventos: 0 };
    expect(construirTarjetas(r)[2].nota).toContain('No hay citas');
  });

  it('con denominador 0 muestra «No calculable», sin medidor y con una nota', () => {
    const r = resumenIndicadores();
    r.indicadores.confirmacion = { numerador: 0, denominador: 0, tasa: null };
    r.indicadores.inasistencia = {
      numerador: 0,
      denominador: 0,
      tasa: null,
      provisional: false,
      pendientesDeClasificar: 0,
    };
    r.indicadores.esperaPromedioMinutos = { valor: null, observaciones: 0, excluidas: 0 };
    const [confirmacion, , , inasistencia, espera] = construirTarjetas(r);
    expect(confirmacion.valor).toBe(NO_CALCULABLE);
    expect(confirmacion.medidor).toBeNull();
    expect(confirmacion.nota).toContain('No hay citas');
    expect(inasistencia.valor).toBe(NO_CALCULABLE);
    expect(inasistencia.nota).toContain('citas vencidas');
    expect(espera.valor).toBe(NO_CALCULABLE);
    expect(espera.nota).toContain('llegada registrada');
  });

  it('marca la inasistencia como provisional y explica por qué', () => {
    const r = resumenIndicadores();
    r.indicadores.inasistencia = {
      ...r.indicadores.inasistencia,
      provisional: true,
      pendientesDeClasificar: 3,
    };
    const inasistencia = construirTarjetas(r)[3];
    expect(inasistencia.provisional).toBe(explicacionProvisional(3));
    expect(inasistencia.provisional).toContain('3 citas vencidas pendientes de clasificar');
    expect(explicacionProvisional(1)).toContain('1 cita vencida pendiente');
    expect(explicacionProvisional(0)).toContain('puede cambiar');
  });

  it('las tarjetas de carga conservan títulos e iconos (5, en el mismo orden)', () => {
    const cargando = tarjetasCargando();
    expect(cargando.map((t) => t.titulo)).toEqual([
      'Confirmación',
      'Cancelación',
      'Reprogramación',
      'Inasistencia',
      'Espera promedio',
    ]);
    expect(cargando.every((t) => t.valor === '')).toBe(true);
  });
});
