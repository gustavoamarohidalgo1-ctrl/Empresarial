import { FormControl } from '@angular/forms';
import {
  PATRON_TELEFONO,
  normalizarNombre,
  normalizarTelefono,
  validadorCorreo,
  validadorNombre,
  validadorTelefono,
} from './datos-cuenta';

/** Casos tomados de las reglas de `RegistroCuentas.java` y `PerfilController.java`. */
describe('Datos de la cuenta (iguales al servidor)', () => {
  describe('validadorNombre', () => {
    const validar = (v: string) => validadorNombre(new FormControl(v));

    it('acepta letras con tildes, espacios, apóstrofo y guion', () => {
      expect(validar('Ñusta')).toBeNull();
      expect(validar('Paredes Rojas')).toBeNull();
      expect(validar("D'Angelo")).toBeNull();
      expect(validar('D’Angelo')).toBeNull();
      expect(validar('Ruiz-Huidobro')).toBeNull();
      expect(validar("María-José O'Brien")).toBeNull();
      expect(validar('  Ana   María  ')).toBeNull(); // se normaliza antes de validar
    });

    it('rechaza vacíos, longitudes fuera de 2–80 y otros caracteres', () => {
      expect(validar('   ')).toEqual({ requerido: true });
      expect(validar('A')).toEqual({ longitud: true });
      expect(validar('a'.repeat(81))).toEqual({ longitud: true });
      expect(validar('Ana2')).toEqual({ formato: true });
      expect(validar('Ana--')).toEqual({ formato: true });
    });

    it('rechaza separadores dobles o seguidos, como el servidor', () => {
      expect(validar('Ana--María')).toEqual({ formato: true });
      expect(validar("Ana '-María")).toEqual({ formato: true });
      expect(validar("O''Brien")).toEqual({ formato: true });
      expect(validar('-Ana')).toEqual({ formato: true });
    });
  });

  describe('normalizarNombre', () => {
    it('quita espacios sobrantes y usa el apóstrofo recto', () => {
      expect(normalizarNombre('  María   José ')).toBe('María José');
      expect(normalizarNombre('D’Angelo')).toBe("D'Angelo");
    });
  });

  describe('validadorCorreo', () => {
    const validar = (v: string) => validadorCorreo(new FormControl(v));

    it('exige un dominio con punto («a@b» no sirve)', () => {
      expect(validar('a@b')).toEqual({ email: true });
      expect(validar('ana@correo')).toEqual({ email: true });
      expect(validar('ana @correo.pe')).toEqual({ email: true });
      expect(validar('ana@@correo.pe')).toEqual({ email: true });
      expect(validar(' ana.perez@correo.pe ')).toBeNull();
      expect(validar('a@b.pe')).toBeNull();
    });

    it('es obligatorio y admite hasta 160 caracteres', () => {
      expect(validar('  ')).toEqual({ required: true });
      const largo = `${'a'.repeat(150)}@correo.pe`; // 160
      expect(validar(largo)).toBeNull();
      expect(validar(`a${largo}`)).toEqual({ maxlength: true });
    });
  });

  describe('validadorTelefono', () => {
    const validar = (v: string) => validadorTelefono(new FormControl(v));

    it('es obligatorio', () => {
      expect(validar('')).toEqual({ required: true });
      expect(validar('   ')).toEqual({ required: true });
    });

    it('usa el patrón del servidor: «+» opcional y de 7 a 20 dígitos', () => {
      expect(PATRON_TELEFONO.source).toBe('^\\+?[0-9](?: ?[0-9]){6,19}$');
      expect(validar('+51 987 654 321')).toBeNull();
      expect(validar('987654321')).toBeNull();
      expect(validar('1234567')).toBeNull(); // 7 dígitos
      expect(validar('123456')).toEqual({ pattern: true }); // 6
      expect(validar('1'.repeat(20))).toBeNull(); // 20
      expect(validar('1'.repeat(21))).toEqual({ pattern: true });
      expect(validar('+51 98-765-4321')).toEqual({ pattern: true });
      expect(validar('51+987654321')).toEqual({ pattern: true });
    });

    it('admite espacios dobles (el servidor los colapsa) y limita a 30 caracteres', () => {
      expect(validar('+51  987  654  321')).toBeNull();
      expect(normalizarTelefono(' +51  987  654 321 ')).toBe('+51 987 654 321');
      expect(validar('1 '.repeat(15) + '1')).toEqual({ maxlength: true }); // 31 caracteres
    });
  });
});
