import { ComponentFixture } from '@angular/core/testing';

/** Ayudantes de DOM para pruebas de componentes. */

export function texto(fixture: ComponentFixture<unknown>): string {
  return (fixture.nativeElement as HTMLElement).textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

export function botones(fixture: ComponentFixture<unknown>): HTMLButtonElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
}

export function boton(
  fixture: ComponentFixture<unknown>,
  etiqueta: string | RegExp,
): HTMLButtonElement | undefined {
  return botones(fixture).find((b) => {
    const t = b.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return typeof etiqueta === 'string' ? t === etiqueta : etiqueta.test(t);
  });
}

export function enlaces(fixture: ComponentFixture<unknown>): HTMLAnchorElement[] {
  return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('a'));
}

export function enlace(
  fixture: ComponentFixture<unknown>,
  etiqueta: string | RegExp,
): HTMLAnchorElement | undefined {
  return enlaces(fixture).find((a) => {
    const t = a.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return typeof etiqueta === 'string' ? t === etiqueta : etiqueta.test(t);
  });
}

export function escribir(input: HTMLInputElement, valor: string): void {
  input.value = valor;
  input.dispatchEvent(new Event('input'));
}

export function elegir(select: HTMLSelectElement, valor: string): void {
  select.value = valor;
  select.dispatchEvent(new Event('change'));
}

export function marcar(casilla: HTMLInputElement, valor = true): void {
  if (casilla.checked !== valor) casilla.click();
}

export function query<T extends Element = HTMLElement>(
  fixture: ComponentFixture<unknown>,
  selector: string,
): T {
  const el = (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
  if (!el) throw new Error(`No se encontró ${selector}`);
  return el;
}
