import { ResultadoAuditoria, Rol } from '../../../core/modelos/contrato';
import { NombreIcono } from '../../../shared/ui/icono/iconos';

/**
 * Textos legibles de la bitácora: acciones (`CITA_CONFIRMAR` → «Confirmar cita»),
 * entidades, resultados y roles. Lo desconocido se humaniza con una regla general, así una
 * acción nueva del backend nunca aparece como código crudo.
 */

const ACCIONES: Readonly<Record<string, string>> = {
  LOGIN: 'Iniciar sesión',
  LOGOUT: 'Cerrar sesión',
  REGISTRO: 'Crear cuenta',
  CUENTA_BLOQUEADA_TEMPORALMENTE: 'Bloqueo temporal de la cuenta',
  RECUPERACION_SOLICITAR: 'Solicitar recuperación de contraseña',
  CONTRASENA_RESTABLECER: 'Restablecer contraseña',
  CONTRASENA_CAMBIAR: 'Cambiar contraseña',
  PERFIL_ACTUALIZAR: 'Actualizar datos de contacto',
  ACCESO_RUTA: 'Acceso a una función restringida',
  INDICADORES_EXPORTAR: 'Exportar indicadores (CSV)',
  NOTIFICACION_ACCESO: 'Acceder a una notificación',
  NOTIFICACION_MARCAR_LEIDA: 'Marcar notificación como leída',
  NOTIFICACIONES_MARCAR_LEIDAS: 'Marcar notificaciones como leídas',
  CITA_ACCESO: 'Consultar una cita',
  CITA_REGISTRAR: 'Registrar cita',
  CITA_RESERVAR: 'Reservar cita',
  CITA_CONFIRMAR: 'Confirmar cita',
  CITA_CANCELAR: 'Cancelar cita',
  CITA_REPROGRAMAR: 'Reprogramar cita',
  CITA_PRE_CHECK_IN: 'Completar pre-check-in',
  CITA_REGISTRAR_LLEGADA: 'Registrar llegada',
  CITA_MARCAR_NO_ASISTIO: 'Cerrar cita por inasistencia',
  CITA_OPERADOR_REGISTRAR_LLEGADA: 'Registrar llegada (operador)',
  CITA_OPERADOR_PASAR_A_ESPERA: 'Pasar a sala de espera (operador)',
  CITA_OPERADOR_INICIAR_ATENCION: 'Iniciar atención (operador)',
  CITA_OPERADOR_COMPLETAR: 'Completar atención (operador)',
};

/** Sustantivos con tilde o forma correcta, para la regla general («CITA_ANULAR» → «Anular cita»). */
const SUSTANTIVOS: Readonly<Record<string, string>> = {
  CITA: 'cita',
  CITAS: 'citas',
  PERFIL: 'perfil',
  CUENTA: 'cuenta',
  CONTRASENA: 'contraseña',
  SESION: 'sesión',
  NOTIFICACION: 'notificación',
  NOTIFICACIONES: 'notificaciones',
  USUARIO: 'usuario',
  PACIENTE: 'paciente',
  INDICADORES: 'indicadores',
  RECUPERACION: 'recuperación',
  OPERACION: 'operación',
};

const ENTIDADES: Readonly<Record<string, string>> = {
  CITA: 'Cita',
  SESION: 'Sesión',
  RUTA: 'Ruta',
  USUARIO: 'Usuario',
  PACIENTE: 'Paciente',
  INDICADORES: 'Indicadores',
  NOTIFICACION: 'Notificación',
  OPERACION: 'Operación',
};

const ROLES: Readonly<Record<Rol, string>> = {
  PACIENTE: 'Paciente',
  OPERADOR: 'Operador',
  RESPONSABLE: 'Responsable',
  ADMINISTRADOR: 'Administrador',
};

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function palabras(codigo: string): string[] {
  return codigo
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
}

/** «CITA_CONFIRMAR» → «Confirmar cita». */
export function etiquetaAccion(codigo: string | null | undefined): string {
  const c = (codigo ?? '').trim().toUpperCase();
  if (!c) return 'Acción sin nombre';
  if (ACCIONES[c]) return ACCIONES[c];
  if (c.startsWith('CITA_OPERADOR_')) {
    return `${capitalizar(palabras(c.slice('CITA_OPERADOR_'.length)).join(' '))} (operador)`;
  }
  const [primera, ...resto] = c.split('_');
  const sustantivo = SUSTANTIVOS[primera];
  if (sustantivo && resto.length) {
    return `${capitalizar(palabras(resto.join('_')).join(' '))} ${sustantivo}`;
  }
  return capitalizar(palabras(c).join(' '));
}

/** «CITA» → «Cita». */
export function etiquetaEntidad(codigo: string | null | undefined): string {
  const c = (codigo ?? '').trim().toUpperCase();
  if (!c) return '—';
  return ENTIDADES[c] ?? capitalizar(palabras(c).join(' '));
}

export function etiquetaRol(rol: Rol | null | undefined): string {
  return rol ? (ROLES[rol] ?? capitalizar(rol.toLowerCase())) : 'Sistema';
}

/**
 * Acciones que el backend registra sin sesión (`actor: null`) porque las hace alguien que aún no
 * se identificó (revisado en `backend/src/main/java`):
 * - `LOGIN` fallido o con la cuenta bloqueada (`InicioSesion`);
 * - `REGISTRO` rechazado por correo ya registrado (`RegistroCuentas`);
 * - `RECUPERACION_SOLICITAR` y `CONTRASENA_RESTABLECER`, éxito o enlace no válido
 *   (`RecuperacionCuentas`);
 * - `ACCESO_RUTA` y `CUENTA_BLOQUEADA_TEMPORALMENTE`, por si se registran sin sesión.
 * Las demás acciones sin actor son procesos del sistema: cierre por inasistencia
 * (`CITA_MARCAR_NO_ASISTIO`), registro de citas por el sistema (`CITA_REGISTRAR`), recordatorios…
 */
