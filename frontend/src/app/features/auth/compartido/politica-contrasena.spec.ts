import { FormControl, FormGroup } from '@angular/forms';
import {
  MENSAJES_CLAVE,
  clavesCoinciden,
  esIgualAlCorreo,
  evaluarClave,
  mensajeClave,
  validadorPoliticaClave,
} from './politica-contrasena';

const estadoDe = (clave: string, id: string, correo?: string | null) =>
  evaluarClave(clave, correo).reglas.find((r) => r.id === id)?.estado;

describe('Política de contraseñas (igual a PoliticaContrasenas.java)', () => {
  it('exige de 10 a 128 caracteres', () => {
    expect(mensajeClave('abc12')).toBe(MENSAJES_CLAVE.longitud);
    expect(mensajeClave('a1'.repeat(65))).toBe(MENSAJES_CLAVE.longitud); // 130
    expect(mensajeClave('a1'.repeat(64))).toBeNull(); // 128
  });

  it('exige al menos una letra y un número', () => {
    expect(mensajeClave('solamenteletras')).toBe(MENSAJES_CLAVE['letra-numero']);
    expect(mensajeClave('123456789012')).toBe(MENSAJES_CLAVE['letra-numero']);
    expect(mensajeClave('ñandú2026valle')).toBeNull();
  });

  it('cuenta caracteres como el servidor (puntos de código, no unidades UTF-16)', () => {
    // 9 emojis (18 unidades UTF-16) + «a1» = 11 puntos de código: cumple.
    expect(estadoDe('😀'.repeat(9) + 'a1', 'longitud')).toBe('cumple');
    // 4 emojis + «a1» = 6 puntos de código, aunque `length` sea 10: no cumple.
    expect(estadoDe('😀'.repeat(4) + 'a1', 'longitud')).toBe('pendiente');
  });

  it('acepta dígitos Unicode como el servidor (Character.isDigit)', () => {
    expect(mensajeClave('valledelurin٣')).toBeNull(); // dígito árabe-índico
  });

  it('no admite el correo como contraseña (sin distinguir mayúsculas)', () => {
    expect(mensajeClave('Lucia1@correo.test', 'lucia1@correo.test')).toBe(MENSAJES_CLAVE.correo);
    expect(mensajeClave('Lucia1@correo.test')).toBeNull();
  });

  it('tampoco admite la parte del correo antes de la @ (regla del servidor)', () => {
    expect(mensajeClave('juanperez2024', 'juanperez2024@correo.test')).toBe(MENSAJES_CLAVE.correo);
    expect(mensajeClave('  JuanPerez2024 ', 'juanperez2024@correo.test')).toBe(
      MENSAJES_CLAVE.correo,
    );
    expect(mensajeClave('juanperez2025', 'juanperez2024@correo.test')).toBeNull();
    expect(esIgualAlCorreo('x', '')).toBe(false);
    // Sin arroba (o con la arroba al inicio) se compara con el valor completo, como en Java.
    expect(esIgualAlCorreo('@dominio.pe', '@dominio.pe')).toBe(true);
  });

  it('rechaza las contraseñas comunes de la muestra local (sin mayúsculas ni espacios extremos)', () => {
    expect(mensajeClave('Password123')).toBe(MENSAJES_CLAVE.comun);
    expect(mensajeClave(' qwerty12345 ')).toBe(MENSAJES_CLAVE.comun);
    expect(estadoDe('qwerty12345', 'comun')).toBe('pendiente');
  });

  it('fuera de la muestra, «contraseña común» queda neutra: se comprueba al enviar', () => {
    const evaluacion = evaluarClave('Valle-de-Lurin-2026');
    const comun = evaluacion.reglas.find((r) => r.id === 'comun')!;
    expect(comun.estado).toBe('al-enviar');
    expect(comun.cumple).toBe(true); // no bloquea el envío: decide el servidor
    expect(evaluacion.cumplePolitica).toBe(true);
    expect(estadoDe('', 'comun')).toBe('al-enviar');
  });

  it('pide escribirla si está vacía', () => {
    expect(mensajeClave('')).toBe(MENSAJES_CLAVE.requerida);
  });

  it('solo muestra la regla del correo si se conoce el correo', () => {
    expect(evaluarClave('x', null).reglas.map((r) => r.id)).toEqual([
      'longitud',
      'letra-numero',
      'comun',
    ]);
    expect(evaluarClave('x', 'a@b.pe').reglas.map((r) => r.id)).toContain('correo');
  });

  it('gradúa la seguridad: débil, aceptable, segura y muy segura', () => {
    expect(evaluarClave('').nivel).toBe(0);
    expect(evaluarClave('corta1')).toMatchObject({ nivel: 1, etiqueta: 'Débil' });
    expect(evaluarClave('valle2026a')).toMatchObject({ nivel: 2, etiqueta: 'Aceptable' });
    expect(evaluarClave('Valle-2026ab')).toMatchObject({ nivel: 3, etiqueta: 'Segura' });
    expect(evaluarClave('Valle-de-Lurin-2026')).toMatchObject({ nivel: 4, etiqueta: 'Muy segura' });
  });

  it('validadorPoliticaClave usa el correo vigente y deja «requerida» a Validators.required', () => {
    let correo = 'ana@correo.test';
    const control = new FormControl('', { validators: validadorPoliticaClave(() => correo) });
    expect(control.errors).toBeNull();
    control.setValue('ana@correo.test1');
    expect(control.errors).toBeNull();
    correo = 'ana@correo.test1';
    control.updateValueAndValidity();
    expect(control.errors).toEqual({ politica: 'correo' });
    control.setValue('lucia2026ab');
    correo = 'lucia2026ab@correo.test';
    control.updateValueAndValidity();
    expect(control.errors).toEqual({ politica: 'correo' });
  });

  it('clavesCoinciden marca el grupo cuando la confirmación es distinta', () => {
    const grupo = new FormGroup(
      { a: new FormControl('Clave-2026x'), b: new FormControl('') },
      { validators: clavesCoinciden('a', 'b') },
    );
    expect(grupo.hasError('clavesDistintas')).toBe(false); // sin confirmación aún
    grupo.controls.b.setValue('otra');
    expect(grupo.hasError('clavesDistintas')).toBe(true);
    grupo.controls.b.setValue('Clave-2026x');
    expect(grupo.hasError('clavesDistintas')).toBe(false);
  });
});
