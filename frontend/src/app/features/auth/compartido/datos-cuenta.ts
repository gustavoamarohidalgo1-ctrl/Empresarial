/*
 * Datos de la cuenta (registro y perfil). Reglas IGUALES a las del servidor:
 * `RegistroCuentas.java` (NOMBRE, EMAIL, TELEFONO y su normalización) y `PerfilController.java`
 * (mismos patrones de correo y teléfono). Se valida el valor ya normalizado, que es el que se envía.
 */

import { AbstractControl, ValidationErrors } from '@angular/forms';
import {
  LONGITUD_MAXIMA_CORREO,
  LONGITUD_MAXIMA_TELEFONO,
  PATRON_CORREO,
  PATRON_TELEFONO,
} from '../../../shared/validadores/contacto';

// Correo y teléfono: los mismos patrones que el pre-check-in (`shared/validadores/contacto`).
export { LONGITUD_MAXIMA_CORREO, LONGITUD_MAXIMA_TELEFONO, PATRON_CORREO, PATRON_TELEFONO };

/** Letras (con tildes y diéresis) en palabras separadas por UN espacio, apóstrofo o guion. */
export const PATRON_NOMBRE = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;

export const LONGITUD_NOMBRE = { minima: 2, maxima: 80 } as const;

/**
 * Como el servidor: sin espacios en los extremos y uno solo entre palabras. Además, el apóstrofo
 * tipográfico («’», el de los teclados móviles) pasa a recto («'») para guardar un solo formato.
 */
export function normalizarNombre(valor: string): string {
  return valor.trim().replace(/\s+/g, ' ').replace(/’/g, "'");
}

/** Como el servidor: sin espacios en los extremos (las mayúsculas las baja el servidor). */
export function normalizarCorreo(valor: string): string {
  return valor.trim();
}

/** Como el servidor: sin espacios en los extremos y sin espacios dobles. */
export function normalizarTelefono(valor: string): string {
  return valor.trim().replace(/ {2,}/g, ' ');
}

const valorDe = (control: AbstractControl): string => (control.value as string | null) ?? '';

/** Nombres y apellidos: obligatorio, de 2 a 80 caracteres y solo letras y separadores simples. */
export function validadorNombre(control: AbstractControl): ValidationErrors | null {
  const valor = normalizarNombre(valorDe(control));
  if (!valor) return { requerido: true };
  const largo = [...valor].length;
  if (largo < LONGITUD_NOMBRE.minima || largo > LONGITUD_NOMBRE.maxima) return { longitud: true };
  return PATRON_NOMBRE.test(valor) ? null : { formato: true };
}

/** Correo: obligatorio, hasta 160 caracteres y con el patrón del servidor. */
export function validadorCorreo(control: AbstractControl): ValidationErrors | null {
  const valor = normalizarCorreo(valorDe(control));
  if (!valor) return { required: true };
  if (valor.length > LONGITUD_MAXIMA_CORREO) return { maxlength: true };
  return PATRON_CORREO.test(valor) ? null : { email: true };
}

/** Teléfono: obligatorio, hasta 30 caracteres y con el patrón del servidor. */
export function validadorTelefono(control: AbstractControl): ValidationErrors | null {
  const valor = normalizarTelefono(valorDe(control));
  if (!valor) return { required: true };
  if (valor.length > LONGITUD_MAXIMA_TELEFONO) return { maxlength: true };
  return PATRON_TELEFONO.test(valor) ? null : { pattern: true };
}
