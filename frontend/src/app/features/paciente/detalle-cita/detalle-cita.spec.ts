import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { CABECERA_IDEMPOTENCIA } from '../../../core/idempotencia/idempotencia.service';
import { AccionPaciente, CitaDetalle } from '../../../core/modelos/contrato';
import {
  UUID_V4,
  adjuntar,
  citaCancelada,
  citaDetalle,
  opcionesProblema,
  operacion,
  problema,
} from '../../../../testing/datos-prueba';
import { boton, botones, enlace, enlaces, query, texto } from '../../../../testing/dom';
import { DetalleCitaComponent } from './detalle-cita';

const BASE = '/api/v1/pacientes/me/citas/c-1';

describe('DetalleCitaComponent', () => {
  let fixture: ComponentFixture<DetalleCitaComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [DetalleCitaComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  async function abrir(cita: CitaDetalle) {
    fixture = TestBed.createComponent(DetalleCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    http.expectOne(BASE).flush(cita);
    http.expectOne(`${BASE}/linea-tiempo`).flush([
      {
        secuencia: 1,
        tipo: 'CREADA',
        ocurridoEn: '2026-10-13T14:00:00Z',
        titulo: 'Cita registrada',
        descripcion: 'Tu cita fue registrada.',
      },
    ]);
    await fixture.whenStable();
  }

  function acciones(): string[] {
    const contenedor = (fixture.nativeElement as HTMLElement).querySelector('.lista-acciones');
    if (!contenedor) return [];
    return Array.from(contenedor.querySelectorAll('button, a')).map((e) =>
      e.textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  it('muestra los datos en hora de Lima y la línea de tiempo', async () => {
    await abrir(citaDetalle());
    const t = texto(fixture);
    expect(t).toContain('Cita CIT001');
    expect(t).toContain('Miércoles, 4 de noviembre de 2026');
    expect(t).toContain('09:00 a 09:20');
    expect(t).toContain('(hora de Lima)');
    expect(t).toContain('Pendiente');
    expect(t).toContain('Cita registrada');
    expect(t).toContain('13 oct 2026, 09:00');
  });

  it.each<[AccionPaciente[], string[]]>([
    [['CONFIRMAR'], ['Confirmar']],
    [['REGISTRAR_LLEGADA'], ['Registrar llegada']],
    [
      ['PRE_CHECK_IN', 'REPROGRAMAR', 'CANCELAR'],
      ['Completar pre-check-in', 'Reprogramar', 'Cancelar cita'],
    ],
    [[], []],
  ])('los botones salen solo de accionesPermitidas %j', async (permitidas, esperadas) => {
    await abrir(citaDetalle({ accionesPermitidas: permitidas }));
    expect(acciones()).toEqual(esperadas);
    if (permitidas.length === 0) {
      expect(texto(fixture)).toContain('No hay acciones disponibles');
    }
  });

  it('Confirmar explica que no registra la llegada', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
    expect(texto(fixture)).toContain('Confirmar no registra tu llegada');
    expect(boton(fixture, 'Confirmar')?.getAttribute('aria-describedby')).toBe('nota-confirmar');
  });

  it('muestra la ventana de llegada cuando viene en la respuesta', async () => {
    await abrir(
      citaDetalle({
        accionesPermitidas: ['REGISTRAR_LLEGADA'],
        ventanaLlegada: { desde: '2026-11-04T13:00:00Z', hasta: '2026-11-04T14:30:00Z' },
      }),
    );
    const t = texto(fixture);
    expect(t).toContain('Ventana de llegada');
    expect(t).toContain('08:00');
    expect(t).toContain('09:30');
  });

  it('confirma con Idempotency-Key y versionAgenda, y muestra el éxito', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'], versionAgenda: 3 }));
    boton(fixture, 'Confirmar')!.click();
    await fixture.whenStable();
    expect(boton(fixture, 'Confirmando…')?.disabled).toBe(true);

    const req = http.expectOne({ method: 'POST', url: `${BASE}/confirmacion` });
    expect(req.request.body).toEqual({ versionAgenda: 3 });
    expect(req.request.headers.get(CABECERA_IDEMPOTENCIA)).toMatch(UUID_V4);
    req.flush(
      citaDetalle({
        estado: 'CONFIRMADA',
        estadoEtiqueta: 'Confirmada',
        accionesPermitidas: ['CANCELAR'],
        confirmadaEn: '2026-10-20T15:00:00Z',
      }),
    );
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();

    const t = texto(fixture);
    expect(t).toContain('Tu cita quedó confirmada');
    expect(t).toContain('Confirmada el 20 oct 2026, 10:00');
    expect(acciones()).toEqual(['Cancelar cita']);
  });

  it('ante 409 muestra el error y ofrece actualizar la vista (sin reintentar solo)', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
    boton(fixture, 'Confirmar')!.click();
    await fixture.whenStable();
    http.expectOne(`${BASE}/confirmacion`).flush(
      problema(409, 'VERSION_OBSOLETA', {
        detail: 'La cita fue modificada. Actualiza la vista antes de continuar.',
      }),
      opcionesProblema(409),
    );
    await fixture.whenStable();
    expect(texto(fixture)).toContain('La cita fue modificada');
    expect(boton(fixture, 'Actualizar vista')).toBeTruthy();
    http.expectNone(`${BASE}/confirmacion`);

    boton(fixture, 'Actualizar vista')!.click();
    await fixture.whenStable();
    http.expectOne(BASE).flush(citaDetalle({ accionesPermitidas: [] }));
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
  });

  it('respuesta perdida: consulta /operaciones y, si no existe, reintenta con la MISMA clave', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
    boton(fixture, 'Confirmar')!.click();
    await fixture.whenStable();
    const primera = http.expectOne(`${BASE}/confirmacion`);
    const clave = primera.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    primera.error(new ProgressEvent('error'), { status: 0 });
    http
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(problema(404, 'RECURSO_NO_ENCONTRADO'), opcionesProblema(404));
    await fixture.whenStable();

    expect(texto(fixture)).toContain('no llegó a registrarse');
    expect(texto(fixture)).not.toContain('quedó confirmada');
    boton(fixture, 'Reintentar')!.click();
    await fixture.whenStable();
    const segunda = http.expectOne(`${BASE}/confirmacion`);
    expect(segunda.request.headers.get(CABECERA_IDEMPOTENCIA)).toBe(clave);
    segunda.flush(
      citaDetalle({ estado: 'CONFIRMADA', estadoEtiqueta: 'Confirmada', accionesPermitidas: [] }),
    );
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Tu cita quedó confirmada');
  });

  it('respuesta perdida pero COMPLETADA: recarga el detalle y muestra el éxito', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['REGISTRAR_LLEGADA'] }));
    boton(fixture, 'Registrar llegada')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/llegada`);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`/api/v1/operaciones/${clave}`).flush({
      clave,
      tipo: 'REGISTRAR_LLEGADA',
      recursoId: 'c-1',
      estado: 'COMPLETADA',
      httpStatus: 200,
      codigoError: null,
      registradaEn: '2026-11-04T13:10:00Z',
    });
    http.expectOne(BASE).flush(
      citaDetalle({
        estado: 'CHECK_IN',
        estadoEtiqueta: 'Check-in',
        accionesPermitidas: [],
        llegadaRegistradaEn: '2026-11-04T13:10:00Z',
      }),
    );
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();
    expect(texto(fixture)).toContain('Registramos tu llegada');
    expect(texto(fixture)).toContain('Check-in');
  });

  it('muestra «no encontrada» ante 404 sin revelar más datos', async () => {
    fixture = TestBed.createComponent(DetalleCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    http.expectOne(BASE).flush(problema(404, 'CITA_NO_ENCONTRADA'), opcionesProblema(404));
    http
      .expectOne(`${BASE}/linea-tiempo`)
      .flush(problema(404, 'CITA_NO_ENCONTRADA'), opcionesProblema(404));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No encontramos esta cita');
    expect(enlace(fixture, 'Volver a Mis citas')).toBeTruthy();
    expect(botones(fixture).length).toBe(0);
    expect(enlaces(fixture).every((a) => !a.textContent?.includes('Reprogramar'))).toBe(true);
  });

  it('muestra el aviso que llega desde otra pantalla (p. ej. tras reprogramar)', async () => {
    TestBed.inject(AvisoFlashService).publicar({
      tipo: 'exito',
      texto: 'Tu cita CIT001 se reprogramó.',
    });
    await abrir(citaDetalle());
    expect(texto(fixture)).toContain('Tu cita CIT001 se reprogramó.');
  });

  it('muestra el motivo de una cita cancelada (objeto { codigo, descripcion })', async () => {
    await abrir(citaCancelada());
    const t = texto(fixture);
    expect(t).toContain('Cancelada');
    expect(t).toMatch(/Motivo de cancelación\s*Compromiso personal/);
    expect(t).not.toContain('[object Object]');
    expect(acciones()).toEqual([]);
    expect(t).toContain('No hay acciones disponibles');
    expect(t).not.toContain('Ventana de llegada');
  });

  it('tras Confirmar, el foco va al aviso de resultado (el botón desaparece)', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
    const soltar = adjuntar(fixture.nativeElement);
    boton(fixture, 'Confirmar')!.focus();
    boton(fixture, 'Confirmar')!.click();
    await fixture.whenStable();
    http
      .expectOne(`${BASE}/confirmacion`)
      .flush(
        citaDetalle({ estado: 'CONFIRMADA', estadoEtiqueta: 'Confirmada', accionesPermitidas: [] }),
      );
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();
    expect(boton(fixture, 'Confirmar')).toBeUndefined();
    const activo = document.activeElement as HTMLElement;
    expect(activo.classList.contains('foco-resultado')).toBe(true);
    expect(activo.textContent).toContain('Tu cita quedó confirmada');
    soltar();
  });

  it('éxito verificado: si falla la recarga, conserva el éxito y añade el problema como texto secundario', async () => {
    await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
    boton(fixture, 'Confirmar')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/confirmacion`);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`/api/v1/operaciones/${clave}`).flush(operacion({ clave }));
    http.expectOne(BASE).flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();

    const region = fixture.nativeElement.querySelector('.region-resultado') as HTMLElement;
    expect(region.textContent).toContain('Tu cita quedó confirmada');
    expect(region.textContent).toContain('No pudimos actualizar los datos en pantalla');
    expect(region.querySelector('.aviso--exito')).toBeTruthy();
    expect(region.querySelector('.aviso--error')).toBeNull();
    expect(boton(fixture, 'Actualizar vista')).toBeTruthy();
  });

  it('la región aria-live existe vacía antes de que llegue el aviso de otra pantalla', async () => {
    TestBed.inject(AvisoFlashService).publicar({
      tipo: 'exito',
      texto: 'Pre-check-in completado.',
    });
    fixture = TestBed.createComponent(DetalleCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    const region = fixture.nativeElement.querySelector('.region-resultado') as HTMLElement;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent?.trim()).toBe('');

    http.expectOne(BASE).flush(citaDetalle());
    http.expectOne(`${BASE}/linea-tiempo`).flush([]);
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.region-resultado')).toBe(region);
    expect(region.textContent).toContain('Pre-check-in completado.');
  });

  it('trata un ID mal formado (400 VALIDACION) como cita no encontrada, sin Reintentar', async () => {
    fixture = TestBed.createComponent(DetalleCitaComponent);
    fixture.componentRef.setInput('id', 'no-es-uuid');
    await fixture.whenStable();
    const base = '/api/v1/pacientes/me/citas/no-es-uuid';
    http
      .expectOne(base)
      .flush(problema(400, 'VALIDACION', { detail: 'Formato inválido' }), opcionesProblema(400));
    http
      .expectOne(`${base}/linea-tiempo`)
      .flush(problema(400, 'VALIDACION'), opcionesProblema(400));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No encontramos esta cita');
    expect(texto(fixture)).not.toContain('Formato inválido');
    expect(boton(fixture, 'Reintentar')).toBeUndefined();
  });

  describe('diseño', () => {
    function el(): HTMLElement {
      return fixture.nativeElement as HTMLElement;
    }

    it('muestra esqueletos con aria-busy mientras carga (sin datos guardados)', async () => {
      fixture = TestBed.createComponent(DetalleCitaComponent);
      fixture.componentRef.setInput('id', 'c-1');
      await fixture.whenStable();
      expect(texto(fixture)).toContain('Cargando la cita…');
      expect(
        query(fixture, '[aria-busy="true"]').querySelectorAll('app-esqueleto').length,
      ).toBeGreaterThan(5);
      http.expectOne(BASE).flush(citaDetalle());
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();
      expect(el().querySelector('app-esqueleto')).toBeNull();
    });

    it('usa dos columnas: datos y acciones / ventana y línea de tiempo', async () => {
      await abrir(
        citaDetalle({
          accionesPermitidas: ['REGISTRAR_LLEGADA'],
          ventanaLlegada: { desde: '2026-11-04T13:00:00Z', hasta: '2026-11-04T14:30:00Z' },
        }),
      );
      const columnas = el().querySelectorAll('.rejilla-principal > .pila');
      expect(columnas.length).toBe(2);
      expect(columnas[0].textContent).toContain('Gestiona tu cita');
      expect(columnas[1].textContent).toContain('Ventana de llegada');
      expect(columnas[1].querySelector('app-linea-tiempo')).toBeTruthy();
      expect(query(fixture, 'nav[aria-label="Migas de pan"]').textContent).toContain('CIT001');
      // El estado va junto al h1 (ranura del encabezado), no debajo.
      expect(query(fixture, '.ep__titulo-fila app-estado-cita').textContent).toContain('Pendiente');
    });

    it('destaca la acción principal (Confirmar) y agrupa las demás con su explicación', async () => {
      await abrir(citaDetalle());
      const principal = boton(fixture, 'Confirmar')!;
      expect(principal.classList).toContain('btn--primario');
      expect(principal.closest('li')?.classList).toContain('accion-principal');
      const filas = Array.from(el().querySelectorAll('.lista-acciones .accion'));
      expect(filas.map((f) => f.querySelector('.accion__control')?.textContent?.trim())).toEqual([
        'Completar pre-check-in',
        'Reprogramar',
        'Cancelar cita',
      ]);
      expect(enlace(fixture, 'Reprogramar')?.getAttribute('aria-describedby')).toBe(
        'nota-reprogramar',
      );
      expect(enlace(fixture, 'Cancelar cita')?.closest('li')?.classList).toContain(
        'accion--peligro',
      );
      expect(enlace(fixture, 'Cancelar cita')?.getAttribute('href')).toBe(
        '/paciente/citas/c-1/cancelar',
      );
    });

    it('sin Confirmar, el pre-check-in es la acción destacada', async () => {
      await abrir(citaDetalle({ accionesPermitidas: ['PRE_CHECK_IN', 'CANCELAR'] }));
      const enlacePre = enlace(fixture, 'Completar pre-check-in')!;
      expect(enlacePre.classList).toContain('btn--primario');
      expect(enlacePre.getAttribute('aria-describedby')).toBe('nota-precheckin');
      expect(enlacePre.getAttribute('href')).toBe('/paciente/citas/c-1/pre-check-in');
    });

    it('si se puede registrar la llegada, esa es la principal y Confirmar queda como fila', async () => {
      await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR', 'REGISTRAR_LLEGADA'] }));
      expect(boton(fixture, 'Registrar llegada')?.classList).toContain('btn--primario');
      const confirmar = boton(fixture, 'Confirmar')!;
      expect(confirmar.classList).toContain('accion__control');
      expect(confirmar.getAttribute('aria-describedby')).toBe('nota-confirmar');
    });

    it('mientras confirma, el botón muestra el spinner y queda bloqueado', async () => {
      await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
      boton(fixture, 'Confirmar')!.click();
      await fixture.whenStable();
      const enCurso = boton(fixture, 'Confirmando…')!;
      expect(enCurso.classList).toContain('btn--cargando');
      expect(enCurso.disabled).toBe(true);
      expect(texto(fixture)).toContain('Procesando la acción');
      http.expectOne(`${BASE}/confirmacion`).flush(citaDetalle({ accionesPermitidas: [] }));
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();
    });

    it('muestra la cuenta regresiva y el estado de la ventana de llegada (hora de Lima)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-11-04T12:30:00Z')); // 07:30 en Lima
      await abrir(
        citaDetalle({
          accionesPermitidas: ['CONFIRMAR'],
          ventanaLlegada: { desde: '2026-11-04T13:00:00Z', hasta: '2026-11-04T14:30:00Z' },
        }),
      );
      expect(query(fixture, '.cuenta').textContent?.trim()).toBe('Hoy a las 09:00');
      const ventana = query(fixture, 'app-ventana-llegada');
      expect(ventana.textContent).toContain('Se abre hoy a las 08:00');
      // La escala es decorativa: el texto explica lo mismo.
      expect(ventana.querySelector('.vl__grafico')?.getAttribute('aria-hidden')).toBe('true');
      expect(ventana.querySelector('.vl__ahora')).toBeTruthy();
    });

    it('la ventana dice «Disponible ahora» cuando el servidor permite registrar la llegada', async () => {
      await abrir(
        citaDetalle({
          accionesPermitidas: ['REGISTRAR_LLEGADA'],
          ventanaLlegada: { desde: '2026-11-04T13:00:00Z', hasta: '2026-11-04T14:30:00Z' },
        }),
      );
      expect(query(fixture, '.vl__estado').textContent).toContain('Disponible ahora');
    });

    it('marca los pasos completados de la preparación', async () => {
      await abrir(citaDetalle({ confirmadaEn: '2026-10-20T15:00:00Z' }));
      const pasos = Array.from(el().querySelectorAll('.paso'));
      expect(pasos.map((p) => p.classList.contains('paso--hecho'))).toEqual([true, false, false]);
      expect(pasos[1].textContent).toContain('Sin completar');
    });
  });

  describe('stale-while-revalidate', () => {
    it('al volver muestra el detalle guardado al instante y lo revalida en segundo plano', async () => {
      await abrir(citaDetalle());
      fixture.destroy();

      fixture = TestBed.createComponent(DetalleCitaComponent);
      fixture.componentRef.setInput('id', 'c-1');
      await fixture.whenStable();
      // Sin esqueleto: la cita y su línea de tiempo guardadas se pintan de inmediato.
      expect(texto(fixture)).toContain('Cita CIT001');
      expect(texto(fixture)).toContain('Cita registrada');
      expect(texto(fixture)).not.toContain('Cargando la cita');
      // Indicador discreto (solo visual) en la zona de acciones del encabezado.
      const indicador = query(fixture, '.ep__acciones .sincronizando');
      expect(indicador.getAttribute('aria-hidden')).toBe('true');
      expect(indicador.classList).toContain('sincronizando--activo');
      // Mientras revalida, las acciones directas esperan los datos frescos.
      expect(texto(fixture)).toContain('Comprobando los datos más recientes');

      http
        .expectOne(BASE)
        .flush(citaDetalle({ estado: 'CONFIRMADA', estadoEtiqueta: 'Confirmada' }));
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();
      expect(texto(fixture)).toContain('Confirmada');
      // El indicador conserva su espacio (sin saltos de diseño) y solo deja de mostrarse.
      expect(query(fixture, '.sincronizando').classList).not.toContain('sincronizando--activo');
      expect(texto(fixture)).not.toContain('Comprobando los datos más recientes');
      // La revalidación no mueve el foco ni muestra avisos de resultado.
      expect(
        (fixture.nativeElement as HTMLElement)
          .querySelector('.region-resultado')
          ?.textContent?.trim(),
      ).toBe('');
    });

    it('si la revalidación falla, conserva la cita y ofrece volver a intentar', async () => {
      await abrir(citaDetalle());
      fixture.destroy();

      fixture = TestBed.createComponent(DetalleCitaComponent);
      fixture.componentRef.setInput('id', 'c-1');
      await fixture.whenStable();
      http.expectOne(BASE).flush(problema(503, 'ERROR_INTERNO'), opcionesProblema(503));
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();
      expect(texto(fixture)).toContain('Mostramos lo último que cargamos');
      expect(texto(fixture)).toContain('Cita CIT001');
      expect(texto(fixture)).not.toContain('No pudimos cargar la cita');

      boton(fixture, 'Volver a intentar')!.click();
      await fixture.whenStable();
      http.expectOne(BASE).flush(citaDetalle());
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();
      expect(texto(fixture)).not.toContain('Mostramos lo último que cargamos');
    });

    it('si la revalidación dice que ya no existe, deja de mostrar la cita guardada', async () => {
      await abrir(citaDetalle());
      fixture.destroy();

      fixture = TestBed.createComponent(DetalleCitaComponent);
      fixture.componentRef.setInput('id', 'c-1');
      await fixture.whenStable();
      http.expectOne(BASE).flush(problema(404, 'CITA_NO_ENCONTRADA'), opcionesProblema(404));
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();
      expect(texto(fixture)).toContain('No encontramos esta cita');
      expect(texto(fixture)).not.toContain('Medicina general');
      expect(TestBed.inject(CacheService).leer('cita:c-1')).toBeUndefined();
    });

    it('tras confirmar guarda la cita devuelta e invalida las listas y la línea de tiempo', async () => {
      const cache = TestBed.inject(CacheService);
      cache.guardar('citas:proximas', []);
      cache.guardar('citas:historial', []);
      await abrir(citaDetalle({ accionesPermitidas: ['CONFIRMAR'] }));
      boton(fixture, 'Confirmar')!.click();
      await fixture.whenStable();
      const confirmada = citaDetalle({
        estado: 'CONFIRMADA',
        estadoEtiqueta: 'Confirmada',
        accionesPermitidas: [],
      });
      http.expectOne(`${BASE}/confirmacion`).flush(confirmada);
      await fixture.whenStable();
      // La línea de tiempo se pide de nuevo (lo guardado ya no vale) sin vaciar la pantalla.
      expect(texto(fixture)).toContain('Cita registrada');
      expect((fixture.nativeElement as HTMLElement).querySelector('.esq-linea')).toBeNull();
      http.expectOne(`${BASE}/linea-tiempo`).flush([]);
      await fixture.whenStable();

      expect(cache.leer<CitaDetalle>('cita:c-1')?.estado).toBe('CONFIRMADA');
      expect(cache.leer('citas:proximas')).toBeUndefined();
      expect(cache.leer('citas:historial')).toBeUndefined();
    });
  });
});
