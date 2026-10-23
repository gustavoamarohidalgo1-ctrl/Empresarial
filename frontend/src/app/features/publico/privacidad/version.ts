import type { VersionDocumento } from '../compartido/documento/documento';

/**
 * Versión vigente de la política de privacidad. El servidor guarda la versión que acepta cada
 * persona al crear su cuenta: si el texto cambia de forma sustancial, sube el número y la fecha.
 * Archivo aparte para que el registro la muestre sin cargar la página de la política.
 */
export const VERSION_PRIVACIDAD: VersionDocumento = {
  numero: '1.0',
  vigenteDesde: '23 de octubre de 2026',
};
