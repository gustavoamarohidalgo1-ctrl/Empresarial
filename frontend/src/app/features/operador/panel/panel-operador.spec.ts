import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CacheService } from '../../../core/cache/cache.service';
import { CABECERA_IDEMPOTENCIA } from '../../../core/idempotencia/idempotencia.service';
import { hoyEnLima } from '../../../shared/utils/fecha-lima';
import {
  UUID_V4,
  adjuntar,
  citaOperador,
  opcionesProblema,
  operacion,
  problema,
} from '../../../../testing/datos-prueba';
import { boton, query, texto } from '../../../../testing/dom';
import {
  INTERVALO_AUTO_MS,
  INTERVALO_RELOJ_MS,
  ListaDia,
  MENSAJE_CITA_CAMBIO,
  PanelOperadorComponent,
  claveListaOperador,
} from './panel-operador';

const TRANSICION = '/api/v1/operador/citas/c-1/transiciones';
const LISTA = '/api/v1/operador/citas';

function configurar() {
  TestBed.configureTestingModule({
    imports: [PanelOperadorComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(HttpTestingController);
}

function solicitudDelDia(http: HttpTestingController, fecha: string) {
  return http.expectOne((r) => r.url === LISTA && r.params.get('fecha') === fecha);
}

const enEspera = () =>
  citaOperador({
    estado: 'EN_ESPERA',
    estadoEtiqueta: 'En espera',
    versionCita: 8,
    accionesPermitidas: ['INICIAR_ATENCION'],
  });

const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** Fila (tabla) o tarjeta (móvil) de una cita, por su código. */
function fila(fixture: ComponentFixture<unknown>, codigo: string): HTMLElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector(`tr[data-cita="${codigo}"]`);
}

/** Texto de la píldora de estado de una cita («Estado: En espera»). */
function estadoDe(fixture: ComponentFixture<unknown>, codigo: string): string {
  return normalizar(fila(fixture, codigo)?.querySelector('app-estado-cita')?.textContent);
}

function chip(fixture: ComponentFixture<unknown>, etiqueta: string): HTMLButtonElement {
  const chips = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button.chip'),
  );
  const encontrado = chips.find((c) => normalizar(c.textContent).startsWith(etiqueta));
  if (!encontrado) throw new Error(`No se encontró el chip ${etiqueta}`);
  return encontrado;
}

/** Simula `document.hidden` (pestaña oculta o visible). */
function fijarPestanaOculta(oculta: boolean): void {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => oculta });
}

function restaurarPestana(): void {
  delete (document as { hidden?: boolean }).hidden;
}