const ACCIONES_VISITANTE: ReadonlySet<string> = new Set([
  'LOGIN',
  'REGISTRO',
  'RECUPERACION_SOLICITAR',
  'CONTRASENA_RESTABLECER',
  'ACCESO_RUTA',
  'CUENTA_BLOQUEADA_TEMPORALMENTE',
]);

/** Flujos de acceso a la cuenta: una acción nueva de estos, sin actor, también es de un visitante. */
const PREFIJOS_VISITANTE = ['LOGIN_', 'REGISTRO_', 'RECUPERACION_', 'CONTRASENA_'];

/** ¿La acción, registrada sin actor, la hizo un visitante sin sesión (y no un proceso del sistema)? */
export function esAccionDeVisitante(accion: string | null | undefined): boolean {
  const c = (accion ?? '').trim().toUpperCase();
  return ACCIONES_VISITANTE.has(c) || PREFIJOS_VISITANTE.some((p) => c.startsWith(p));
}

/** Cómo se presenta el actor de una entrada sin usuario (`actor: null`). */
export interface ActorSinUsuario {
  tipo: 'visitante' | 'sistema';
  /** Texto principal en la tabla y el detalle. */
  nombre: string;
  /** Segunda línea en la tabla (donde va el rol de un usuario). */
  descripcion: string;
  /** Explicación en el panel de detalle. */
  explicacion: string;
  icono: NombreIcono;
}

const VISITANTE: ActorSinUsuario = {
  tipo: 'visitante',
  nombre: 'Visitante sin sesión',
  descripcion: 'Sin identificar',
  explicacion: 'Acción hecha sin iniciar sesión; la bitácora no identifica a la persona.',
  icono: 'user',
};

const SISTEMA: ActorSinUsuario = {
  tipo: 'sistema',
  nombre: 'Sistema',
  descripcion: 'Proceso automático',
  explicacion: 'Proceso automático, sin usuario',
  icono: 'monitor',
};

/** Actor de una entrada sin usuario: «Visitante sin sesión» o «Sistema · Proceso automático». */
export function actorSinUsuario(accion: string | null | undefined): ActorSinUsuario {
  return esAccionDeVisitante(accion) ? VISITANTE : SISTEMA;
}

/**
 * Códigos que solo aparecen en la bitácora (no son errores de la API), con su explicación para el
 * panel de detalle. Los demás se explican con los mensajes de `core/errores`.
 */
const CODIGOS_AUDITORIA: Readonly<Record<string, string>> = {
  CUENTA_BLOQUEADA_TEMPORALMENTE:
    'La cuenta estaba bloqueada temporalmente por varios intentos fallidos de inicio de sesión.',
};

export function explicacionCodigoAuditoria(codigo: string | null | undefined): string | null {
  return codigo ? (CODIGOS_AUDITORIA[codigo] ?? null) : null;
}

export interface PresentacionResultado {
  etiqueta: string;
  icono: NombreIcono;
  /** Tono semántico de la píldora. */
  tono: 'exito' | 'advertencia' | 'error';
  descripcion: string;
}

export const RESULTADOS: Readonly<Record<ResultadoAuditoria, PresentacionResultado>> = {
  EXITO: {
    etiqueta: 'Éxito',
    icono: 'check-circle',
    tono: 'exito',
    descripcion: 'La acción se completó.',
  },
  RECHAZO: {
    etiqueta: 'Rechazo',
    icono: 'x-circle',
    tono: 'advertencia',
    descripcion: 'Una regla de negocio impidió la acción; no se modificó nada.',
  },
  DENEGADO: {
    etiqueta: 'Denegado',
    icono: 'lock',
    tono: 'error',
    descripcion: 'El usuario no tenía permiso o el recurso no le pertenecía.',
  },
  FALLO: {
    etiqueta: 'Fallo',
    icono: 'alert-triangle',
    tono: 'error',
    descripcion: 'Error del sistema; el detalle está en el registro del servidor.',
  },
};

export const ORDEN_RESULTADOS: readonly ResultadoAuditoria[] = [
  'EXITO',
  'RECHAZO',
  'DENEGADO',
  'FALLO',
];

export function presentacionResultado(resultado: string): PresentacionResultado {
  return (
    RESULTADOS[resultado as ResultadoAuditoria] ?? {
      etiqueta: capitalizar(resultado.toLowerCase()),
      icono: 'info',
      tono: 'advertencia',
      descripcion: '',
    }
  );
}

/** Referencia corta para la tabla («0b6c4f2a…»). La completa va en el detalle. */
export function referenciaCorta(id: string | null | undefined, largo = 8): string {
  if (!id) return '—';
  return id.length > largo + 1 ? `${id.slice(0, largo)}…` : id;
}

const FECHA_SEGUNDOS = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** `{ fecha: '23 oct 2026', hora: '09:14:05' }` en hora de Lima (las auditorías van al segundo). */
export function fechaHoraLima(iso: string): { fecha: string; hora: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { fecha: '', hora: '' };
  const p: Record<string, string> = {};
  for (const parte of FECHA_SEGUNDOS.formatToParts(d)) {
    if (parte.type !== 'literal') p[parte.type] = parte.value;
  }
  const mes = (p['month'] ?? '').replace(/\.$/, '').toLowerCase();
  return {
    fecha: `${p['day']} ${mes} ${p['year']}`,
    hora: `${p['hour']}:${p['minute']}:${p['second']}`,
  };
}
