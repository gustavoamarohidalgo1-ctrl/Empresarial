import { TestBed } from '@angular/core/testing';
import { CacheService } from '../../../../core/cache/cache.service';
import { citaDetalle } from '../../../../../testing/datos-prueba';
import { texto } from '../../../../../testing/dom';
import { claveCita, registrarAccionEnCache } from '../cita-cache';
import { ResumenCitaComponent } from './resumen-cita';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('ResumenCitaComponent', () => {
  it('muestra fecha, horario de Lima y datos clave con su etiqueta para lectores', async () => {
    const fixture = TestBed.createComponent(ResumenCitaComponent);
    fixture.componentRef.setInput('cita', citaDetalle());
    await fixture.whenStable();
    const t = texto(fixture);
    // 14:00Z = 09:00 en Lima, sin importar la zona del navegador.
    expect(t).toContain('09:00 – a 09:20 (hora de Lima)');
    expect(t).toContain('Especialidad: Medicina general');
    expect(t).toContain('Profesional: Profesional P01');
    expect(t).toContain('Sede: Sede de prueba Surco');
    const ficha = fixture.nativeElement.querySelector('app-ficha-fecha time') as HTMLElement;
    expect(ficha.getAttribute('datetime')).toBe('2026-11-04');
  });
});

describe('registrarAccionEnCache', () => {
  let cache: CacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    cache = TestBed.inject(CacheService);
    cache.guardar('citas:proximas', []);
    cache.guardar('citas:historial', []);
    cache.guardar('cita:c-1:linea-tiempo', []);
    cache.guardar('perfil', { nombres: 'Ana' });
  });

  it('guarda la cita devuelta e invalida las listas y la línea de tiempo', () => {
    const cita = citaDetalle({ versionAgenda: 9 });
    registrarAccionEnCache(cache, 'c-1', cita);
    expect(cache.leer(claveCita('c-1'))).toBe(cita);
    expect(cache.leer('citas:proximas')).toBeUndefined();
    expect(cache.leer('citas:historial')).toBeUndefined();
    expect(cache.leer('cita:c-1:linea-tiempo')).toBeUndefined();
    // No toca lo que no depende de la cita.
    expect(cache.leer('perfil')).toEqual({ nombres: 'Ana' });
  });

  it('sin la cita devuelta (respuesta perdida) invalida también el detalle', () => {
    cache.guardar(claveCita('c-1'), citaDetalle());
    registrarAccionEnCache(cache, 'c-1', null);
    expect(cache.leer(claveCita('c-1'))).toBeUndefined();
    expect(cache.leer('citas:proximas')).toBeUndefined();
  });
});
