import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { CacheService } from '../../../core/cache/cache.service';
import { CitaResumen } from '../../../core/modelos/contrato';
import { citaResumen, opcionesProblema, problema } from '../../../../testing/datos-prueba';
import { boton, enlace, query, texto } from '../../../../testing/dom';
import { MisCitasComponent } from './mis-citas';

describe('MisCitasComponent', () => {
  let fixture: ComponentFixture<MisCitasComponent>;
  let http: HttpTestingController;

  const CIT002 = citaResumen({
    id: 'c-2',
    codigo: 'CIT002',
    estado: 'CONFIRMADA',
    estadoEtiqueta: 'Confirmada',
    inicio: '2026-11-06T16:00:00Z',
    fin: '2026-11-06T16:20:00Z',
    especialidad: { codigo: 'DER', nombre: 'Dermatología' },
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [MisCitasComponent],
      providers: [
        provideRouter([{ path: 'paciente/citas', component: MisCitasComponent }]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function crear(): Promise<void> {
    fixture = TestBed.createComponent(MisCitasComponent);
    await fixture.whenStable();
  }

  function solicitud(alcance: string) {
    return http.expectOne(
      (r) => r.url === '/api/v1/pacientes/me/citas' && r.params.get('alcance') === alcance,
    );
  }

  async function responder(alcance: string, citas: CitaResumen[]): Promise<void> {
    solicitud(alcance).flush(citas);
    await fixture.whenStable();
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Fija «ahora» (solo Date) para que la cuenta regresiva sea determinista. */
  function fijarAhora(iso: string): void {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(iso));
  }

  it('muestra esqueletos con aria-busy y luego la próxima cita y la lista', async () => {
    await crear();
    expect(texto(fixture)).toContain('Cargando tus citas');
    expect(query(fixture, '#panel-citas').getAttribute('aria-busy')).toBe('true');
    // Esqueletos con la caja final (3 tarjetas + la destacada), ocultos a lectores.
    expect(el().querySelectorAll('#panel-citas .rejilla app-tarjeta-cita').length).toBe(3);
    expect(el().querySelector('app-proxima-cita [aria-hidden="true"].proxima')).toBeTruthy();

    await responder('proximas', [CIT002, citaResumen()]);

    const contenido = texto(fixture);
    expect(query(fixture, '#panel-citas').getAttribute('aria-busy')).toBe('false');
    expect(contenido).toContain('CIT001');
    expect(contenido).toContain('Miércoles, 4 de noviembre de 2026');
    expect(contenido).toContain('09:00 a 09:20');
    expect(contenido).toContain('Medicina general');
    expect(contenido).toContain('Profesional P01');
    expect(contenido).toContain('Sede de prueba Surco');
    // El estado se muestra con texto, no solo con color.
    expect(contenido).toContain('Pendiente');
    expect(contenido).toContain('Confirmada');
    expect(contenido).toContain('Se muestran 2 citas próximas.');
    expect(enlace(fixture, /Ver detalle.*CIT002/)?.getAttribute('href')).toBe(
      '/paciente/citas/c-2',
    );
  });

  it('destaca la próxima cita activa con «Ver y gestionar» y la saca de la lista', async () => {
    await crear();
    await responder('proximas', [
      CIT002,
      citaResumen({
        id: 'c-0',
        codigo: 'CIT000',
        estado: 'CANCELADA',
        estadoEtiqueta: 'Cancelada',
        inicio: '2026-11-02T14:00:00Z',
      }),
      citaResumen(),
    ]);

    const destacada = query(fixture, 'app-proxima-cita');
    expect(destacada.textContent).toContain('Tu próxima cita');
    // La cancelada, aunque sea anterior, no es «la próxima».
    expect(destacada.textContent).toContain('CIT001');
    expect(destacada.textContent).not.toContain('CIT000');
    expect(enlace(fixture, /Ver y gestionar.*CIT001/)?.getAttribute('href')).toBe(
      '/paciente/citas/c-1',
    );
    expect(destacada.textContent).toContain('Aún no confirmas tu asistencia');

    const panel = query(fixture, '#panel-citas');
    expect(panel.textContent).toContain('Más adelante');
    expect(panel.querySelectorAll('app-tarjeta-cita').length).toBe(2);
    expect(enlace(fixture, /Ver detalle.*CIT001/)).toBeUndefined();
    // La lista va de la más cercana a la más lejana.
    const titulos = Array.from(panel.querySelectorAll('h3')).map((h) => h.textContent?.trim());
    expect(titulos).toEqual(['Medicina general', 'Dermatología']);
  });

  it('muestra la cuenta regresiva legible en hora de Lima', async () => {
    fijarAhora('2026-11-01T15:00:00Z'); // 1 nov, 10:00 en Lima
    await crear();
    await responder('proximas', [citaResumen(), CIT002]);
    expect(query(fixture, 'app-proxima-cita .cuenta').textContent?.trim()).toBe('En 3 días');
    expect(query(fixture, '.cita__cuenta').textContent).toContain('en 5 días');
  });

  it('una cita de hoy dice «Hoy a las 09:00» y se resalta', async () => {
    fijarAhora('2026-11-04T12:00:00Z'); // 07:00 en Lima, mismo día
    await crear();
    await responder('proximas', [citaResumen()]);
    const cuenta = query(fixture, 'app-proxima-cita .cuenta');
    expect(cuenta.textContent?.trim()).toBe('Hoy a las 09:00');
    expect(cuenta.classList.contains('cuenta--hoy')).toBe(true);
  });

  it('con una sola próxima cita, la lista explica que no hay otras', async () => {
    await crear();
    await responder('proximas', [citaResumen()]);
    expect(texto(fixture)).toContain('No tienes otras citas programadas por ahora.');
    expect(texto(fixture)).toContain('Se muestra 1 cita próxima.');
  });

  it('muestra un estado vacío ilustrado que lleva al historial', async () => {
    await crear();
    await responder('proximas', []);
    expect(texto(fixture)).toContain('No tienes citas próximas');
    expect(el().querySelector('app-proxima-cita')).toBeNull();
    expect(el().querySelector('app-estado-vacio svg')).toBeTruthy();
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    boton(fixture, 'Ver mi historial')!.click();
    expect(navegar.mock.calls[0][1]?.queryParams).toEqual({ alcance: 'historial' });
    await fixture.whenStable();
    await responder('historial', []);
    expect(texto(fixture)).toContain('Aún no tienes citas en tu historial');
  });

  it('ofrece «Reservar cita» como acción principal en el encabezado y en el estado vacío', async () => {
    await crear();
    const enEncabezado = el().querySelector<HTMLAnchorElement>(
      'app-encabezado-pagina a.btn--primario',
    )!;
    expect(enEncabezado.textContent!.trim()).toBe('Reservar cita');
    expect(enEncabezado.getAttribute('href')).toBe('/paciente/reservar');

    await responder('proximas', []);
    const enVacio = el().querySelector<HTMLAnchorElement>('app-estado-vacio a.btn--primario')!;
    expect(enVacio.textContent!.trim()).toBe('Reservar cita');
    expect(enVacio.getAttribute('href')).toBe('/paciente/reservar');
    expect(boton(fixture, 'Ver mi historial')).toBeTruthy();
  });

  it('muestra el error con un botón de reintento', async () => {
    await crear();
    solicitud('proximas').flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No pudimos cargar tus citas');
    expect(el().querySelector('[role="alert"] app-estado-vacio')).toBeTruthy();
    boton(fixture, 'Reintentar')!.click();
    await fixture.whenStable();
    await responder('proximas', [citaResumen()]);
    expect(texto(fixture)).toContain('CIT001');
  });

  it('la pestaña Historial consulta alcance=historial', async () => {
    await crear();
    await responder('proximas', []);
    const router = TestBed.inject(Router);
    const navegar = vi.spyOn(router, 'navigate');
    const pestanaHistorial = query<HTMLButtonElement>(fixture, '#pestana-historial');
    expect(pestanaHistorial.getAttribute('aria-selected')).toBe('false');
    pestanaHistorial.click();
    expect(navegar).toHaveBeenCalled();
    expect(navegar.mock.calls[0][1]?.queryParams).toEqual({ alcance: 'historial' });
    await fixture.whenStable();
    await responder('historial', [
      citaResumen({ estado: 'COMPLETADA', estadoEtiqueta: 'Completada' }),
    ]);
    expect(query(fixture, '#pestana-historial').getAttribute('aria-selected')).toBe('true');
    expect(texto(fixture)).toContain('Completada');
    expect(texto(fixture)).toContain('Citas anteriores');
    expect(texto(fixture)).toContain('Se muestra 1 cita del historial.');
  });

  it('las flechas cambian de pestaña y mueven el foco (patrón tablist)', async () => {
    await crear();
    await responder('proximas', []);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate');
    const proximas = query<HTMLButtonElement>(fixture, '#pestana-proximas');
    document.body.appendChild(el());
    proximas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(navegar.mock.calls[0][1]?.queryParams).toEqual({ alcance: 'historial' });
    expect(document.activeElement?.id).toBe('pestana-historial');
    el().remove();
    await fixture.whenStable();
    await responder('historial', []);
  });

  it('al entrar por Historial también carga la próxima cita para la tarjeta destacada', async () => {
    await TestBed.inject(Router).navigateByUrl('/paciente/citas?alcance=historial');
    await crear();
    await responder('historial', [
      citaResumen({
        id: 'c-9',
        codigo: 'CIT009',
        estado: 'COMPLETADA',
        estadoEtiqueta: 'Completada',
      }),
    ]);
    await responder('proximas', [citaResumen()]);
    expect(query(fixture, 'app-proxima-cita').textContent).toContain('CIT001');
    expect(query(fixture, '#panel-citas').textContent).toContain('CIT009');
    // La carga de fondo de Próximas no cambia lo anunciado para el Historial.
    expect(texto(fixture)).toContain('Se muestra 1 cita del historial.');
  });

  describe('stale-while-revalidate', () => {
    it('al volver muestra lo guardado al instante y lo actualiza en segundo plano', async () => {
      await crear();
      await responder('proximas', [citaResumen()]);
      fixture.destroy();

      await crear();
      // Sin esqueleto: los datos guardados se pintan de inmediato.
      expect(query(fixture, '#panel-citas').getAttribute('aria-busy')).toBe('false');
      expect(texto(fixture)).not.toContain('Cargando tus citas');
      expect(query(fixture, 'app-proxima-cita').textContent).toContain('CIT001');
      expect(texto(fixture)).toContain('Se muestra 1 cita próxima.');

      await responder('proximas', [citaResumen(), CIT002]);
      expect(enlace(fixture, /Ver detalle.*CIT002/)).toBeTruthy();
      // La revalidación silenciosa no anuncia nada nuevo.
      expect(texto(fixture)).toContain('Se muestra 1 cita próxima.');
      expect(TestBed.inject(CacheService).leer<CitaResumen[]>('citas:proximas')?.length).toBe(2);
    });

    it('si la revalidación falla, conserva los datos y lo indica sin pantalla de error', async () => {
      await crear();
      await responder('proximas', [citaResumen()]);
      fixture.destroy();

      await crear();
      solicitud('proximas').flush(problema(503, 'ERROR_INTERNO'), opcionesProblema(503));
      await fixture.whenStable();
      expect(texto(fixture)).toContain('Mostramos lo último que cargamos');
      expect(texto(fixture)).toContain('CIT001');
      expect(texto(fixture)).not.toContain('No pudimos cargar tus citas');

      boton(fixture, 'Volver a intentar')!.click();
      await fixture.whenStable();
      await responder('proximas', [citaResumen()]);
      expect(texto(fixture)).not.toContain('Mostramos lo último que cargamos');
    });
  });
});
