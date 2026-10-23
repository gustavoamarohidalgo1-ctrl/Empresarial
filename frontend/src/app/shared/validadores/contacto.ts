import { Validators } from '@angular/forms';

/*
 * Datos de contacto (correo y teléfono). Mismos patrones que el servidor: `RegistroCuentas.java`,
 * `PerfilController.java` y el pre-check-in (`PacienteCitasController.java`). Así un teléfono
 * válido en el perfil también lo es en el pre-check-in, y todo lo que se acepta aquí lo acepta la
 * API.
 */

/** Algo antes de la @, y un dominio con al menos un punto: «a@b» no sirve. */
export const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** «+» inicial opcional y de 7 a 20 dígitos, con un espacio opcional entre ellos. */
export const PATRON_TELEFONO = /^\+?[0-9](?: ?[0-9]){6,19}$/;
export const LONGITUD_MAXIMA_CORREO = 160;
export const LONGITUD_MAXIMA_TELEFONO = 30;

export const validadoresEmail = [
  Validators.required,
  Validators.email,
  Validators.pattern(PATRON_CORREO),
  Validators.maxLength(LONGITUD_MAXIMA_CORREO),
];
export const validadoresTelefono = [
  Validators.required,
  Validators.pattern(PATRON_TELEFONO),
  Validators.maxLength(LONGITUD_MAXIMA_TELEFONO),
];

export const MENSAJES_CONTACTO = {
  emailRequerido: 'Escribe tu correo.',
  emailInvalido: 'Escribe un correo válido, por ejemplo nombre@dominio.pe.',
  telefonoRequerido: 'Escribe tu teléfono.',
  telefonoInvalido:
    'Escribe un teléfono válido: solo dígitos y espacios, con «+» inicial opcional (p. ej. +51 900 000 001).',
} as const;
