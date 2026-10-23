import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import {
  CitaDetalle,
  CitaOperador,
  CitaResumen,
  Operacion,
  ProblemDetail,
  UsuarioSesion,
} from '../app/core/modelos/contrato';

/** Datos sintéticos para pruebas unitarias (reflejan el contrato de docs/api.md). */

export const PACIENTE: UsuarioSesion = {
  id: 'u-1',
  nombre: 'Ana Demo',
  email: 'ana.demo@ejemplo.invalid',
  rol: 'PACIENTE',
};

export const OPERADOR: UsuarioSesion = {
  id: 'u-2',
  nombre: 'Olga Operadora',
  email: 'olga@ejemplo.invalid',
  rol: 'OPERADOR',
};

export function citaResumen(parcial: Partial<CitaResumen> = {}): CitaResumen {
  return {
    id: 'c-1',
    codigo: 'CIT001',
    estado: 'PENDIENTE',
    estadoEtiqueta: 'Pendiente',
    inicio: '2026-11-04T14:00:00Z',
    fin: '2026-11-04T14:20:00Z',
    versionAgenda: 1,
    sede: { codigo: 'SURCO', nombre: 'Sede de prueba Surco' },
    especialidad: { codigo: 'MED-GEN', nombre: 'Medicina general' },
    profesional: { codigo: 'P01', nombre: 'Profesional P01' },
    ...parcial,
  };
}

/** `motivoCancelacion` llega como `{ codigo, descripcion }` (docs/api.md). */
export const MOTIVO_CANCELACION = { codigo: 'CAN-PERSONAL', descripcion: 'Compromiso personal' };

export function citaCancelada(parcial: Partial<CitaDetalle> = {}): CitaDetalle {
  return citaDetalle({
    estado: 'CANCELADA',
    estadoEtiqueta: 'Cancelada',
    accionesPermitidas: [],
    ventanaLlegada: null,
    motivoCancelacion: MOTIVO_CANCELACION,
    ...parcial,
  });
}

/** Respuesta de `GET /operaciones/{clave}` (solo COMPLETADA o RECHAZADA). */
export function operacion(parcial: Partial<Operacion> = {}): Operacion {
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

/** Adjunta el componente al documento para poder comprobar el foco. */
export function adjuntar(elemento: HTMLElement): () => void {
  document.body.appendChild(elemento);
  return () => elemento.remove();
}

export function citaDetalle(parcial: Partial<CitaDetalle> = {}): CitaDetalle {
  return {
    ...citaResumen(),
    zonaHoraria: 'America/Lima',
    accionesPermitidas: ['CONFIRMAR', 'CANCELAR', 'REPROGRAMAR', 'PRE_CHECK_IN'],
    ventanaLlegada: null,
    confirmadaEn: null,
    preCheckInCompletadoEn: null,
    llegadaRegistradaEn: null,
    motivoCancelacion: null,
    ...parcial,
  };
}

export function citaOperador(parcial: Partial<CitaOperador> = {}): CitaOperador {
  return {
    id: 'c-1',
    codigo: 'CIT001',
    inicio: '2026-11-06T15:30:00Z',
    estado: 'CHECK_IN',
    estadoEtiqueta: 'Check-in',
    pacienteNombre: 'Ana Demo',
    profesional: { codigo: 'P01', nombre: 'Profesional P01' },
    especialidad: { codigo: 'MED-GEN', nombre: 'Medicina general' },
    versionCita: 7,
    accionesPermitidas: ['PASAR_A_ESPERA'],
    llegadaRegistradaEn: '2026-11-06T15:25:00Z',
    ...parcial,
  };
}

export function problema(
  status: number,
  codigo: string,
  extra: Partial<ProblemDetail> = {},
): ProblemDetail {
  return {
    type: `https://siga-sp.local/errores/${codigo.toLowerCase()}`,
    title: 'Error',
    status,
    codigo,
    requestId: 'req-123',
    ...extra,
  };
}

export function errorHttp(
  status: number,
  cuerpo: unknown = null,
  url = '/api/v1/x',
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: cuerpo,
    url,
    headers: new HttpHeaders({ 'Content-Type': 'application/problem+json' }),
  });
}

/** Opciones de `TestRequest.flush` para responder un problem+json. */
export function opcionesProblema(status: number, statusText = 'Error') {
  return { status, statusText, headers: { 'Content-Type': 'application/problem+json' } };
}

export const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
