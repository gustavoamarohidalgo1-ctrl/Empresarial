import { HorarioReserva } from '../../../core/modelos/contrato';
import {
  agruparPorDia,
  filtrarEspecialidades,
  franjaDe,
  iconoEspecialidad,
  inicialesProfesional,
  nombreSinTratamiento,
  normalizar,
  resumirPorProfesional,
  sedesDe,
} from './reserva-utils';

function h(id: string, inicio: string, profesional = 'P01', sede = 'SURCO'): HorarioReserva {
  return {
    horarioId: id,
    inicio,
    fin: inicio,
    profesional: { codigo: profesional, nombre: `Profesional ${profesional}` },
    sede: { codigo: sede, nombre: `Sede ${sede}` },
  };
}

describe('reserva-utils', () => {
  it('franjaDe usa la hora de Lima: mañana < 12, tarde < 18, noche', () => {
    expect(franjaDe('2026-10-26T16:59:00Z')).toBe('Mañana'); // 11:59
    expect(franjaDe('2026-10-26T17:00:00Z')).toBe('Tarde'); // 12:00
    expect(franjaDe('2026-10-26T22:59:00Z')).toBe('Tarde'); // 17:59
    expect(franjaDe('2026-10-26T23:00:00Z')).toBe('Noche'); // 18:00
  });

  it('agruparPorDia ordena y agrupa por día de Lima y por franja', () => {
    const dias = agruparPorDia([
      h('c', '2026-10-27T15:00:00Z'),
      h('a', '2026-10-26T14:00:00Z'),
      h('d', '2026-10-27T03:00:00Z'), // 26 a las 22:00 en Lima
      h('b', '2026-10-26T19:00:00Z'),
    ]);
    expect(dias.map((d) => d.clave)).toEqual(['2026-10-26', '2026-10-27']);
    expect(dias[0].titulo).toBe('Lunes, 26 de octubre de 2026');
    expect(dias[0].franjas.map((f) => [f.franja, f.horarios.map((x) => x.horarioId)])).toEqual([
      ['Mañana', ['a']],
      ['Tarde', ['b']],
      ['Noche', ['d']],
    ]);
    expect(dias[1].horarios.map((x) => x.horarioId)).toEqual(['c']);
    expect(dias[0].semana).toBe('lun');
    expect(dias[0].dia).toBe('26');
    expect(dias[0].mes).toBe('oct');
  });

  it('resumirPorProfesional cuenta horarios, el más próximo y sus sedes', () => {
    const r = resumirPorProfesional([
      h('1', '2026-10-27T14:00:00Z', 'P1', 'SURCO'),
      h('2', '2026-10-26T14:00:00Z', 'P1', 'SAN-ISIDRO'),
      h('3', '2026-10-26T15:00:00Z', 'P2', 'SURCO'),
      h('4', '2026-10-28T15:00:00Z', 'P1', 'SURCO'),
    ]);
    expect(r.get('P1')).toEqual({
      total: 3,
      proximo: '2026-10-26T14:00:00Z',
      sedes: [
        { codigo: 'SURCO', nombre: 'Sede SURCO' },
        { codigo: 'SAN-ISIDRO', nombre: 'Sede SAN-ISIDRO' },
      ],
    });
    expect(r.get('P2')?.total).toBe(1);
    expect(r.has('P3')).toBe(false);
  });

  it('sedesDe devuelve las sedes sin repetir', () => {
    expect(
      sedesDe([h('1', 'x', 'P', 'A'), h('2', 'x', 'P', 'B'), h('3', 'x', 'P', 'A')]).map(
        (s) => s.codigo,
      ),
    ).toEqual(['A', 'B']);
  });

  it('normalizar quita tildes y mayúsculas', () => {
    expect(normalizar('  Cardiología PEDIÁTRICA ')).toBe('cardiologia pediatrica');
    expect(normalizar(null)).toBe('');
  });

  it('filtrarEspecialidades busca en nombre y descripción, con todas las palabras', () => {
    const lista = [
      { codigo: 'CARDIO', nombre: 'Cardiología', descripcion: 'Corazón y sistema circulatorio' },
      { codigo: 'DERMA', nombre: 'Dermatología', descripcion: 'Piel, cabello y uñas' },
      { codigo: 'MED-GEN', nombre: 'Medicina general', descripcion: null },
    ];
    expect(filtrarEspecialidades(lista, '').length).toBe(3);
    expect(filtrarEspecialidades(lista, 'corazon').map((e) => e.codigo)).toEqual(['CARDIO']);
    expect(filtrarEspecialidades(lista, 'piel unas').map((e) => e.codigo)).toEqual(['DERMA']);
    expect(filtrarEspecialidades(lista, 'piel corazón')).toEqual([]);
    expect(filtrarEspecialidades(lista, 'GENERAL').map((e) => e.codigo)).toEqual(['MED-GEN']);
  });

  it('iconoEspecialidad elige un icono por nombre y usa el estetoscopio por defecto', () => {
    expect(iconoEspecialidad({ codigo: 'CARDIO', nombre: 'Cardiología' })).toBe('heart-pulse');
    expect(iconoEspecialidad({ codigo: 'OFT', nombre: 'Oftalmología' })).toBe('eye');
    expect(iconoEspecialidad({ codigo: 'PEDIA', nombre: 'Pediatría' })).toBe('users');
    expect(iconoEspecialidad({ codigo: 'MED-GEN', nombre: 'Medicina general' })).toBe(
      'stethoscope',
    );
  });

  it('nombres de profesionales: sin tratamiento para ordenar e iniciales para el avatar', () => {
    expect(nombreSinTratamiento('Dra. Lucía Paredes Rojas')).toBe('Lucía Paredes Rojas');
    expect(nombreSinTratamiento('Dr Martín Quispe')).toBe('Martín Quispe');
    expect(inicialesProfesional('Dra. Lucía Paredes Rojas')).toBe('LP');
    expect(inicialesProfesional('Lic. Rosa')).toBe('RO');
    expect(inicialesProfesional('')).toBe('?');
  });
});
