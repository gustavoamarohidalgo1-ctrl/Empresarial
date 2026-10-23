import { TestBed } from '@angular/core/testing';
import { IconoComponent, cargarIconos, esIconoBase } from './icono';
import { ICONOS, NOMBRES_ICONOS, NombreIcono } from './iconos';
import { ICONOS_BASE } from './iconos-base';

describe('IconoComponent', () => {
  async function crear(entradas: Record<string, unknown>) {
    const fixture = TestBed.createComponent(IconoComponent);
    for (const [k, v] of Object.entries(entradas)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('pinta el trazo del registro con currentColor y trazo de 1.75', async () => {
    const host = await crear({ nombre: 'clock' });
    const svg = host.querySelector('svg')!;
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24');
    expect(svg.getAttribute('stroke')).toBe('currentColor');
    expect(svg.getAttribute('stroke-width')).toBe('1.75');
    expect(host.querySelector('path')!.getAttribute('d')).toBe(ICONOS.clock);
  });

  it('es decorativo por defecto (aria-hidden, sin rol)', async () => {
    const host = await crear({ nombre: 'info' });
    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.getAttribute('role')).toBeNull();
    expect(host.textContent).toBe('');
  });

  it('con etiqueta se expone como imagen con nombre accesible', async () => {
    const host = await crear({ nombre: 'alert-triangle', etiqueta: 'Advertencia' });
    expect(host.getAttribute('aria-hidden')).toBeNull();
    expect(host.getAttribute('role')).toBe('img');
    expect(host.getAttribute('aria-label')).toBe('Advertencia');
  });

  it('acepta tamaño en px o como longitud CSS', async () => {
    expect((await crear({ nombre: 'x', tamano: 16 })).style.width).toBe('16px');
    expect((await crear({ nombre: 'x', tamano: '1.5rem' })).style.height).toBe('1.5rem');
    expect((await crear({ nombre: 'x' })).style.width).toBe('');
  });

  it('el registro tiene unas 35 rutas, incluidas las de estados y navegación', () => {
    const requeridos: NombreIcono[] = [
      'clock',
      'check-circle',
      'map-pin',
      'hourglass',
      'stethoscope',
      'check-check',
      'x-circle',
      'user-x',
      'calendar',
      'user',
      'layout-dashboard',
      'menu',
      'x',
      'log-out',
      'sun',
      'moon',
      'monitor',
    ];
    expect(NOMBRES_ICONOS.length).toBeGreaterThanOrEqual(35);
    for (const nombre of requeridos) expect(ICONOS[nombre]).toMatch(/^M/);
    // Ninguna ruta empieza con «m» relativo: al concatenar trazos cambiaría de posición.
    for (const d of Object.values(ICONOS)) expect(d.startsWith('M')).toBe(true);
  });

  describe('registro en dos niveles', () => {
    it('la base (bundle inicial) es parte del registro completo, con los mismos trazos', () => {
      for (const [nombre, d] of Object.entries(ICONOS_BASE)) {
        expect(ICONOS[nombre as NombreIcono]).toBe(d);
      }
      expect(Object.keys(ICONOS_BASE).length).toBeLessThan(NOMBRES_ICONOS.length / 2);
    });

    it('la base cubre los iconos del primer render: marco, pie, cabecera (todos los roles) y avisos', () => {
      const primerRender = [
        // app.html: franja de entorno, pie
        'info',
        'clock',
        // cabecera: botón de menú, chip, invitado y enlaces de cada rol
        'menu',
        'x',
        'chevron-down',
        'log-in',
        'user-plus',
        'calendar',
        'calendar-plus',
        'bell',
        'user',
        'layout-dashboard',
        'chart-column',
        'file-text',
        // app-aviso
        'check-circle',
        'alert-circle',
        'alert-triangle',
      ];
      for (const nombre of primerRender) expect(esIconoBase(nombre)).toBe(true);
      expect(esIconoBase('stethoscope')).toBe(false);
    });

    it('un icono fuera de la base se pinta al cargar el registro completo, sin cambiar su caja', async () => {
      const host = await crear({ nombre: 'stethoscope', tamano: 16 });
      expect(host.style.width).toBe('16px');
      expect(host.querySelector('path')!.getAttribute('d')).toBe(ICONOS.stethoscope);
    });

    it('cargarIconos es idempotente', async () => {
      await Promise.all([cargarIconos(), cargarIconos()]);
      const host = await crear({ nombre: 'copy' });
      expect(host.querySelector('path')!.getAttribute('d')).toBe(ICONOS.copy);
    });
  });
});
