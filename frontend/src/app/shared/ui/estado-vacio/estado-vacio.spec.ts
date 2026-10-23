import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EstadoVacioComponent, IlustracionVacio } from './estado-vacio';

@Component({
  imports: [EstadoVacioComponent],
  template: `
    <app-estado-vacio [titulo]="titulo" [texto]="texto" [ilustracion]="ilustracion" [nivel]="nivel">
      <p class="extra">Texto adicional</p>
      <button acciones type="button" class="btn">Reintentar</button>
    </app-estado-vacio>
  `,
})
class Anfitrion {
  titulo = 'No tienes citas próximas';
  texto: string | null = 'Cuando tengas una cita registrada, aparecerá aquí.';
  ilustracion: IlustracionVacio = 'calendario';
  nivel: 2 | 3 = 2;
}

describe('EstadoVacioComponent', () => {
  async function crear(cambios: Partial<Anfitrion> = {}) {
    const fixture = TestBed.createComponent(Anfitrion);
    Object.assign(fixture.componentInstance, cambios);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra título (h2), texto, contenido extra y acciones', async () => {
    const raiz = await crear();
    expect(raiz.querySelector('h2')?.textContent?.trim()).toBe('No tienes citas próximas');
    expect(raiz.textContent).toContain('Cuando tengas una cita registrada');
    expect(raiz.querySelector('.extra')).toBeTruthy();
    expect(raiz.querySelector('.vacio__acciones button')?.textContent).toContain('Reintentar');
  });

  it('la ilustración es decorativa y se puede omitir', async () => {
    for (const ilustracion of ['calendario', 'historial', 'busqueda', 'error'] as const) {
      const raiz = await crear({ ilustracion });
      const svg = raiz.querySelector('svg.vacio__ilustracion');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(svg?.querySelectorAll('*').length).toBeGreaterThan(2);
    }
    expect((await crear({ ilustracion: 'ninguna' })).querySelector('svg')).toBeNull();
  });

  it('admite nivel 3 y omite el párrafo si no hay texto', async () => {
    const raiz = await crear({ nivel: 3, texto: null });
    expect(raiz.querySelector('h3')).toBeTruthy();
    expect(raiz.querySelector('h2')).toBeNull();
    expect(raiz.querySelector('.vacio__texto')).toBeNull();
  });
});
