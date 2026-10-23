import { ComponentFixture, TestBed } from '@angular/core/testing';
import { query } from '../../../../../testing/dom';
import { MedidorClaveComponent } from './medidor-clave';

describe('MedidorClaveComponent', () => {
  let fixture: ComponentFixture<MedidorClaveComponent>;

  async function con(clave: string, correo: string | null = null) {
    fixture.componentRef.setInput('clave', clave);
    fixture.componentRef.setInput('correo', correo);
    await fixture.whenStable();
  }

  beforeEach(async () => {
    fixture = TestBed.createComponent(MedidorClaveComponent);
    fixture.componentRef.setInput('idBase', 'prueba-clave');
    await fixture.whenStable();
  });

  const nivel = () => query(fixture, '#prueba-clave-nivel');
  const llenos = () => fixture.nativeElement.querySelectorAll('.medidor__tramo--lleno').length;

  it('anuncia el nivel en una región viva atómica y la barra es decorativa', async () => {
    expect(nivel().getAttribute('aria-live')).toBe('polite');
    expect(nivel().getAttribute('aria-atomic')).toBe('true');
    expect(nivel().textContent!.trim()).toBe('');
    expect(query(fixture, '.medidor__barra').getAttribute('aria-hidden')).toBe('true');

    await con('corta1');
    expect(nivel().textContent).toContain('Seguridad de la contraseña: Débil');
    expect(llenos()).toBe(1);

    await con('Valle-de-Lurin-2026');
    expect(nivel().textContent).toContain('Muy segura');
    expect(llenos()).toBe(4);
  });

  it('lista los requisitos con icono y texto «cumple»/«pendiente»', async () => {
    await con('valle2026', 'ana@correo.test');
    const lista = query(fixture, '#prueba-clave-requisitos');
    expect(lista.getAttribute('aria-label')).toBe('Requisitos de la contraseña');
    const items = Array.from(lista.querySelectorAll('li'));
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toContain('Entre 10 y 128 caracteres');
    expect(items[0].textContent).toContain('pendiente');
    expect(items[1].textContent).toContain('cumple');
    expect(items[1].classList).toContain('regla--cumple');
    expect(items[2].textContent).toContain('Distinta de tu correo');
  });

  it('«contraseña común» aparece neutra («Se comprueba al enviar») si no está en la muestra', async () => {
    await con('Valle-de-Lurin-2026');
    const comun = Array.from(
      fixture.nativeElement.querySelectorAll('li') as NodeListOf<HTMLElement>,
    ).at(-1)!;
    expect(comun.classList).toContain('regla--al-enviar');
    expect(comun.textContent).toContain('Se comprueba al enviar');
    expect(comun.textContent).not.toContain('pendiente');
    expect(comun.querySelector('.solo-lectores')?.textContent).toContain('se comprueba al enviar');
    expect(comun.querySelector('app-icono')?.getAttribute('aria-hidden')).toBe('true');

    await con('Password123');
    const marcada = Array.from(
      fixture.nativeElement.querySelectorAll('li') as NodeListOf<HTMLElement>,
    ).at(-1)!;
    expect(marcada.classList).toContain('regla--pendiente');
    expect(marcada.textContent).toContain('pendiente');
    expect(marcada.textContent).not.toContain('Se comprueba al enviar');
  });

  it('marca como pendiente la contraseña igual a la parte local del correo', async () => {
    await con('juanperez2024', 'juanperez2024@correo.test');
    const correo = query(fixture, '.regla--pendiente');
    expect(correo.textContent).toContain('Distinta de tu correo');
    expect(nivel().textContent).toContain('Débil');
  });
});
