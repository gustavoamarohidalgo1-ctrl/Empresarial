import { ComponentFixture, TestBed } from '@angular/core/testing';
import { resumenIndicadores } from '../../../../testing/indicadores-prueba';
import { construirTarjetas, tarjetasCargando } from '../modelo/tarjetas';
import { DatosIndicador, TarjetaIndicadorComponent } from './tarjeta-indicador';

const normalizar = (t: string | null | undefined) =>
  (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

describe('TarjetaIndicadorComponent', () => {
  let fixture: ComponentFixture<TarjetaIndicadorComponent>;
  let host: HTMLElement;

  async function crear(datos: DatosIndicador, cargando = false) {
    fixture = TestBed.createComponent(TarjetaIndicadorComponent);
    fixture.componentRef.setInput('datos', datos);
    fixture.componentRef.setInput('cargando', cargando);
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  }

  it('muestra nombre (h3), valor grande, numerador/denominador y medidor decorativo', async () => {
    await crear(construirTarjetas(resumenIndicadores())[0]);
    const article = host.querySelector('article')!;
    const titulo = host.querySelector('h3')!;
    expect(article.getAttribute('aria-labelledby')).toBe(titulo.id);
    expect(titulo.textContent?.trim()).toBe('Confirmación');
    expect(normalizar(host.querySelector('.ti__valor')?.textContent)).toBe('50.0 %');
    expect(host.querySelector('.ti__detalle')?.textContent?.trim()).toBe('60 de 120 citas');
    expect(host.querySelector('.ti__medidor')?.getAttribute('aria-hidden')).toBe('true');
    expect((host.querySelector('.ti__relleno') as HTMLElement).style.inlineSize).toBe('50%');
    expect(host.querySelector('.ti__provisional')).toBeNull();
  });

  it('«No calculable» se muestra como texto, sin medidor', async () => {
    const r = resumenIndicadores();
    r.indicadores.cancelacion = { numerador: 0, denominador: 0, tasa: null };
    await crear(construirTarjetas(r)[1]);
    expect(host.querySelector('.ti__valor')?.classList).toContain('ti__valor--nc');
    expect(host.querySelector('.ti__valor')?.textContent?.trim()).toBe('No calculable');
    expect(host.querySelector('.ti__relleno')).toBeNull();
    expect(host.querySelector('.ti__nota')?.textContent).toContain('No hay citas');
  });

  it('la inasistencia provisional lleva distintivo con icono y su explicación visible', async () => {
    const r = resumenIndicadores();
    r.indicadores.inasistencia.provisional = true;
    r.indicadores.inasistencia.pendientesDeClasificar = 2;
    await crear(construirTarjetas(r)[3]);
    const provisional = host.querySelector('.ti__provisional')!;
    expect(normalizar(provisional.querySelector('.ti__insignia')?.textContent)).toBe('Provisional');
    expect(provisional.querySelector('app-icono')).not.toBeNull();
    expect(provisional.textContent).toContain('2 citas vencidas pendientes de clasificar');
  });

  it('mientras carga conserva el título y reserva la caja con esqueletos', async () => {
    await crear(tarjetasCargando()[4], true);
    expect(host.querySelector('h3')?.textContent?.trim()).toBe('Espera promedio');
    expect(host.querySelectorAll('app-esqueleto')).toHaveLength(2);
    expect(host.querySelector('.ti__medidor')).not.toBeNull();
  });
});
