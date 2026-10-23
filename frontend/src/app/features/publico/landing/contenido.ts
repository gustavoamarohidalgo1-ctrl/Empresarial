import { NombreIcono } from '../../../shared/ui/icono/iconos';

/** Textos de la página pública. Separados de la plantilla para revisarlos y probarlos. */

export interface Elemento {
  icono: NombreIcono;
  titulo: string;
  texto: string;
}

export interface ElementoConEnlace extends Elemento {
  enlace?: { texto: string; ruta: string };
}

export const SELLOS_HERO: readonly string[] = [
  'Sin instalar aplicaciones',
  'Recordatorios automáticos',
  'Datos protegidos por ley',
];

export const BENEFICIOS: readonly Elemento[] = [
  {
    icono: 'calendar-plus',
    titulo: 'Reserva en línea',
    texto:
      'Elige especialidad, profesional, sede y horario disponible, a cualquier hora y desde cualquier dispositivo.',
  },
  {
    icono: 'bell',
    titulo: 'Recordatorios oportunos',
    texto:
      'Te avisamos antes de tu cita y cada vez que algo cambia, para que nada te tome por sorpresa.',
  },
  {
    icono: 'calendar-clock',
    titulo: 'Reprograma o cancela',
    texto:
      'Cambia tu cita a otro horario del mismo profesional o cancélala en pocos pasos, sin llamar.',
  },
  {
    icono: 'clipboard-check',
    titulo: 'Pre-check-in',
    texto: 'Confirma tus datos antes de llegar y reduce el tiempo que pasas en admisión.',
  },
  {
    icono: 'map-pin',
    titulo: 'Llegada guiada',
    texto: 'Consulta desde qué hora puedes presentarte y registra tu llegada al estar en la sede.',
  },
  {
    icono: 'heart-pulse',
    titulo: 'Historial claro',
    texto: 'Revisa tus citas pasadas y cada cambio que tuvieron, en una línea de tiempo sencilla.',
  },
];

export const PASOS: readonly Elemento[] = [
  {
    icono: 'calendar-plus',
    titulo: 'Reserva',
    texto:
      'Elige la especialidad, el profesional, la sede y el horario disponible que mejor te acomode.',
  },
  {
    icono: 'calendar-check',
    titulo: 'Confirma o reprograma',
    texto:
      'Te recordamos tu cita con anticipación. Confírmala, cámbiala de horario o cancélala si lo necesitas.',
  },
  {
    icono: 'stethoscope',
    titulo: 'Llega y atiéndete',
    texto:
      'Haz tu pre-check-in, registra tu llegada en la sede y espera tu turno con tranquilidad.',
  },
];

export const CONFIANZA: readonly ElementoConEnlace[] = [
  {
    icono: 'shield-check',
    titulo: 'Datos protegidos',
    texto:
      'Contraseñas protegidas con hash, sesión segura y bloqueo ante intentos sospechosos. Solo el personal autorizado ve tu información.',
  },
  {
    icono: 'file-text',
    titulo: 'Ley N.º 29733',
    texto:
      'Tratamos tus datos con tu consentimiento, conforme a la Ley de Protección de Datos Personales y su reglamento.',
    enlace: { texto: 'Lee la política de privacidad', ruta: '/privacidad' },
  },
  {
    icono: 'users',
    titulo: 'Accesible para todas las personas',
    texto:
      'Diseñado según WCAG 2.2 nivel AA: uso con teclado, lectores de pantalla, alto contraste y tema oscuro.',
    enlace: { texto: 'Conoce las funciones de accesibilidad', ruta: '/accesibilidad' },
  },
];

export const EQUIPO: readonly Elemento[] = [
  {
    icono: 'layout-dashboard',
    titulo: 'Panel del día',
    texto: 'Admisión registra llegadas y ordena la sala de espera en tiempo real.',
  },
  {
    icono: 'chart-column',
    titulo: 'Indicadores',
    texto:
      'Confirmación, cancelación, reprogramación e inasistencia por periodo, sede y especialidad.',
  },
  {
    icono: 'file-text',
    titulo: 'Bitácora de auditoría',
    texto: 'Cada operación queda registrada para revisar quién hizo qué y cuándo.',
  },
];

export const PREGUNTAS: readonly { pregunta: string; respuesta: string }[] = [
  {
    pregunta: '¿Qué necesito para crear mi cuenta?',
    respuesta:
      'Tus nombres y apellidos, un correo electrónico, un teléfono celular y una contraseña segura. El registro toma menos de dos minutos.',
  },
  {
    pregunta: '¿Puedo cambiar o cancelar mi cita?',
    respuesta:
      'Sí. Desde «Mis citas» puedes reprogramarla a otro horario disponible del mismo profesional o cancelarla, siempre antes de la hora de inicio.',
  },
  {
    pregunta: '¿Cuándo recibo los recordatorios?',
    respuesta:
      'Cuando falten 24 horas o menos para tu cita te enviamos un recordatorio. También te avisamos si la cita cambia.',
  },
  {
    pregunta: '¿Cuándo puedo registrar mi llegada?',
    respuesta:
      'El mismo día de la cita, desde 60 minutos antes hasta 30 minutos después de la hora programada. Pasado ese plazo, la cita se registra como no asistida.',
  },
  {
    pregunta: '¿Olvidé mi contraseña, qué hago?',
    respuesta:
      'Elige «¿Olvidaste tu contraseña?» al iniciar sesión. Te enviaremos un enlace de un solo uso, válido por 30 minutos, para crear una nueva.',
  },
];
