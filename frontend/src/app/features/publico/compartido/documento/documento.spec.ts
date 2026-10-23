import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { enlaces, query } from '../../../../../testing/dom';
import { DocumentoComponent } from './documento';

@Component({
  imports: [DocumentoComponent],
  template: `
    <app-documento
      titulo="Título"
      antetitulo="Antetítulo"
      resumen="Resumen"
      actualizado="23 de octubre de 2026"
      [indice]="[
        { id: 'sec-a', texto: 'Sección A' },
        { id: 'sec-b', texto: 'Sección B' },
      ]"
    >
      <section aria-labelledby="sec-a"><h2 id="sec-a" tabindex="-1">A</h2></section>
      <section aria-labelledby="sec-b"><h2 id="sec-b" tabindex="-1">B</h2></section>
    </app-documento>
  `,
})
class Anfitrion {}

@Component({
  imports: [DocumentoComponent],
  template: `
    <app-documento
      titulo="Política"
      [version]="{ numero: '2.1', vigenteDesde: '1 de enero de 2027' }"
    />
  `,
})
class AnfitrionConVersion {}

describe('DocumentoComponent', () => {
  let fixture: ComponentFixture<Anfitrion>;

  beforeEach(async () => {
    fixture = TestBed.createComponent(Anfitrion);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('pinta el encabezado con la fecha de actualización y un índice navegable', () => {
    expect(query(fixture, 'h1').textContent?.trim()).toBe('Título');
    expect(query(fixture, '.doc__meta').textContent).toContain(
      'Última actualización: 23 de octubre de 2026',
    );
    const indice = query(fixture, 'nav.doc__indice');
    expect(indice.getAttribute('aria-labelledby')).toBe('doc-indice-titulo');
    expect(enlaces(fixture).map((a) => a.getAttribute('href'))).toEqual(['#sec-a', '#sec-b']);
  });

  it('el índice lleva el foco a la sección sin navegar', () => {
    const enlace = enlaces(fixture)[1];
    const evento = new MouseEvent('click', { bubbles: true, cancelable: true });
    enlace.dispatchEvent(evento);
    expect(evento.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('sec-b');
  });

  it('con versión, muestra «Versión N · vigente desde el …» en lugar de la fecha', async () => {
    const conVersion = TestBed.createComponent(AnfitrionConVersion);
    await conVersion.whenStable();
    const meta = query(conVersion, '.doc__meta').textContent!.replace(/\s+/g, ' ').trim();
    expect(meta).toBe('Versión 2.1 · vigente desde el 1 de enero de 2027');
    expect(meta).not.toContain('Última actualización');
  });
});
