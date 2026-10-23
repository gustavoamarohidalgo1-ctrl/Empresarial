import { NotificacionPaciente } from '../../../core/modelos/contrato';
import { agruparPorDia, tituloDia } from './agrupar-notificaciones';

const AHORA = new Date('2026-10-23T15:00:00Z'); // viernes 23, 10:00 en Lima

function n(id: string, creadaEn: string): NotificacionPaciente {
  return {
    id,
    tipo: 'RECORDATORIO',
    titulo: 't',
    mensaje: 'm',
    citaId: 'c',
    citaCodigo: 'SP-2026-000001',
    creadaEn,
    leida: false,
  };
}

describe('agrupar-notificaciones', () => {
  it('tituloDia dice «Hoy», «Ayer» o la fecha completa en hora de Lima', () => {
    expect(tituloDia('2026-10-23', AHORA)).toBe('Hoy');
    expect(tituloDia('2026-10-22', AHORA)).toBe('Ayer');
    expect(tituloDia('2026-10-19', AHORA)).toBe('Lunes, 19 de octubre de 2026');
  });

  it('agrupa por día de Lima (no del navegador) y ordena de la más reciente a la más antigua', () => {
    const grupos = agruparPorDia(
      [
        n('a', '2026-10-22T15:00:00Z'), // ayer 10:00
        n('b', '2026-10-23T04:30:00Z'), // 22 a las 23:30 en Lima: ayer
        n('c', '2026-10-23T14:00:00Z'), // hoy 09:00
        n('d', '2026-10-23T05:30:00Z'), // hoy 00:30
      ],
      AHORA,
    );
    expect(grupos.map((g) => [g.titulo, g.notificaciones.map((x) => x.id)])).toEqual([
      ['Hoy', ['c', 'd']],
      ['Ayer', ['b', 'a']],
    ]);
  });

  it('sin notificaciones no hay grupos', () => {
    expect(agruparPorDia([], AHORA)).toEqual([]);
  });
});