describe('PanelOperadorComponent', () => {
  let fixture: ComponentFixture<PanelOperadorComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    http = configurar();
    fixture = TestBed.createComponent(PanelOperadorComponent);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  const citasDelDia = (fecha: string) => solicitudDelDia(http, fecha);
  const region = () => fixture.nativeElement.querySelector('.region-resultado') as HTMLElement;
  const anuncio = () =>
    normalizar(
      (fixture.nativeElement as HTMLElement).querySelector('p.solo-lectores[role="status"]')
        ?.textContent,
    );

  async function pulsarPasarAEspera() {
    citasDelDia(hoyEnLima()).flush([citaOperador()]);
    await fixture.whenStable();
    boton(fixture, /^Pasar a espera/)!.click();
    await fixture.whenStable();
  }

  it('consulta por defecto las citas de hoy en Lima y las muestra', async () => {
    expect(query<HTMLInputElement>(fixture, '#panel-fecha').value).toBe(hoyEnLima());
    citasDelDia(hoyEnLima()).flush([
      citaOperador(),
      citaOperador({
        id: 'c-3',
        codigo: 'CIT003',
        inicio: '2026-11-06T15:45:00Z',
        estado: 'CONFIRMADA',
        estadoEtiqueta: 'Confirmada',
        pacienteNombre: 'Luis Demo',
        accionesPermitidas: ['REGISTRAR_LLEGADA'],
        llegadaRegistradaEn: null,
      }),
    ]);
    await fixture.whenStable();
    const t = texto(fixture);
    expect(t).toContain('CIT001');
    expect(t).toContain('10:30');
    expect(t).toContain('Luis Demo');
    expect(t).toContain('Check-in');
    expect(t).toContain('Sin registro');
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: Check-in');
    expect(normalizar(fila(fixture, 'CIT001')!.querySelector('.cita__hora')!.textContent)).toBe(
      '10:30',
    );
    expect(fila(fixture, 'CIT003')!.textContent).toContain('Sin registro');
    expect(boton(fixture, /^Pasar a espera/)).toBeTruthy();
    expect(boton(fixture, /^Registrar llegada/)).toBeTruthy();
    // La acción principal de cada fila es un botón primario con el código para lectores.
    const principal = boton(fixture, /^Registrar llegada/)!;
    expect(principal.classList.contains('btn--primario')).toBe(true);
    expect(normalizar(principal.textContent)).toBe('Registrar llegada: CIT003, Luis Demo');
    // Marca de la última actualización (hora de Lima).
    expect(t).toMatch(/Actualizado a las \d{2}:\d{2}/);
  });

  it('mientras carga sin datos guardados muestra esqueletos y aria-busy', async () => {
    const lista = query(fixture, 'section.lista');
    expect(lista.getAttribute('aria-busy')).toBe('true');
    expect(texto(fixture)).toContain('Cargando las citas del día…');
    expect(fixture.nativeElement.querySelectorAll('app-tabla-citas-operador tr.cita').length).toBe(
      4,
    );
    expect(fixture.nativeElement.querySelectorAll('app-indicadores-dia app-esqueleto').length).toBe(
      10,
    );
    citasDelDia(hoyEnLima()).flush([citaOperador()]);
    await fixture.whenStable();
    expect(lista.getAttribute('aria-busy')).toBe('false');
    expect(fixture.nativeElement.querySelector('app-esqueleto')).toBeNull();
  });

  it('al cambiar la fecha consulta ese día', async () => {
    citasDelDia(hoyEnLima()).flush([]);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No hay citas para esta fecha');
    const input = query<HTMLInputElement>(fixture, '#panel-fecha');
    input.value = '2026-11-06';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    citasDelDia('2026-11-06').flush([]);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Citas del 06 nov 2026');
    expect(texto(fixture)).toContain('Viernes, 6 de noviembre de 2026');
  });

  it('«Día anterior» y «Día siguiente» consultan el día correspondiente', async () => {
    const input = query<HTMLInputElement>(fixture, '#panel-fecha');
    citasDelDia(hoyEnLima()).flush([]);
    input.value = '2026-11-06';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    citasDelDia('2026-11-06').flush([]);
    await fixture.whenStable();

    boton(fixture, 'Día siguiente')!.click();
    await fixture.whenStable();
    citasDelDia('2026-11-07').flush([]);
    await fixture.whenStable();
    expect(input.value).toBe('2026-11-07');

    boton(fixture, 'Día anterior')!.click();
    await fixture.whenStable();
    citasDelDia('2026-11-06').flush([]);
    await fixture.whenStable();
    expect(input.value).toBe('2026-11-06');
    expect(texto(fixture)).toContain('Citas del 06 nov 2026');
  });

  it('calcula los indicadores del día de la lista y filtra por estado con chips y conteo', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    citasDelDia(hoyEnLima()).flush([
      citaOperador(),
      citaOperador({
        id: 'c-2',
        codigo: 'CIT002',
        inicio: '2026-11-06T14:00:00Z',
        estado: 'COMPLETADA',
        estadoEtiqueta: 'Completada',
        accionesPermitidas: [],
      }),
      citaOperador({
        id: 'c-3',
        codigo: 'CIT003',
        inicio: '2026-11-06T16:00:00Z',
        estado: 'CONFIRMADA',
        estadoEtiqueta: 'Confirmada',
        accionesPermitidas: ['REGISTRAR_LLEGADA'],
        llegadaRegistradaEn: null,
      }),
      citaOperador({
        id: 'c-4',
        codigo: 'CIT004',
        inicio: '2026-11-06T16:30:00Z',
        estado: 'CANCELADA',
        estadoEtiqueta: 'Cancelada',
        accionesPermitidas: [],
        llegadaRegistradaEn: null,
      }),
    ]);
    await fixture.whenStable();

    const kpis = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-indicadores-dia li'),
    ).map((li) =>
      Array.from(li.querySelectorAll('p'))
        .map((p) => normalizar(p.textContent))
        .join(' '),
    );
    expect(kpis[0]).toBe('Citas del día 4 33 % atendido · 1 cancelada o ausente');
    expect(kpis[1]).toBe('Por llegar 1 Siguiente: 11:00');
    expect(kpis[2]).toMatch(/^En espera 1 Mayor espera: /);
    expect(kpis[3]).toBe('En atención 0 Nadie en consultorio');
    expect(kpis[4]).toBe('Completadas 1 De 3 citas activas');

    expect(normalizar(chip(fixture, 'Todas').textContent)).toBe('Todas 4 citas');
    expect(chip(fixture, 'Todas').getAttribute('aria-pressed')).toBe('true');
    expect(normalizar(chip(fixture, 'En espera').textContent)).toBe('En espera 1 cita');
    expect(normalizar(chip(fixture, 'Canceladas').textContent)).toBe(
      'Canceladas o ausentes 1 cita',
    );

    chip(fixture, 'En espera').click();
    await fixture.whenStable();
    expect(chip(fixture, 'En espera').getAttribute('aria-pressed')).toBe('true');
    expect(chip(fixture, 'Todas').getAttribute('aria-pressed')).toBe('false');
    expect(fila(fixture, 'CIT001')).toBeTruthy();
    expect(fila(fixture, 'CIT002')).toBeNull();
    expect(fila(fixture, 'CIT003')).toBeNull();
    expect(anuncio()).toBe('Mostrando 1 cita: En espera.');
    expect(texto(fixture)).toContain('1 de 4 · En espera');
    // Los indicadores siguen mostrando el día completo.
    expect(
      normalizar(
        fixture.nativeElement.querySelector('app-indicadores-dia .kpi__valor').textContent,
      ),
    ).toBe('4');

    chip(fixture, 'En atención').click();
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Ninguna cita en «En atención»');
    expect(texto(fixture)).toContain('Elige otro filtro o mira todas las citas del día.');
    boton(fixture, 'Ver todas')!.click();
    await fixture.whenStable();
    expect(fila(fixture, 'CIT004')).toBeTruthy();
    // El botón «Ver todas» desapareció: el foco va al chip «Todas», no a <body>.
    expect(document.activeElement).toBe(chip(fixture, 'Todas'));
    soltar();
  });

  it('envía la transición con versionCita e Idempotency-Key, actualiza la fila y enfoca el aviso', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    await pulsarPasarAEspera();
    const req = http.expectOne({ method: 'POST', url: TRANSICION });
    expect(req.request.body).toEqual({ accion: 'PASAR_A_ESPERA', versionCita: 7 });
    expect(req.request.headers.get(CABECERA_IDEMPOTENCIA)).toMatch(UUID_V4);
    req.flush(enEspera());
    await fixture.whenStable();

    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: En espera');
    expect(boton(fixture, /^Iniciar atención/)).toBeTruthy();
    expect(boton(fixture, /^Pasar a espera/)).toBeUndefined();
    // El botón pulsado desapareció: el foco queda en el aviso de resultado, no en <body>.
    const activo = document.activeElement as HTMLElement;
    expect(activo.classList.contains('foco-resultado')).toBe(true);
    expect(activo.textContent).toContain('CIT001: Pasar a espera. Estado actual: En espera.');
    soltar();
  });

  it('mientras se guarda bloquea las acciones (sin quitar el foco) y lo explica', async () => {
    await pulsarPasarAEspera();
    const pulsado = boton(fixture, /^Pasar a espera/)!;
    expect(pulsado.classList.contains('btn--cargando')).toBe(true);
    expect(pulsado.getAttribute('aria-disabled')).toBe('true');
    expect(pulsado.getAttribute('aria-describedby')).toBe('panel-guardando');
    expect(normalizar(query(fixture, '#panel-guardando').textContent)).toBe(
      'Guardando la acción de CIT001. Las demás acciones se habilitarán al terminar.',
    );
    expect(fila(fixture, 'CIT001')!.classList.contains('cita--en-curso')).toBe(true);
    // Un segundo clic no envía otra transición.
    pulsado.click();
    await fixture.whenStable();
    http.expectOne(TRANSICION).flush(enEspera());
    await fixture.whenStable();
    expect(query(fixture, '#panel-guardando').textContent!.trim()).toBe('');
  });

  it('ante 409 muestra «La cita cambió…» con Actualizar y no reintenta automáticamente', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    await pulsarPasarAEspera();
    http.expectOne(TRANSICION).flush(problema(409, 'VERSION_OBSOLETA'), opcionesProblema(409));
    await fixture.whenStable();

    expect(texto(fixture)).toContain(MENSAJE_CITA_CAMBIO);
    http.expectNone(TRANSICION);
    const botonesAviso = Array.from(region().querySelectorAll('button')) as HTMLButtonElement[];
    expect(botonesAviso.map((b) => b.textContent!.trim())).toEqual(['Actualizar']);
    expect(region().contains(document.activeElement)).toBe(true);
    botonesAviso[0].click();
    await fixture.whenStable();
    citasDelDia(hoyEnLima()).flush([enEspera()]);
    await fixture.whenStable();
    expect(texto(fixture)).not.toContain(MENSAJE_CITA_CAMBIO);
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: En espera');
    http.expectNone(TRANSICION);
    // El aviso desapareció: el foco pasa al título de la lista y se anuncia la actualización.
    expect((document.activeElement as HTMLElement).id).toBe('titulo-citas-dia');
    expect(anuncio()).toMatch(/^Lista actualizada a las \d{2}:\d{2}\.$/);
    soltar();
  });

  it('respuesta perdida sin registro: Reintentar reutiliza la misma clave y termina en éxito', async () => {
    await pulsarPasarAEspera();
    const primera = http.expectOne(TRANSICION);
    const clave = primera.request.headers.get(CABECERA_IDEMPOTENCIA);
    primera.error(new ProgressEvent('error'), { status: 0 });
    http
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(problema(404, 'RECURSO_NO_ENCONTRADO'), opcionesProblema(404));
    await fixture.whenStable();
    expect(region().textContent).toContain('no llegó a registrarse');
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: Check-in');

    boton(fixture, 'Reintentar')!.click();
    await fixture.whenStable();
    const segunda = http.expectOne(TRANSICION);
    expect(segunda.request.headers.get(CABECERA_IDEMPOTENCIA)).toBe(clave);
    expect(segunda.request.body).toEqual({ accion: 'PASAR_A_ESPERA', versionCita: 7 });
    segunda.flush(enEspera());
    await fixture.whenStable();

    expect(region().textContent).toContain('CIT001: Pasar a espera. Estado actual: En espera.');
    expect(boton(fixture, 'Reintentar')).toBeUndefined();
    expect(boton(fixture, /^Iniciar atención/)).toBeTruthy();
  });

  it('respuesta perdida pero COMPLETADA: muestra el éxito y recarga la lista', async () => {
    await pulsarPasarAEspera();
    const req = http.expectOne(TRANSICION);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(operacion({ clave, tipo: 'TRANSICION_CITA' }));
    citasDelDia(hoyEnLima()).flush([enEspera()]);
    await fixture.whenStable();

    expect(region().textContent).toContain('CIT001: Pasar a espera. Actualizamos la lista.');
    expect(region().querySelector('.aviso--exito')).toBeTruthy();
    expect(boton(fixture, /^Iniciar atención/)).toBeTruthy();
  });

  it('«Actualizar» durante una acción en curso no impide reintentarla después', async () => {
    await pulsarPasarAEspera();
    const primera = http.expectOne(TRANSICION);
    const clave = primera.request.headers.get(CABECERA_IDEMPOTENCIA);

    boton(fixture, 'Actualizar')!.click();
    await fixture.whenStable();
    citasDelDia(hoyEnLima()).flush([citaOperador()]);
    await fixture.whenStable();

    primera.error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`/api/v1/operaciones/${clave}`).error(new ProgressEvent('error'), { status: 0 });
    await fixture.whenStable();
    expect(region().textContent).toContain('aún no sabemos si la operación se guardó');

    boton(fixture, 'Reintentar')!.click();
    await fixture.whenStable();
    const segunda = http.expectOne(TRANSICION);
    expect(segunda.request.headers.get(CABECERA_IDEMPOTENCIA)).toBe(clave);
    segunda.flush(enEspera());
    await fixture.whenStable();
    expect(region().textContent).toContain('Estado actual: En espera.');
  });

  it('una actualización que llega tarde no deshace una transición ya guardada (versionCita)', async () => {
    await pulsarPasarAEspera();
    const transicion = http.expectOne(TRANSICION);
    boton(fixture, 'Actualizar')!.click();
    await fixture.whenStable();
    const lista = citasDelDia(hoyEnLima());

    transicion.flush(enEspera()); // versión 8
    await fixture.whenStable();
    lista.flush([citaOperador()]); // la consulta salió antes: versión 7
    await fixture.whenStable();

    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: En espera');
    expect(boton(fixture, /^Iniciar atención/)).toBeTruthy();
  });

  it('si la actualización falla con datos en pantalla, los conserva y lo indica', async () => {
    citasDelDia(hoyEnLima()).flush([citaOperador()]);
    await fixture.whenStable();
    boton(fixture, 'Actualizar')!.click();
    await fixture.whenStable();
    citasDelDia(hoyEnLima()).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();

    expect(fila(fixture, 'CIT001')).toBeTruthy();
    expect(texto(fixture)).toMatch(/No pudimos actualizar · datos de las \d{2}:\d{2}/);
    expect(anuncio()).toContain('Mostramos lo último que cargamos.');
    expect(texto(fixture)).not.toContain('No pudimos cargar las citas');
  });

  it('sin datos guardados, un error de carga muestra el estado de error con Reintentar', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    citasDelDia(hoyEnLima()).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    await fixture.whenStable();
    const alerta = query(fixture, '[role="alert"]');
    expect(alerta.textContent).toContain('No pudimos cargar las citas');

    const reintentar = Array.from(alerta.querySelectorAll('button')).find(
      (b) => b.textContent!.trim() === 'Reintentar',
    )!;
    reintentar.focus();
    reintentar.click();
    await fixture.whenStable();
    citasDelDia(hoyEnLima()).flush([citaOperador()]);
    await fixture.whenStable();
    expect(fila(fixture, 'CIT001')).toBeTruthy();
    expect((document.activeElement as HTMLElement).id).toBe('titulo-citas-dia');
    soltar();
  });

  it('tras un éxito guarda la cita en la copia del día e invalida las vistas del paciente', async () => {
    const cache = TestBed.inject(CacheService);
    citasDelDia(hoyEnLima()).flush([]);
    const input = query<HTMLInputElement>(fixture, '#panel-fecha');
    input.value = '2026-11-06';
    input.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    citasDelDia('2026-11-06').flush([citaOperador()]);
    await fixture.whenStable();
    cache.guardar('cita:c-1', { id: 'c-1' });
    cache.guardar('citas:proximas', []);

    boton(fixture, /^Pasar a espera/)!.click();
    await fixture.whenStable();
    http.expectOne(TRANSICION).flush(enEspera());
    await fixture.whenStable();

    const guardada = cache.leer<ListaDia>(claveListaOperador('2026-11-06'))!;
    expect(guardada.citas[0].estado).toBe('EN_ESPERA');
    expect(cache.leer('cita:c-1')).toBeUndefined();
    expect(cache.leer('citas:proximas')).toBeUndefined();
  });
});

