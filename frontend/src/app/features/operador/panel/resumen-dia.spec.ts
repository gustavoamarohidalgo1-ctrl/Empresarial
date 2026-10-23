import { citaOperador } from '../../../../testing/datos-prueba';
import {
  FILTROS_PANEL,
  contarPorFiltro,
  filtrarCitas,
  formatearEspera,
  fusionarCitas,
  ordenarCitas,
  resumirDia,
} from './resumen-dia';

const lista = () => [
  citaOperador({ id: 'a', codigo: 'A', estado: 'PENDIENTE', inicio: '2026-11-06T16:00:00Z' }),
  citaOperador({ id: 'b', codigo: 'B', estado: 'CONFIRMADA', inicio: '2026-11-06T15:15:00Z' }),
  citaOperador({
    id: 'c',
    codigo: 'C',
    estado: 'CHECK_IN',
    llegadaRegistradaEn: '2026-11-06T14:50:00Z',
  }),
  citaOperador({
    id: 'd',
    codigo: 'D',
    estado: 'EN_ESPERA',
    llegadaRegistradaEn: '2026-11-06T14:20:00Z',
  }),
  citaOperador({ id: 'e', codigo: 'E', estado: 'EN_ATENCION' }),
  citaOperador({ id: 'f', codigo: 'F', estado: 'COMPLETADA' }),
  citaOperador({ id: 'g', codigo: 'G', estado: 'CANCELADA' }),
  citaOperador({ id: 'h', codigo: 'H', estado: 'NO_ASISTIO' }),
];

describe('resumen del día del operador', () => {
  it('agrupa los estados según el recorrido del paciente', () => {
    expect(contarPorFiltro(lista())).toEqual({
      todas: 8,
      'por-llegar': 2,
      'en-espera': 2,
      'en-atencion': 1,
      completadas: 1,
      cerradas: 2,
    });
    expect(FILTROS_PANEL.map((f) => f.id)).toEqual([
      'todas',
      'por-llegar',
      'en-espera',
      'en-atencion',
      'completadas',
      'cerradas',
    ]);
  });

  it('filtra por grupo y «todas» devuelve la misma lista', () => {
    const citas = lista();
    expect(filtrarCitas(citas, 'todas')).toBe(citas);
    expect(filtrarCitas(citas, 'en-espera').map((c) => c.codigo)).toEqual(['C', 'D']);
    expect(filtrarCitas(citas, 'cerradas').map((c) => c.codigo)).toEqual(['G', 'H']);
  });

  it('calcula avance, siguiente llegada y mayor espera (solo hoy)', () => {
    const ahora = Date.parse('2026-11-06T15:00:00Z');
    const hoy = resumirDia(lista(), ahora, true);
    expect(hoy.activas).toBe(6);
    expect(hoy.progreso).toBe(17); // 1 de 6
    expect(hoy.siguiente).toBe('2026-11-06T15:15:00Z');
    expect(hoy.mayorEsperaMin).toBe(40);

    const otroDia = resumirDia(lista(), ahora, false);
    expect(otroDia.mayorEsperaMin).toBeNull();
  });

  it('sin citas activas el avance es 0 y no hay siguiente', () => {
    const r = resumirDia([citaOperador({ estado: 'CANCELADA' })], Date.now(), true);
    expect(r.progreso).toBe(0);
    expect(r.siguiente).toBeNull();
    expect(r.mayorEsperaMin).toBeNull();
  });

  it('formatea la espera', () => {
    expect(formatearEspera(0)).toBe('menos de 1 min');
    expect(formatearEspera(25)).toBe('25 min');
    expect(formatearEspera(60)).toBe('1 h');
    expect(formatearEspera(65)).toBe('1 h 05 min');
  });

  it('ordena por hora y luego por código', () => {
    const ordenadas = ordenarCitas([
      citaOperador({ codigo: 'B', inicio: '2026-11-06T15:00:00Z' }),
      citaOperador({ codigo: 'C', inicio: '2026-11-06T14:00:00Z' }),
      citaOperador({ codigo: 'A', inicio: '2026-11-06T15:00:00Z' }),
    ]);
    expect(ordenadas.map((c) => c.codigo)).toEqual(['C', 'A', 'B']);
    expect(ordenarCitas(null)).toEqual([]);
  });

  it('al fusionar conserva la versión local más nueva y toma el resto de la lista fresca', () => {
    const local = citaOperador({ id: 'x', versionCita: 9, estado: 'EN_ESPERA' });
    const frescas = [
      citaOperador({ id: 'x', versionCita: 8, estado: 'CHECK_IN' }),
      citaOperador({ id: 'y', versionCita: 3 }),
    ];
    const r = fusionarCitas(frescas, [local, citaOperador({ id: 'z' })]);
    expect(r.map((c) => c.id)).toEqual(['x', 'y']);
    expect(r[0]).toBe(local);

    const masNueva = citaOperador({ id: 'x', versionCita: 10, estado: 'EN_ATENCION' });
    expect(fusionarCitas([masNueva], [local])[0]).toBe(masNueva);
  });
});
