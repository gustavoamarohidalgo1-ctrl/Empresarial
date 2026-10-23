import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CacheService } from '../../../core/cache/cache.service';
import { CABECERA_IDEMPOTENCIA } from '../../../core/idempotencia/idempotencia.service';
import {
  MOTIVO_CANCELACION,
  UUID_V4,
  adjuntar,
  citaCancelada,
  citaDetalle,
  opcionesProblema,
  operacion,
  problema,
} from '../../../../testing/datos-prueba';
import { boton, elegir, marcar, query, texto } from '../../../../testing/dom';
import {
  ADVERTENCIA_CANCELACION,
  CancelarCitaComponent,
  TEXTO_CASILLA_CANCELACION,
} from './cancelar-cita';

const BASE = '/api/v1/pacientes/me/citas/c-1';
const MOTIVOS = [MOTIVO_CANCELACION, { codigo: 'CAN-SALUD', descripcion: 'Me siento mejor' }];

describe('CancelarCitaComponent', () => {
  let fixture: ComponentFixture<CancelarCitaComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [CancelarCitaComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CancelarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  async function cargar(acciones = citaDetalle().accionesPermitidas) {
    http.expectOne(BASE).flush(citaDetalle({ accionesPermitidas: acciones, versionAgenda: 2 }));
    http
      .expectOne(
        (r) => r.url === '/api/v1/catalogos/motivos' && r.params.get('tipo') === 'CANCELACION',
      )
      .flush(MOTIVOS);
    await fixture.whenStable();
  }

  async function prepararYEnviar() {
    await cargar();
    elegir(query<HTMLSelectElement>(fixture, '#motivo-cancelacion'), 'CAN-PERSONAL');
    marcar(query<HTMLInputElement>(fixture, '#comprendo-cancelacion'));
    await fixture.whenStable();
    confirmar().click();
    await fixture.whenStable();
  }

  const confirmar = () => boton(fixture, 'Confirmar cancelación')!;

  it('mientras carga muestra un esqueleto con el estado anunciado', async () => {
    const ocupado = query(fixture, '[aria-busy="true"]');
    expect(ocupado.querySelector('[role="status"]')!.textContent).toContain('Cargando la cita…');
    expect(ocupado.querySelector('app-esqueleto')).toBeTruthy();
    await cargar();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('explica la consecuencia antes de la acción, con el resumen de la cita', async () => {
    await cargar();
    const tarjeta = query(fixture, 'section[aria-labelledby="titulo-cancelar"]');
    const t = tarjeta.textContent!.replace(/\s+/g, ' ');
    expect(t).toContain('09:00');
    expect(t).toContain('Medicina general');
    // La advertencia aparece antes que el botón de confirmar (orden del DOM).
    const advertencia = query(fixture, '#advertencia-cancelacion');
    const accion = confirmar();
    expect(advertencia.compareDocumentPosition(accion) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(query(fixture, '#motivo-cancelacion').getAttribute('aria-describedby')).toBe(
      'motivo-cancelacion-ayuda',
    );
  });

  it('el encabezado tiene el h1, migas hasta la cita y su estado junto al título', async () => {
    await cargar();
    expect(query(fixture, 'h1').textContent).toContain('Cancelar cita');
    expect(query(fixture, 'nav[aria-label="Migas de pan"]').textContent).toContain('CIT001');
    expect(query(fixture, '[aria-current="page"]').textContent).toContain('Cancelar');
    expect(query(fixture, '.ep__titulo-fila app-estado-cita').textContent).toContain('Pendiente');
  });

  it('muestra la advertencia y la casilla de comprensión', async () => {
    await cargar();
    expect(texto(fixture)).toContain(ADVERTENCIA_CANCELACION);
    expect(texto(fixture)).toContain(TEXTO_CASILLA_CANCELACION);
    expect(query(fixture, 'label[for="motivo-cancelacion"]').textContent).toContain('Motivo');
  });

  it('el botón queda deshabilitado, con explicación visible, hasta elegir motivo y marcar la casilla', async () => {
    await cargar();
    expect(confirmar().disabled).toBe(true);
    expect(texto(fixture)).toContain('Para cancelar, elige un motivo y marca');

    elegir(query<HTMLSelectElement>(fixture, '#motivo-cancelacion'), 'CAN-PERSONAL');
    await fixture.whenStable();
    expect(confirmar().disabled).toBe(true);
    expect(texto(fixture)).toContain(`Para cancelar, marca «${TEXTO_CASILLA_CANCELACION}»`);

    marcar(query<HTMLInputElement>(fixture, '#comprendo-cancelacion'));
    await fixture.whenStable();
    expect(confirmar().disabled).toBe(false);
    expect(texto(fixture)).not.toContain('Para cancelar');
  });

  it('mientras cancela, el botón muestra el estado de carga sin cambiar su texto', async () => {
    await prepararYEnviar();
    const boton = confirmar();
    expect(boton.disabled).toBe(true);
    expect(boton.classList.contains('btn--cargando')).toBe(true);
    expect(query(fixture, '#explicacion-cancelando').getAttribute('role')).toBe('status');
    http.expectOne(`${BASE}/cancelacion`).flush(citaCancelada());
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();
  });

  it('cancela con Idempotency-Key y muestra la vista de cita cancelada', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    const cache = TestBed.inject(CacheService);
    await prepararYEnviar();
    cache.guardar('citas:proximas', []);

    const req = http.expectOne({ method: 'POST', url: `${BASE}/cancelacion` });
    expect(req.request.body).toEqual({ versionAgenda: 2, motivoCodigo: 'CAN-PERSONAL' });
    expect(req.request.headers.get(CABECERA_IDEMPOTENCIA)).toMatch(UUID_V4);
    req.flush(citaCancelada());
    http.expectOne(`${BASE}/linea-tiempo`).flush([
      {
        secuencia: 2,
        tipo: 'CANCELADA',
        ocurridoEn: '2026-10-13T14:10:00Z',
        titulo: 'Cita cancelada',
        descripcion: '',
      },
    ]);
    await fixture.whenStable();

    const t = texto(fixture);
    expect(t).toContain('Cita cancelada');
    expect(t).toContain('Cancelada');
    expect(t).toMatch(/Motivo\s*Compromiso personal/);
    expect(t).not.toContain('[object Object]');
    expect(t).toContain('13 oct 2026, 09:10');
    // El formulario ya no se muestra junto al resultado.
    expect(boton(fixture, 'Confirmar cancelación')).toBeUndefined();
    // El foco va al título del resultado.
    expect(document.activeElement?.id).toBe('titulo-resultado');
    // La caché guarda la cita cancelada y las listas se vuelven a pedir.
    expect(cache.leer<{ estado: string }>('cita:c-1')?.estado).toBe('CANCELADA');
    expect(cache.leer('citas:proximas')).toBeUndefined();
    soltar();
  });

  it('respuesta perdida pero COMPLETADA: recarga la cita y muestra la vista de cancelada', async () => {
    await prepararYEnviar();
    const req = http.expectOne(`${BASE}/cancelacion`);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(operacion({ clave, tipo: 'CANCELAR_CITA' }));
    http.expectOne(BASE).flush(citaCancelada());
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();

    const t = texto(fixture);
    expect(t).toContain('Cita cancelada');
    expect(t).toContain('Compromiso personal');
    expect(boton(fixture, 'Confirmar cancelación')).toBeUndefined();
  });

  it('ante un rechazo muestra el error, conserva el formulario y lleva el foco al aviso', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    await prepararYEnviar();
    http
      .expectOne(`${BASE}/cancelacion`)
      .flush(
        problema(422, 'FUERA_DE_PLAZO', { detail: 'La cita ya empezó: no se puede cancelar.' }),
        opcionesProblema(422),
      );
    await fixture.whenStable();
    expect(texto(fixture)).toContain('La cita ya empezó');
    expect(confirmar()).toBeTruthy();
    expect(document.activeElement?.classList.contains('foco-resultado')).toBe(true);
    soltar();
  });

  it('no muestra el formulario si CANCELAR no está permitido', async () => {
    await cargar(['CONFIRMAR']);
    expect(texto(fixture)).toContain('ya no admite cancelación');
    expect(boton(fixture, 'Confirmar cancelación')).toBeUndefined();
  });

  it('trata un ID mal formado (400 VALIDACION) como cita no encontrada', async () => {
    http
      .expectOne(BASE)
      .flush(problema(400, 'VALIDACION', { detail: 'Formato inválido' }), opcionesProblema(400));
    // forkJoin cancela la petición del catálogo al fallar la de la cita.
    const catalogo = http.expectOne((r) => r.url === '/api/v1/catalogos/motivos');
    expect(catalogo.cancelled).toBe(true);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No encontramos esta cita');
    expect(texto(fixture)).not.toContain('Formato inválido');
    expect(boton(fixture, 'Reintentar')).toBeUndefined();
  });
});

describe('CancelarCitaComponent con la cita guardada (stale-while-revalidate)', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  it('pinta la cita al instante y no deja cancelar hasta tener la versión fresca', async () => {
    TestBed.configureTestingModule({
      imports: [CancelarCitaComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const cache = TestBed.inject(CacheService);
    cache.guardar('cita:c-1', citaDetalle({ versionAgenda: 1 }));
    cache.guardar('catalogo:motivos:CANCELACION', MOTIVOS);
    const fixture = TestBed.createComponent(CancelarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    elegir(query<HTMLSelectElement>(fixture, '#motivo-cancelacion'), 'CAN-PERSONAL');
    marcar(query<HTMLInputElement>(fixture, '#comprendo-cancelacion'));
    await fixture.whenStable();
    expect(boton(fixture, 'Confirmar cancelación')!.disabled).toBe(true);
    expect(texto(fixture)).toContain('Comprobando los datos más recientes de la cita…');

    http.expectOne(BASE).flush(citaDetalle({ versionAgenda: 5 }));
    await fixture.whenStable();
    boton(fixture, 'Confirmar cancelación')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/cancelacion`);
    expect(req.request.body).toEqual({ versionAgenda: 5, motivoCodigo: 'CAN-PERSONAL' });
    req.flush(problema(409, 'VERSION_OBSOLETA'), opcionesProblema(409));
    await fixture.whenStable();

    // «Actualizar vista» no reutiliza lo guardado: vuelve a pedir la cita.
    boton(fixture, 'Actualizar vista')!.click();
    await fixture.whenStable();
    expect(query(fixture, '[aria-busy="true"]').textContent).toContain('Cargando la cita…');
    http.expectOne(BASE).flush(citaDetalle({ versionAgenda: 6 }));
    await fixture.whenStable();
    expect(texto(fixture)).not.toContain('No se guardó');
  });

  it('si falla la revalidación, avisa que muestra lo último que cargó', async () => {
    TestBed.configureTestingModule({
      imports: [CancelarCitaComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const cache = TestBed.inject(CacheService);
    cache.guardar('cita:c-1', citaDetalle());
    cache.guardar('catalogo:motivos:CANCELACION', MOTIVOS);
    const fixture = TestBed.createComponent(CancelarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    http.expectOne(BASE).flush(problema(503, 'SERVICIO_NO_DISPONIBLE'), opcionesProblema(503));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Mostramos lo último que cargamos');
    expect(boton(fixture, 'Confirmar cancelación')).toBeTruthy();
  });
});
