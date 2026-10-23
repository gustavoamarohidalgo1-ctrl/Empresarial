import { Component, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { boton, escribir, query } from '../../../../../testing/dom';
import { CampoClaveComponent } from './campo-clave';

@Component({
  imports: [ReactiveFormsModule, CampoClaveComponent],
  template: `
    <label for="clave">Contraseña</label>
    <app-campo-clave
      idCampo="clave"
      nombre="nueva contraseña"
      [formControl]="control"
      [invalido]="invalido()"
      describedby="clave-ayuda"
    />
    <p id="clave-ayuda">Ayuda</p>
  `,
})
class Anfitrion {
  readonly control = new FormControl('', { nonNullable: true });
  readonly invalido = signal(false);
  readonly campo = viewChild.required(CampoClaveComponent);
}

describe('CampoClaveComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;
  const entrada = () => query<HTMLInputElement>(fixture, '#clave');

  beforeEach(async () => {
    fixture = TestBed.createComponent(Anfitrion);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('sincroniza el valor con el formulario en ambos sentidos', async () => {
    escribir(entrada(), 'Clave-2026x');
    expect(fixture.componentInstance.control.value).toBe('Clave-2026x');
    fixture.componentInstance.control.setValue('otra');
    await fixture.whenStable();
    expect(entrada().value).toBe('otra');
  });

  it('muestra y oculta el texto con un botón que nombra el campo', async () => {
    expect(entrada().type).toBe('password');
    expect(entrada().getAttribute('autocomplete')).toBe('new-password');
    const alternar = boton(fixture, /Mostrar nueva contraseña/)!;
    expect(alternar.type).toBe('button');
    expect(alternar.getAttribute('aria-controls')).toBe('clave');
    alternar.click();
    await fixture.whenStable();
    expect(entrada().type).toBe('text');
    expect(boton(fixture, /Ocultar nueva contraseña/)).toBeDefined();

    fixture.componentInstance.campo().ocultar();
    await fixture.whenStable();
    expect(entrada().type).toBe('password');
  });

  it('avisa de Bloq Mayús y lo añade a la descripción del campo', async () => {
    expect(entrada().getAttribute('aria-describedby')).toBe('clave-ayuda');
    const tecla = new KeyboardEvent('keydown', { key: 'A' });
    Object.defineProperty(tecla, 'getModifierState', { value: (m: string) => m === 'CapsLock' });
    entrada().dispatchEvent(tecla);
    await fixture.whenStable();
    expect(query(fixture, '#clave-mayus').textContent).toContain('Bloq Mayús está activado.');
    expect(entrada().getAttribute('aria-describedby')).toBe('clave-mayus clave-ayuda');
  });

  it('marca el campo como tocado al salir, refleja aria-invalid y se deshabilita con el control', async () => {
    entrada().dispatchEvent(new Event('blur'));
    expect(fixture.componentInstance.control.touched).toBe(true);
    fixture.componentInstance.invalido.set(true);
    await fixture.whenStable();
    expect(entrada().getAttribute('aria-invalid')).toBe('true');
    fixture.componentInstance.control.disable();
    await fixture.whenStable();
    expect(entrada().disabled).toBe(true);
  });

  it('enfocar() lleva el foco al campo', () => {
    fixture.componentInstance.campo().enfocar();
    expect(document.activeElement).toBe(entrada());
  });
});
