import { FormControl } from '@angular/forms';
import { PATRON_TELEFONO as PATRON_TELEFONO_CUENTA } from '../../features/auth/compartido/datos-cuenta';
import { PATRON_CORREO, PATRON_TELEFONO, validadoresEmail, validadoresTelefono } from './contacto';

const valido = (validadores: typeof validadoresEmail, valor: string) =>
  new FormControl(valor, { validators: validadores }).valid;

describe('validadores de contacto (pre-check-in)', () => {
  it('usan los mismos patrones que el servidor y que el registro y el perfil', () => {
    expect(PATRON_TELEFONO.source).toBe('^\\+?[0-9](?: ?[0-9]){6,19}$');
    expect(PATRON_CORREO.source).toBe('^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$');
    expect(PATRON_TELEFONO_CUENTA).toBe(PATRON_TELEFONO);
  });

  it('teléfono: de 7 a 20 dígitos con «+» inicial opcional y espacios simples, hasta 30 caracteres', () => {
    expect(valido(validadoresTelefono, '+51 900 000 001')).toBe(true);
    expect(valido(validadoresTelefono, '1234567')).toBe(true);
    // 20 dígitos: válido en el perfil, así que también en el pre-check-in.
    expect(valido(validadoresTelefono, '+51 9876 5432 1098 7654 32')).toBe(true);
    expect(valido(validadoresTelefono, '123456')).toBe(false);
    expect(valido(validadoresTelefono, '1'.repeat(21))).toBe(false);
    expect(valido(validadoresTelefono, '900  000 001')).toBe(false);
    expect(valido(validadoresTelefono, '')).toBe(false);
  });

  it('correo: obligatorio, con dominio con punto y hasta 160 caracteres', () => {
    expect(valido(validadoresEmail, 'ana.torres@correo.test')).toBe(true);
    expect(valido(validadoresEmail, 'a@b')).toBe(false);
    expect(valido(validadoresEmail, 'sin-arroba.pe')).toBe(false);
    expect(valido(validadoresEmail, `${'a'.repeat(150)}@correo.test`)).toBe(false);
    expect(valido(validadoresEmail, '')).toBe(false);
  });
});
