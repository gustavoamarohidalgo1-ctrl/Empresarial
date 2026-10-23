import { TestBed } from '@angular/core/testing';
import { CorreoRecordadoService } from './correo-recordado';

describe('CorreoRecordadoService', () => {
  it('recuerda el correo (sin espacios) y lo entrega una sola vez', () => {
    const servicio = TestBed.inject(CorreoRecordadoService);
    servicio.recordar('  ana@correo.test ');
    expect(servicio.consumir()).toBe('ana@correo.test');
    expect(servicio.consumir()).toBeNull();
    servicio.recordar('   ');
    expect(servicio.consumir()).toBeNull();
  });
});
