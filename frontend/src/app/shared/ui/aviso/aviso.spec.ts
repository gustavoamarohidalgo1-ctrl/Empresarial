import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TipoAviso } from '../../../core/avisos/aviso-flash.service';
import { ICONOS } from '../icono/iconos';
import { AvisoComponent } from './aviso';

@Component({
  imports: [AvisoComponent],
  template: `
    <app-aviso [tipo]="tipo" [titulo]="titulo" [vivo]="vivo">
      <p>Tu cita fue confirmada.</p>
      <div class="acciones"><button type="button" class="btn">Ver detalle</button></div>
    </app-aviso>
  `,
})
class Anfitrion {
  tipo: TipoAviso = 'exito';
  titulo: string | null = null;
  vivo: 'polite' | 'assertive' | null = null;
}

describe('AvisoComponent', () => {
  async function crear(cambios: Partial<Anfitrion> = {}) {
    const fixture = TestBed.createComponent(Anfitrion);
    Object.assign(fixture.componentInstance, cambios);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('conserva las clases por tipo y proyecta texto y acciones', async () => {
    const raiz = await crear();
    const aviso = raiz.querySelector('.aviso')!;
    expect(aviso.classList).toContain('aviso--exito');
    expect(aviso.textContent).toContain('Tu cita fue confirmada.');
    expect(aviso.querySelector('.acciones button')).toBeTruthy();
    expect(aviso.getAttribute('role')).toBeNull();
  });

  it('sin título anuncia el tipo con un prefijo oculto', async () => {
    const raiz = await crear({ tipo: 'error' });
    expect(raiz.querySelector('.solo-lectores')?.textContent).toContain('Error:');
    expect(raiz.querySelector('.aviso__titulo')).toBeNull();
  });

  it('con título lo muestra y omite el prefijo', async () => {
    const raiz = await crear({ tipo: 'advertencia', titulo: 'Resultado sin confirmar' });
    expect(raiz.querySelector('.aviso__titulo')?.textContent).toContain('Resultado sin confirmar');
    expect(raiz.querySelector('.solo-lectores')).toBeNull();
  });

  it('pone un icono decorativo según el tipo', async () => {
    const esperado: Record<TipoAviso, keyof typeof ICONOS> = {
      exito: 'check-circle',
      error: 'alert-circle',
      advertencia: 'alert-triangle',
      info: 'info',
    };
    for (const tipo of Object.keys(esperado) as TipoAviso[]) {
      const icono = (await crear({ tipo })).querySelector('app-icono.aviso__icono')!;
      expect(icono.getAttribute('aria-hidden')).toBe('true');
      expect(icono.querySelector('path')?.getAttribute('d')).toBe(ICONOS[esperado[tipo]]);
    }
  });

  it('región viva opcional: polite → status, assertive → alert', async () => {
    expect((await crear({ vivo: 'polite' })).querySelector('.aviso')?.getAttribute('role')).toBe(
      'status',
    );
    expect((await crear({ vivo: 'assertive' })).querySelector('.aviso')?.getAttribute('role')).toBe(
      'alert',
    );
  });
});
