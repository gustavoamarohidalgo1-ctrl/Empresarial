import {
  EntradaAuditoria,
  PaginaAuditoria,
  ResumenIndicadores,
} from '../app/core/modelos/contrato';

/** Datos sintéticos de `GET /analitica/resumen` (docs/api.md, ampliación v1.1). */
export function resumenIndicadores(parcial: Partial<ResumenIndicadores> = {}): ResumenIndicadores {
  return {
    periodo: { desde: '2026-10-01', hasta: '2026-10-03' },
    corte: '2026-10-23T14:00:00Z',
    zonaHoraria: 'America/Lima',
    filtros: { sede: null, especialidad: null, profesional: null },
    totalCitas: 120,
    porEstado: [
      { estado: 'PENDIENTE', etiqueta: 'Pendiente', total: 20 },
      { estado: 'CONFIRMADA', etiqueta: 'Confirmada', total: 30 },
      { estado: 'CHECK_IN', etiqueta: 'Check-in', total: 0 },
      { estado: 'EN_ESPERA', etiqueta: 'En espera', total: 0 },
      { estado: 'EN_ATENCION', etiqueta: 'En atención', total: 0 },
      { estado: 'COMPLETADA', etiqueta: 'Completada', total: 54 },
      { estado: 'CANCELADA', etiqueta: 'Cancelada', total: 10 },
      { estado: 'NO_ASISTIO', etiqueta: 'No asistió', total: 6 },
    ],
    indicadores: {
      confirmacion: { numerador: 60, denominador: 120, tasa: 50.0 },
      cancelacion: { numerador: 10, denominador: 120, tasa: 8.3 },
      reprogramacion: { numerador: 15, denominador: 120, tasa: 12.5, eventos: 18 },
      inasistencia: {
        numerador: 6,
        denominador: 40,
        tasa: 15.0,
        provisional: false,
        pendientesDeClasificar: 0,
      },
      esperaPromedioMinutos: { valor: 12.4, observaciones: 30, excluidas: 2 },
    },
    porDia: [
      { fecha: '2026-10-01', total: 50, completadas: 30, canceladas: 5, noAsistio: 3 },
      { fecha: '2026-10-02', total: 40, completadas: 24, canceladas: 5, noAsistio: 3 },
      { fecha: '2026-10-03', total: 30, completadas: 0, canceladas: 0, noAsistio: 0 },
    ],
    porEspecialidad: [
      { codigo: 'DERMA', nombre: 'Dermatología', total: 30, tasaInasistencia: null },
      { codigo: 'CARDIO', nombre: 'Cardiología', total: 50, tasaInasistencia: 10.0 },
      { codigo: 'MED-GEN', nombre: 'Medicina general', total: 40, tasaInasistencia: 20.0 },
    ],
    ...parcial,
  };
}

/** Una entrada de `GET /admin/auditoria`. */
export function entradaAuditoria(parcial: Partial<EntradaAuditoria> = {}): EntradaAuditoria {
  return {
    id: 812,
    ocurridoEn: '2026-10-23T14:14:05Z',
    actor: { id: 'u-7', nombre: 'Ana Lucía Torres', rol: 'PACIENTE' },
    accion: 'CITA_CONFIRMAR',
    entidad: 'CITA',
    entidadId: '0b6c4f2a-1111-2222-3333-444455556666',
    resultado: 'EXITO',
    codigo: null,
    requestId: '7f3c2a9e4b1d',
    ...parcial,
  };
}

export function paginaAuditoria(parcial: Partial<PaginaAuditoria> = {}): PaginaAuditoria {
  return {
    elementos: [
      entradaAuditoria(),
      entradaAuditoria({
        id: 811,
        ocurridoEn: '2026-10-23T13:00:00Z',
        actor: null,
        accion: 'CITA_MARCAR_NO_ASISTIO',
        resultado: 'EXITO',
        requestId: null,
      }),
      entradaAuditoria({
        id: 810,
        actor: { id: 'u-9', nombre: 'Omar Operador', rol: 'OPERADOR' },
        accion: 'CITA_OPERADOR_INICIAR_ATENCION',
        resultado: 'RECHAZO',
        codigo: 'VERSION_OBSOLETA',
        requestId: 'aa11bb22cc33',
      }),
    ],
    pagina: 0,
    tamano: 25,
    total: 60,
    acciones: ['CITA_CANCELAR', 'CITA_CONFIRMAR', 'LOGIN'],
    ...parcial,
  };
}
