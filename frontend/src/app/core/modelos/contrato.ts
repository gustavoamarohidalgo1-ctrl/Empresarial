/**
 * Modelos tipados del contrato de la API (docs/api.md, v1).
 * Las fechas llegan como instantes ISO-8601 en UTC (string) y se muestran en America/Lima.
 */

// ---------- Autenticación ----------

export type Rol = 'PACIENTE' | 'OPERADOR' | 'RESPONSABLE' | 'ADMINISTRADOR';

export interface UsuarioSesion {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

export interface Credenciales {
  email: string;
  password: string;
}

export interface CsrfRespuesta {
  headerName: string;
  token: string;
}

// ---------- Citas (paciente) ----------

export type EstadoCita =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'CHECK_IN'
  | 'EN_ESPERA'
  | 'EN_ATENCION'
  | 'COMPLETADA'
  | 'CANCELADA'
  | 'NO_ASISTIO';

export type AlcanceCitas = 'proximas' | 'historial';

export interface Referencia {
  codigo: string;
  nombre: string;
}

export interface CitaResumen {
  id: string;
  codigo: string;
  estado: EstadoCita;
  estadoEtiqueta: string;
  inicio: string;
  fin: string;
  versionAgenda: number;
  sede: Referencia;
  especialidad: Referencia;
  profesional: Referencia;
}

export type AccionPaciente =
  'CONFIRMAR' | 'CANCELAR' | 'REPROGRAMAR' | 'PRE_CHECK_IN' | 'REGISTRAR_LLEGADA';

export interface VentanaLlegada {
  desde: string;
  hasta: string;
}

export interface CitaDetalle extends CitaResumen {
  zonaHoraria: string;
  accionesPermitidas: AccionPaciente[];
  ventanaLlegada: VentanaLlegada | null;
  confirmadaEn: string | null;
  preCheckInCompletadoEn: string | null;
  llegadaRegistradaEn: string | null;
  /** `{ codigo, descripcion }` si la cita está cancelada; `null` en otro caso. */
  motivoCancelacion: Motivo | null;
}

export type TipoEventoLineaTiempo =
  | 'CREADA'
  | 'CONFIRMADA'
  | 'CANCELADA'
  | 'REPROGRAMADA'
  | 'PRE_CHECK_IN_COMPLETADO'
  | 'LLEGADA_REGISTRADA'
  | 'EN_ESPERA'
  | 'EN_ATENCION'
  | 'COMPLETADA'
  | 'NO_ASISTIO';

export interface EventoLineaTiempo {
  secuencia: number;
  tipo: TipoEventoLineaTiempo;
  ocurridoEn: string;
  titulo: string;
  descripcion: string;
}

export interface HorarioDisponible {
  id: string;
  inicio: string;
  fin: string;
  sede: Referencia;
  profesional: Referencia;
}

export interface CuerpoConfirmacion {
  versionAgenda: number;
}

export interface CuerpoCancelacion {
  versionAgenda: number;
  motivoCodigo: string;
}

export interface CuerpoReprogramacion {
  versionAgenda: number;
  horarioId: string;
  motivoCodigo: string;
}

export interface CuerpoPreCheckIn {
  versionAgenda: number;
  email: string;
  telefono: string;
  datosCorrectos: boolean;
}

export interface CuerpoLlegada {
  versionAgenda: number;
}

// ---------- Perfil ----------

export interface PerfilPaciente {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
}

export interface ActualizacionPerfil {
  email?: string;
  telefono?: string;
}

// ---------- Operador ----------

export type AccionOperador =
  'REGISTRAR_LLEGADA' | 'PASAR_A_ESPERA' | 'INICIAR_ATENCION' | 'COMPLETAR';

export interface CitaOperador {
  id: string;
  codigo: string;
  inicio: string;
  estado: EstadoCita;
  estadoEtiqueta: string;
  pacienteNombre: string;
  profesional: Referencia;
  especialidad: Referencia;
  versionCita: number;
  accionesPermitidas: AccionOperador[];
  llegadaRegistradaEn: string | null;
}

export interface CuerpoTransicion {
  accion: AccionOperador;
  versionCita: number;
}

// ---------- Catálogos y operaciones ----------

export type TipoMotivo = 'CANCELACION' | 'REPROGRAMACION';

export interface Motivo {
  codigo: string;
  descripcion: string;
}

export type EstadoOperacion = 'COMPLETADA' | 'RECHAZADA';

export interface Operacion {
  clave: string;
  tipo: string;
  recursoId: string;
  estado: EstadoOperacion;
  httpStatus: number;
  codigoError: string | null;
  registradaEn: string;
}

// ---------- Errores (RFC 9457) ----------

export type CodigoError =
  | 'VALIDACION'
  | 'IDEMPOTENCY_KEY_REQUERIDA'
  | 'NO_AUTENTICADO'
  | 'CREDENCIALES_INVALIDAS'
  | 'ACCESO_DENEGADO'
  | 'CSRF_INVALIDO'
  | 'CITA_NO_ENCONTRADA'
  | 'RECURSO_NO_ENCONTRADO'
  | 'VERSION_OBSOLETA'
  | 'CONFLICTO_CONCURRENTE'
  | 'HORARIO_NO_DISPONIBLE'
  | 'IDEMPOTENCIA_CONFLICTO'
  | 'TRANSICION_NO_PERMITIDA'
  | 'FUERA_DE_PLAZO'
  | 'MOTIVO_INVALIDO'
  | 'DATOS_PRE_CHECK_IN_INVALIDOS'
  | 'LLEGADA_YA_REGISTRADA'
  | 'ERROR_INTERNO'
  | 'CORREO_REGISTRADO'
  | 'CONTRASENA_INCORRECTA'
  | 'ENLACE_INVALIDO'
  | 'LIMITE_CITAS'
  | 'DEMASIADOS_INTENTOS'
  | 'METODO_NO_PERMITIDO'
  | 'TIPO_NO_SOPORTADO';

export interface ErrorCampo {
  campo: string;
  mensaje: string;
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  instance?: string;
  codigo?: string;
  requestId?: string;
  errores?: ErrorCampo[];
}

// ===================================================================================
// Ampliación v1.1 (docs/api.md § «Ampliación v1.1 · Producto completo»)
// ===================================================================================

export type Entorno = 'desarrollo' | 'produccion';

export interface InfoSistema {
  nombre: string;
  version: string;
  entorno: Entorno;
}

export interface CuerpoRegistro {
  nombres: string;
  apellidos: string;
  email: string;
  telefono: string;
  password: string;
  aceptaPrivacidad: boolean;
}

export interface CuerpoRecuperacion {
  email: string;
}

export interface CuerpoRestablecer {
  token: string;
  password: string;
}

export interface CuerpoCambioContrasena {
  actual: string;
  nueva: string;
}

export interface CorreoSimulado {
  id: string;
  destinatario: string;
  asunto: string;
  /** `null` si el correo se guardó sin el buzón de desarrollo activo (no guarda el contenido). */
  cuerpo: string | null;
  enlace: string | null;
  enviadoEn: string;
}

export interface Especialidad {
  codigo: string;
  nombre: string;
  descripcion: string | null;
}

export interface ProfesionalCatalogo {
  codigo: string;
  nombre: string;
  especialidad: Referencia;
}

export interface SedeCatalogo {
  codigo: string;
  nombre: string;
  direccion: string | null;
}

export interface HorarioReserva {
  horarioId: string;
  inicio: string;
  fin: string;
  profesional: Referencia;
  sede: Referencia;
}

export interface CuerpoReserva {
  horarioId: string;
  especialidadCodigo: string;
}

export type TipoNotificacion = 'RECORDATORIO' | 'CAMBIO';

export interface NotificacionPaciente {
  id: string;
  tipo: TipoNotificacion;
  titulo: string;
  mensaje: string;
  citaId: string;
  citaCodigo: string;
  creadaEn: string;
  leida: boolean;
}

export interface ConteoNoLeidas {
  total: number;
}

export interface Indicador {
  numerador: number;
  denominador: number;
  /** Porcentaje con un decimal; null si el denominador es 0 («No calculable»). */
  tasa: number | null;
}

/**
 * `numerador`: citas reprogramadas al menos una vez. `eventos`: todas las reprogramaciones (una
 * cita reprogramada dos veces suma 1 al numerador y 2 a `eventos`).
 */
export interface IndicadorReprogramacion extends Indicador {
  eventos: number;
}

export interface IndicadorInasistencia extends Indicador {
  provisional: boolean;
  pendientesDeClasificar: number;
}

export interface EsperaPromedio {
  valor: number | null;
  observaciones: number;
  excluidas: number;
}

export interface ResumenIndicadores {
  periodo: { desde: string; hasta: string };
  corte: string;
  zonaHoraria: string;
  filtros: { sede: string | null; especialidad: string | null; profesional: string | null };
  totalCitas: number;
  porEstado: { estado: EstadoCita; etiqueta: string; total: number }[];
  indicadores: {
    confirmacion: Indicador;
    cancelacion: Indicador;
    reprogramacion: IndicadorReprogramacion;
    inasistencia: IndicadorInasistencia;
    esperaPromedioMinutos: EsperaPromedio;
  };
  porDia: { fecha: string; total: number; completadas: number; canceladas: number; noAsistio: number }[];
  porEspecialidad: { codigo: string; nombre: string; total: number; tasaInasistencia: number | null }[];
}

export type ResultadoAuditoria = 'EXITO' | 'RECHAZO' | 'DENEGADO' | 'FALLO';

export interface EntradaAuditoria {
  id: number;
  ocurridoEn: string;
  actor: { id: string; nombre: string; rol: Rol } | null;
  accion: string;
  entidad: string;
  entidadId: string | null;
  resultado: ResultadoAuditoria;
  codigo: string | null;
  requestId: string | null;
}

export interface PaginaAuditoria {
  elementos: EntradaAuditoria[];
  pagina: number;
  tamano: number;
  total: number;
  acciones: string[];
}
