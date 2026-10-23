import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { EncabezadoPaginaComponent, Miga } from './encabezado-pagina';

@Component({
  imports: [EncabezadoPaginaComponent],
  template: `
    <app-encabezado-pagina
      titulo="Detalle de cita"
      [subtitulo]="subtitulo"
      [migas]="migas"
      tituloId="titulo-detalle"
    >
      <span junto-al-titulo class="insignia">Pendiente</span>
      <a acciones class="btn" href="/x">Reprogramar</a>
    </app-encabezado-pagina>
  `,
})
class Anfitrion {
  subtitulo: string | null = 'Fechas y horas en hora de Lima';
  migas: Miga[] = [{ texto: 'Mis citas', ruta: '/paciente/citas' }, { texto: 'CIT001' }];
}

describe('EncabezadoPaginaComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([])] }));

  async function crear(cambios: Partial<Anfitrion> = {}) {
    const fixture = TestBed.createComponent(Anfitrion);
    Object.assign(fixture.componentInstance, cambios);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el h1 con id, el subtítulo y las ranuras', async () => {
    const raiz = await crear();
    const h1 = raiz.querySelector('h1')!;
    expect(h1.textContent?.trim()).toBe('Detalle de cita');
    expect(h1.id).toBe('titulo-detalle');
    expect(raiz.querySelector('.ep__subtitulo')?.textContent).toContain('hora de Lima');
    expect(raiz.querySelector('.ep__titulo-fila .insignia')).toBeTruthy();
    expect(raiz.querySelector('.ep__acciones a')?.textContent).toContain('Reprogramar');
  });

  it('las migas enlazan los pasos previos y marcan la página actual', async () => {
    const raiz = await crear();
    const nav = raiz.querySelector('nav')!;
    expect(nav.getAttribute('aria-label')).toBe('Migas de pan');
    const enlaces = Array.from(nav.querySelectorAll('a'));
    expect(enlaces.map((a) => a.textContent?.trim())).toEqual(['Mis citas']);
    expect(enlaces[0].getAttribute('href')).toBe('/paciente/citas');
    const actual = nav.querySelector('[aria-current="page"]');
    expect(actual?.textContent?.trim()).toBe('CIT001');
  });

  it('sin migas ni subtítulo no deja elementos vacíos', async () => {
    const raiz = await crear({ migas: [], subtitulo: null });
    expect(raiz.querySelector('nav')).toBeNull();
    expect(raiz.querySelector('.ep__subtitulo')).toBeNull();
  });
});
