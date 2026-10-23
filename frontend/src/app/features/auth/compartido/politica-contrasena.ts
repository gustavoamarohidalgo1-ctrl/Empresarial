import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/*
 * Política de contraseñas: refleja EXACTAMENTE `PoliticaContrasenas.java` del servidor.
 * - de 10 a 128 caracteres (puntos de código, no unidades UTF-16);
 * - al menos una letra (`Character.isLetter` = `\p{L}`) y un dígito (`Character.isDigit` = `\p{Nd}`);
 * - distinta del correo y de su parte local (lo que va antes de la @), sin distinguir
 *   mayúsculas e ignorando los espacios de los extremos;
 * - fuera de la lista de contraseñas comunes (también sin mayúsculas ni espacios extremos).
 * El servidor es quien decide (400 `VALIDACION` en `password` o `nueva`). Su lista de comunes es
 * mucho más larga que la muestra local, así que esa regla queda «Se comprueba al enviar» salvo
 * que la contraseña esté en la muestra, y entonces sí se marca como incumplida.
 */

export const LONGITUD_MINIMA_CLAVE = 10;
export const LONGITUD_MAXIMA_CLAVE = 128;

/**
 * Muestra de contraseñas muy usadas (en minúsculas) que cumplen el resto de reglas. La lista
 * completa vive en el servidor (`seguridad/contrasenas-comunes.txt`); esta solo adelanta los
 * casos más previsibles.
 */
export const CONTRASENAS_COMUNES: ReadonlySet<string> = new Set([
  '1234567890a',
  'a123456789',
  'a1234567890',
  'abc1234567',
  'abcd123456',
  'abcde12345',
  'aa12345678',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'qwertyuiop1',
  '1q2w3e4r5t',
  '1qaz2wsx3edc',
  'password12',
  'password123',
  'password1234',
  'passw0rd123',
  'contrasena1',
  'contrasena12',
  'contrasena123',
  'contraseña1',
  'contraseña12',
  'contraseña123',
  'iloveyou12',
  'teamo12345',
  'teamo123456',
  'bienvenido1',
  'bienvenida1',
  'peru123456',
  'peru1234567',
  'lima123456',
  'lima1234567',
  'admin12345',
  'admin123456',
  'usuario1234',
  'sigasp1234',
  'sigasp12345',
]);

export type IdReglaClave = 'longitud' | 'letra-numero' | 'correo' | 'comun';

/**
 * - `cumple`: la regla se cumple.
 * - `pendiente`: aún no se cumple (o, en la de comunes, la contraseña está en la muestra local).
 * - `al-enviar`: solo el servidor puede comprobarla (la lista completa de comunes): estado neutro.
 */
export type EstadoRegla = 'cumple' | 'pendiente' | 'al-enviar';

export interface ReglaClave {
  id: IdReglaClave;
  texto: string;
  estado: EstadoRegla;
  /** `true` si no se sabe que incumpla (`cumple` o `al-enviar`). */
  cumple: boolean;
}

/** Texto del estado neutro de la regla de contraseñas comunes. */
export const TEXTO_AL_ENVIAR = 'Se comprueba al enviar';

/** 0 = vacía · 1 = débil (no cumple la política) · 2 = aceptable · 3 = segura · 4 = muy segura. */
export type NivelClave = 0 | 1 | 2 | 3 | 4;

export interface EvaluacionClave {
  reglas: ReglaClave[];
  cumplePolitica: boolean;
  nivel: NivelClave;
  etiqueta: string;
}

export const ETIQUETA_NIVEL: Readonly<Record<NivelClave, string>> = {
  0: '',
  1: 'Débil',
  2: 'Aceptable',
  3: 'Segura',
  4: 'Muy segura',
};

/** Mensaje de error por regla (el primero que falle es el que se muestra junto al campo). */
export const MENSAJES_CLAVE: Readonly<Record<IdReglaClave | 'requerida', string>> = {
  requerida: 'Escribe una contraseña.',
  longitud: `Usa entre ${LONGITUD_MINIMA_CLAVE} y ${LONGITUD_MAXIMA_CLAVE} caracteres.`,
  'letra-numero': 'Incluye al menos una letra y un número.',
  correo: 'Tu contraseña no puede ser tu correo ni lo que va antes de la @.',
  comun: 'Esa contraseña es muy común. Elige otra más difícil de adivinar.',
};

function tiposDeCaracter(clave: string): number {
  return [/\p{Ll}/u, /\p{Lu}/u, /\p{Nd}/u, /[^\p{L}\p{Nd}]/u].filter((r) => r.test(clave)).length;
}

/**
 * Normalización del servidor para comparar: `trim()` + `toLowerCase(Locale.ROOT)`. `String.trim`
 * de Java solo quita caracteres ≤ U+0020; `toLowerCase()` de JS no depende del idioma, como ROOT.
 */
