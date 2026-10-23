import { TestBed } from '@angular/core/testing';
import { MarcaComponent } from './marca';

describe('MarcaComponent', () => {
  async function crear(entradas: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(MarcaComponent);
    for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('muestra el isotipo decorativo y el nombre', async () => {
    const host = await crear();
    expect(host.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(host.textContent?.trim()).toBe('SIGA-SP');
    expect(host.classList).toContain('marca--md');
  });

  it('admite subtítulo, tamaño y solo isotipo', async () => {
    const conSubtitulo = await crear({ subtitulo: 'Atención ambulatoria', tamano: 'lg' });
    expect(conSubtitulo.textContent).toContain('Atención ambulatoria');
    expect(conSubtitulo.classList).toContain('marca--lg');
    const soloIsotipo = await crear({ conTexto: false });
    expect(soloIsotipo.textContent?.trim()).toBe('');
    expect(soloIsotipo.querySelector('svg')).toBeTruthy();
  });
});
