import {
  ChangeDetectionStrategy,
  Component,
  ViewContainerRef,
  input,
  inputBinding,
  signal,
  viewChild,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { componenteDiferido } from './diferido';

@Component({
  selector: 'app-saludo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="saludo">Hola, {{ nombre() }}</p>`,
})
class SaludoComponent {
  readonly nombre = input('');
}

let importar: () => Promise<typeof SaludoComponent>;

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (visible()) {
    <ng-container #ancla />
  }`,
})
class AnfitrionComponent {
  readonly visible = signal(true);
  readonly cuando = signal(false);
  readonly nombre = signal('Ana');
  private readonly ancla = viewChild('ancla', { read: ViewContainerRef });
  readonly diferido = componenteDiferido({
    ancla: this.ancla,
    importar: () => importar(),
    cuando: this.cuando,
    enlaces: () => [inputBinding('nombre', this.nombre)],
  });
}

describe('componenteDiferido', () => {
  let llamadas: number;

  beforeEach(() => {
    llamadas = 0;
    importar = () => {
      llamadas++;
      return Promise.resolve(SaludoComponent);
    };
  });

  async function crear() {
    const fixture = TestBed.createComponent(AnfitrionComponent);
    await fixture.whenStable();
    return fixture;
  }
  const saludo = (f: { nativeElement: HTMLElement }) =>
    f.nativeElement.querySelector('.saludo')?.textContent;

  it('no carga nada hasta que se cumple la condición; luego crea el componente con sus entradas', async () => {
    const fixture = await crear();
    expect(llamadas).toBe(0);
    expect(saludo(fixture)).toBeUndefined();
    expect(fixture.componentInstance.diferido.cargado()).toBe(false);

    fixture.componentInstance.cuando.set(true);
    await fixture.whenStable();
    expect(llamadas).toBe(1);
    expect(fixture.componentInstance.diferido.cargado()).toBe(true);
    expect(saludo(fixture)).toBe('Hola, Ana');

    // Las entradas siguen a las señales del anfitrión.
    fixture.componentInstance.nombre.set('Luis');
    await fixture.whenStable();
    expect(saludo(fixture)).toBe('Hola, Luis');
  });

  it('cargar() precarga una sola vez aunque se llame varias', async () => {
    const fixture = await crear();
    fixture.componentInstance.diferido.cargar();
    fixture.componentInstance.diferido.cargar();
    fixture.componentInstance.cuando.set(true);
    await fixture.whenStable();
    expect(llamadas).toBe(1);
    expect(saludo(fixture)).toBe('Hola, Ana');
  });

  it('si el ancla desaparece y vuelve (p. ej. cerrar e iniciar sesión), lo crea de nuevo', async () => {
    const fixture = await crear();
    fixture.componentInstance.cuando.set(true);
    await fixture.whenStable();
    fixture.componentInstance.visible.set(false);
    await fixture.whenStable();
    expect(saludo(fixture)).toBeUndefined();
    fixture.componentInstance.visible.set(true);
    await fixture.whenStable();
    expect(saludo(fixture)).toBe('Hola, Ana');
    expect(fixture.nativeElement.querySelectorAll('.saludo')).toHaveLength(1);
    expect(llamadas).toBe(1);
  });

  it('si la carga falla (sin conexión), el siguiente intento la repite', async () => {
    let fallar = true;
    importar = () => {
      llamadas++;
      return fallar ? Promise.reject(new Error('sin red')) : Promise.resolve(SaludoComponent);
    };
    const fixture = await crear();
    fixture.componentInstance.diferido.cargar();
    await fixture.whenStable();
    expect(saludo(fixture)).toBeUndefined();
    fallar = false;
    fixture.componentInstance.diferido.cargar();
    await fixture.whenStable();
    expect(llamadas).toBe(2);
    expect(saludo(fixture)).toBe('Hola, Ana');
  });
});