function normalizarComparacion(valor: string): string {
  return valor.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').toLowerCase();
}

/** `igualAlCorreo` del servidor: la contraseña no puede ser el correo ni su parte local. */
export function esIgualAlCorreo(clave: string, correo: string | null | undefined): boolean {
  if (!correo || !correo.trim()) return false;
  const c = normalizarComparacion(clave);
  const email = normalizarComparacion(correo);
  const arroba = email.indexOf('@');
  const usuario = arroba > 0 ? email.slice(0, arroba) : email;
  return c === email || c === usuario;
}

/** `true` si la contraseña está en la muestra local de contraseñas comunes. */
export function esClaveComun(clave: string): boolean {
  return CONTRASENAS_COMUNES.has(normalizarComparacion(clave));
}

function regla(id: IdReglaClave, texto: string, estado: EstadoRegla): ReglaClave {
  return { id, texto, estado, cumple: estado !== 'pendiente' };
}

/**
 * Evalúa una contraseña frente a la política. `correo` es opcional: sin él (p. ej. al
 * restablecer desde un enlace) no se muestra la regla «Distinta de tu correo» y la comprueba
 * el servidor.
 */
export function evaluarClave(clave: string, correo?: string | null): EvaluacionClave {
  const longitud = [...clave].length;
  const vacia = clave.length === 0;
  const reglas: ReglaClave[] = [
    regla(
      'longitud',
      `Entre ${LONGITUD_MINIMA_CLAVE} y ${LONGITUD_MAXIMA_CLAVE} caracteres`,
      longitud >= LONGITUD_MINIMA_CLAVE && longitud <= LONGITUD_MAXIMA_CLAVE
        ? 'cumple'
        : 'pendiente',
    ),
    regla(
      'letra-numero',
      'Al menos una letra y un número',
      /\p{L}/u.test(clave) && /\p{Nd}/u.test(clave) ? 'cumple' : 'pendiente',
    ),
  ];
  if (correo?.trim()) {
    reglas.push(
      regla(
        'correo',
        'Distinta de tu correo y de lo que va antes de la @',
        !vacia && !esIgualAlCorreo(clave, correo) ? 'cumple' : 'pendiente',
      ),
    );
  }
  // La lista completa está en el servidor: sin coincidencia local, el resultado es neutro.
  reglas.push(
    regla(
      'comun',
      'Que no sea una contraseña común',
      !vacia && esClaveComun(clave) ? 'pendiente' : 'al-enviar',
    ),
  );

  const cumplePolitica = !vacia && reglas.every((r) => r.cumple);
  let nivel: NivelClave = 0;
  if (!vacia) {
    const tipos = tiposDeCaracter(clave);
    if (!cumplePolitica) nivel = 1;
    else if (longitud >= 20 || (longitud >= 16 && tipos >= 3)) nivel = 4;
    else if (longitud >= 14 || (longitud >= 12 && tipos >= 3)) nivel = 3;
    else nivel = 2;
  }
  return { reglas, cumplePolitica, nivel, etiqueta: ETIQUETA_NIVEL[nivel] };
}

/** Mensaje del primer requisito que falla, o `null` si la contraseña cumple la política. */
export function mensajeClave(clave: string, correo?: string | null): string | null {
  if (!clave) return MENSAJES_CLAVE.requerida;
  const fallida = evaluarClave(clave, correo).reglas.find((r) => !r.cumple);
  return fallida ? MENSAJES_CLAVE[fallida.id] : null;
}

/**
 * Validador de la política. `correo` se lee en cada validación (puede cambiar mientras se
 * escribe el formulario de registro). Devuelve `{ politica: '<id de la regla>' }`.
 */
export function validadorPoliticaClave(correo: () => string | null | undefined): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const valor = (control.value as string | null) ?? '';
    if (!valor) return null; // «requerida» la cubre `Validators.required`.
    const fallida = evaluarClave(valor, correo()).reglas.find((r) => !r.cumple);
    return fallida ? { politica: fallida.id } : null;
  };
}

/** Validador de grupo: la confirmación debe ser igual a la contraseña. */
export function clavesCoinciden(campoClave: string, campoConfirmacion: string): ValidatorFn {
  return (grupo: AbstractControl): ValidationErrors | null => {
    const clave = grupo.get(campoClave)?.value as string | undefined;
    const confirmacion = grupo.get(campoConfirmacion)?.value as string | undefined;
    if (!confirmacion) return null;
    return clave === confirmacion ? null : { clavesDistintas: true };
  };
}

export const MENSAJES_CONFIRMACION = {
  requerida: 'Repite la contraseña para confirmarla.',
  distinta: 'Las contraseñas no coinciden.',
} as const;