describe('PanelOperadorComponent · datos guardados (stale-while-revalidate)', () => {
  it('al volver al panel pinta la copia en memoria sin esqueleto y la revalida', async () => {
    const http = configurar();
    const primera = TestBed.createComponent(PanelOperadorComponent);
    await primera.whenStable();
    solicitudDelDia(http, hoyEnLima()).flush([citaOperador()]);
    await primera.whenStable();
    primera.destroy();

    const fixture = TestBed.createComponent(PanelOperadorComponent);
    await fixture.whenStable();
    // Al instante: datos guardados, sin esqueleto ni aria-busy, y la consulta en segundo plano.
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: Check-in');
    expect(fixture.nativeElement.querySelector('app-esqueleto')).toBeNull();
    expect(query(fixture, 'section.lista').getAttribute('aria-busy')).toBe('false');
    expect(texto(fixture)).toContain('Actualizando…');

    solicitudDelDia(http, hoyEnLima()).flush([enEspera()]);
    await fixture.whenStable();
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: En espera');
    expect(texto(fixture)).toMatch(/Actualizado a las \d{2}:\d{2}/);
    http.verify();
  });
});

describe('PanelOperadorComponent · actualización automática', () => {
  // 10:00 del 6 de noviembre en Lima.
  const AHORA = new Date('2026-11-06T15:00:00Z');
  let http: HttpTestingController;
  let fixture: ComponentFixture<PanelOperadorComponent>;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: AHORA });
    fijarPestanaOculta(false);
    http = configurar();
    fixture = TestBed.createComponent(PanelOperadorComponent);
    await fixture.whenStable();
    solicitudDelDia(http, '2026-11-06').flush([citaOperador()]);
    await fixture.whenStable();
  });

  afterEach(() => {
    http.verify();
    restaurarPestana();
    vi.useRealTimers();
  });

  const avanzar = async (ms: number) => {
    vi.advanceTimersByTime(ms);
    await fixture.whenStable();
  };
  const interruptor = () => query<HTMLInputElement>(fixture, '#panel-auto');

  it('cada minuto revalida en segundo plano y actualiza la marca de tiempo', async () => {
    expect(interruptor().checked).toBe(true);
    expect(interruptor().getAttribute('role')).toBe('switch');
    expect(texto(fixture)).toContain('Actualizado a las 10:00');

    await avanzar(INTERVALO_AUTO_MS);
    expect(texto(fixture)).toContain('Actualizando…');
    // En segundo plano: sin esqueleto y sin bloquear el botón «Actualizar».
    expect(fixture.nativeElement.querySelector('app-esqueleto')).toBeNull();
    expect(boton(fixture, 'Actualizar')!.getAttribute('aria-disabled')).toBeNull();
    solicitudDelDia(http, '2026-11-06').flush([enEspera()]);
    await fixture.whenStable();
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: En espera');
    expect(texto(fixture)).toContain('Actualizado a las 10:01');
    // No anuncia nada.
    expect(
      normalizar(fixture.nativeElement.querySelector('p.solo-lectores[role="status"]').textContent),
    ).toBe('');
  });

  it('no mueve el foco ni borra el aviso de resultado', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    boton(fixture, /^Pasar a espera/)!.click();
    await fixture.whenStable();
    http.expectOne(TRANSICION).flush(enEspera());
    await fixture.whenStable();
    const aviso = document.activeElement as HTMLElement;
    expect(aviso.classList.contains('foco-resultado')).toBe(true);

    await avanzar(INTERVALO_AUTO_MS);
    solicitudDelDia(http, '2026-11-06').flush([enEspera()]);
    await fixture.whenStable();
    expect(document.activeElement).toBe(aviso);
    expect(regionDe(fixture).textContent).toContain('Estado actual: En espera.');
    soltar();
  });

  it('se pausa con la pestaña oculta y se reanuda al volver', async () => {
    fijarPestanaOculta(true);
    await avanzar(3 * INTERVALO_AUTO_MS);
    http.expectNone((r) => r.url === LISTA);

    fijarPestanaOculta(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();
    solicitudDelDia(http, '2026-11-06').flush([citaOperador()]);
    await fixture.whenStable();
  });

  it('no interrumpe una acción en curso', async () => {
    boton(fixture, /^Pasar a espera/)!.click();
    await fixture.whenStable();
    const transicion = http.expectOne(TRANSICION);

    await avanzar(2 * INTERVALO_AUTO_MS);
    http.expectNone((r) => r.url === LISTA);

    transicion.flush(enEspera());
    await fixture.whenStable();
    await avanzar(INTERVALO_RELOJ_MS);
    solicitudDelDia(http, '2026-11-06').flush([enEspera()]);
    await fixture.whenStable();
  });

  it('espera mientras el foco está dentro de la lista', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    boton(fixture, /^Pasar a espera/)!.focus();
    await avanzar(2 * INTERVALO_AUTO_MS);
    http.expectNone((r) => r.url === LISTA);

    boton(fixture, 'Actualizar')!.focus();
    await avanzar(INTERVALO_RELOJ_MS);
    solicitudDelDia(http, '2026-11-06').flush([citaOperador()]);
    await fixture.whenStable();
    soltar();
  });

  /** Los 14 primeros pulsos del reloj, con la persona inactiva: cada uno actualiza la lista. */
  const pasarCatorceMinutos = async () => {
    for (let minuto = 1; minuto < 15; minuto++) {
      await avanzar(INTERVALO_RELOJ_MS);
      solicitudDelDia(http, '2026-11-06').flush([citaOperador()]);
      await fixture.whenStable();
    }
  };

  it('tras 15 min sin interacción deja de actualizar (no renueva la sesión sin límite)', async () => {
    await pasarCatorceMinutos();
    await avanzar(INTERVALO_RELOJ_MS);
    await avanzar(10 * INTERVALO_RELOJ_MS);
    // Volver a la pestaña no es interacción.
    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();
    http.expectNone((r) => r.url === LISTA);
    expect(interruptor().checked).toBe(true);
    expect(query(fixture, '#panel-auto-ayuda').textContent).toContain(
      'tras 15 minutos sin actividad',
    );
  });

  it('la primera interacción tras el reposo actualiza en el acto y reanuda', async () => {
    await pasarCatorceMinutos();
    await avanzar(3 * INTERVALO_RELOJ_MS);
    http.expectNone((r) => r.url === LISTA);

    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    await fixture.whenStable();
    solicitudDelDia(http, '2026-11-06').flush([enEspera()]);
    await fixture.whenStable();
    expect(estadoDe(fixture, 'CIT001')).toBe('Estado: En espera');

    await avanzar(INTERVALO_RELOJ_MS);
    solicitudDelDia(http, '2026-11-06').flush([enEspera()]);
    await fixture.whenStable();
  });

  it('si la interacción que reanuda es dentro de la lista, actualiza en el siguiente pulso', async () => {
    await pasarCatorceMinutos();
    await avanzar(2 * INTERVALO_RELOJ_MS);

    const tabla = query(fixture, 'app-tabla-citas-operador');
    tabla.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await fixture.whenStable();
    http.expectNone((r) => r.url === LISTA);

    await avanzar(INTERVALO_RELOJ_MS);
    solicitudDelDia(http, '2026-11-06').flush([citaOperador()]);
    await fixture.whenStable();
  });

  it('el interruptor la desactiva y, al reactivarla, actualiza si la lista es antigua', async () => {
    interruptor().click();
    await fixture.whenStable();
    expect(interruptor().checked).toBe(false);
    await avanzar(3 * INTERVALO_AUTO_MS);
    http.expectNone((r) => r.url === LISTA);

    interruptor().click();
    await fixture.whenStable();
    solicitudDelDia(http, '2026-11-06').flush([citaOperador()]);
    await fixture.whenStable();
    expect(interruptor().checked).toBe(true);
  });
});

