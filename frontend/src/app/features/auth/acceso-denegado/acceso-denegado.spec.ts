import { WritableSignal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { OPERADOR, PACIENTE } from '../../../../testing/datos-prueba';
import { enlace, query, texto } from '../../../../testing/dom';
import { AuthService } from '../../../core/auth/auth.service';
import { UsuarioSesion } from '../../../core/modelos/contrato';
import { AccesoDenegadoComponent } from './acceso-denegado';

describe('AccesoDenegadoComponent', () => {
  let fixture: ComponentFixture<AccesoDenegadoComponent>;
  let usuario: WritableSignal<UsuarioSesion | null>;

  async function crear(u: UsuarioSesion | null) {
    usuario = signal<UsuarioSesion | null>(u);
    TestBed.configureTestingModule({
      imports: [AccesoDenegadoComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: { usuario } }],
    });
    fixture = TestBed.createComponent(AccesoDenegadoComponent);
    await fixture.whenStable();
  }

  it('explica el problema con un h1, una ilustración decorativa y el código', async () => {
    await crear(null);
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Acceso denegado');
    expect(texto(fixture)).toContain('Error 403');
    expect(texto(fixture)).toContain('Tu cuenta no tiene permiso para ver esta página');
    expect(texto(fixture)).toContain('comunícate con el administrador de SIGA-SP de tu sede');
    expect(texto(fixture)).not.toMatch(/piloto|prueba|demo/i);
    expect(query(fixture, 'svg.pe__ilustracion').getAttribute('aria-hidden')).toBe('true');
  });

  it('sin sesión ofrece iniciar sesión', async () => {
    await crear(null);
    const a = enlace(fixture, 'Iniciar sesión');
    expect(a?.getAttribute('href')).toBe('/login');
    expect(enlace(fixture, 'Ir a mi inicio')).toBeUndefined();
    expect(fixture.nativeElement.querySelector('.ad__sesion')).toBeNull();
  });

  it('con sesión lleva al inicio del rol y muestra quién está conectado', async () => {
    await crear(PACIENTE);
    expect(enlace(fixture, 'Ir a mi inicio')?.getAttribute('href')).toBe('/paciente/citas');
    expect(enlace(fixture, 'Iniciar sesión')).toBeUndefined();
    expect(query(fixture, '.ad__sesion').textContent).toContain('Sesión de Ana Demo · Paciente');
  });

  it('actualiza el destino si cambia el usuario', async () => {
    await crear(PACIENTE);
    usuario.set(OPERADOR);
    await fixture.whenStable();
    expect(enlace(fixture, 'Ir a mi inicio')?.getAttribute('href')).toBe('/operador');
  });
});