function regionDe(fixture: ComponentFixture<unknown>): HTMLElement {
  return (fixture.nativeElement as HTMLElement).querySelector('.region-resultado') as HTMLElement;
}

describe('PanelOperadorComponent · cambio de día en Lima', () => {
  afterEach(() => {
    restaurarPestana();
    vi.useRealTimers();
  });

  it('«Hoy» se habilita al pasar la medianoche de Lima y consulta el nuevo día', async () => {
    // 23:58 del 5 de noviembre en Lima (04:58 UTC del 6).
    vi.useFakeTimers({
      toFake: ['Date', 'setInterval', 'clearInterval'],
      now: new Date('2026-11-06T04:58:00Z'),
    });
    fijarPestanaOculta(false);
    const http = configurar();
    const fixture = TestBed.createComponent(PanelOperadorComponent);
    await fixture.whenStable();
    solicitudDelDia(http, '2026-11-05').flush([]);
    await fixture.whenStable();
    // Bloqueado con aria-disabled (conserva el foco) y explicado.
    expect(boton(fixture, 'Hoy')!.getAttribute('aria-disabled')).toBe('true');
    expect(boton(fixture, 'Hoy')!.getAttribute('aria-describedby')).toBe('panel-hoy-nota');
    boton(fixture, 'Hoy')!.click();
    await fixture.whenStable();
    http.expectNone((r) => r.url === LISTA);

    vi.advanceTimersByTime(3 * INTERVALO_RELOJ_MS);
    await fixture.whenStable();
    expect(boton(fixture, 'Hoy')!.getAttribute('aria-disabled')).toBeNull();
    // La actualización automática siguió revisando el día que se está viendo.
    solicitudDelDia(http, '2026-11-05').flush([]);
    await fixture.whenStable();

    boton(fixture, 'Hoy')!.click();
    await fixture.whenStable();
    solicitudDelDia(http, '2026-11-06').flush([]);
    await fixture.whenStable();
    expect(query<HTMLInputElement>(fixture, '#panel-fecha').value).toBe('2026-11-06');
    expect(boton(fixture, 'Hoy')!.getAttribute('aria-disabled')).toBe('true');
    http.verify();
  });
});
