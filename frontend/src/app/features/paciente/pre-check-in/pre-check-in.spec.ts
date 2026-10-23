import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { CABECERA_IDEMPOTENCIA } from '../../../core/idempotencia/idempotencia.service';
import {
  UUID_V4,
  adjuntar,
  citaDetalle,
  opcionesProblema,
  operacion,
  problema,
} from '../../../../testing/datos-prueba';
import { boton, escribir, marcar, query, texto } from '../../../../testing/dom';
import { AVISO_PRESENCIA, PreCheckInComponent } from './pre-check-in';

const BASE = '/api/v1/pacientes/me/citas/c-1';
const PERFIL = {
  nombres: 'Ana',
  apellidos: 'Demo',
  email: 'ana.demo@ejemplo.invalid',
  telefono: '+51 900 000 001',
};

describe('PreCheckInComponent', () => {
  let fixture: ComponentFixture<PreCheckInComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PreCheckInComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PreCheckInComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    // Sin datos guardados: esqueleto con el estado anunciado.
    expect(query(fixture, '[aria-busy="true"]').textContent).toContain('Cargando tus datos…');
    http.expectOne(BASE).flush(
      citaDetalle({
        accionesPermitidas: ['PRE_CHECK_IN'],
        versionAgenda: 4,
        ventanaLlegada: { desde: '2026-11-04T13:45:00Z', hasta: '2026-11-04T14:15:00Z' },
      }),
    );
    http.expectOne('/api/v1/pacientes/me/perfil').flush(PERFIL);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  const completar = () => boton(fixture, 'Completar pre-check-in')!;

  it('prellena correo y teléfono desde el perfil y aclara que no acredita presencia', () => {
    expect(query<HTMLInputElement>(fixture, '#pci-email').value).toBe(PERFIL.email);
    expect(query<HTMLInputElement>(fixture, '#pci-telefono').value).toBe(PERFIL.telefono);
    expect(texto(fixture)).toContain(AVISO_PRESENCIA);
    expect(texto(fixture)).toContain('no acredita tu presencia física');
  });

  it('presenta pasos numerados y explica la presencia antes de la casilla y del botón', () => {
    const pasos = Array.from(fixture.nativeElement.querySelectorAll('ol.pasos > li')) as HTMLElement[];
    expect(pasos.map((p) => p.querySelector('h2')!.textContent!.trim())).toEqual([
      'Revisa tus datos de contacto',
      'Confirma y envía',
      'Después: el día de la cita, registra tu llegada',
    ]);
    const aviso = Array.from(pasos[1].querySelectorAll('p')).find((p) =>
      p.textContent!.includes(AVISO_PRESENCIA),
    )!;
    const casilla = query(fixture, '#pci-datos-correctos');
    expect(aviso.compareDocumentPosition(casilla) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(casilla.compareDocumentPosition(completar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(query(fixture, 'label.casilla').getAttribute('for')).toBe('pci-datos-correctos');
    // La ventana de llegada se ve como el siguiente paso.
    expect(pasos[2].textContent!.replace(/\s+/g, ' ')).toContain(
      'Podrás registrar tu llegada desde las 08:45 hasta antes de las 09:15 del 04 nov 2026 (hora de Lima).',
    );
    // Cada campo tiene etiqueta y ayuda enlazada.
    expect(query(fixture, '#pci-email').getAttribute('aria-describedby')).toBe('pci-email-ayuda');
    expect(query(fixture, '#pci-telefono').getAttribute('aria-describedby')).toBe(
      'pci-telefono-ayuda',
    );
  });

  it('el encabezado tiene el h1, migas hasta la cita y su estado junto al título', () => {
    expect(query(fixture, 'h1').textContent).toContain('Pre-check-in');
    expect(query(fixture, 'nav[aria-label="Migas de pan"]').textContent).toContain('CIT001');
    expect(query(fixture, '[aria-current="page"]').textContent).toContain('Pre-check-in');
    expect(query(fixture, '.ep__titulo-fila app-estado-cita').textContent).toContain('Pendiente');
  });

  it('exige la casilla «Mis datos son correctos» con explicación visible', async () => {
    expect(completar().disabled).toBe(true);
    expect(texto(fixture)).toContain('Marca «Mis datos son correctos» para continuar.');
    marcar(query<HTMLInputElement>(fixture, '#pci-datos-correctos'));
    await fixture.whenStable();
    expect(completar().disabled).toBe(false);
  });

  it('envía el pre-check-in con Idempotency-Key y vuelve al detalle', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const cache = TestBed.inject(CacheService);
    cache.guardar('citas:proximas', []);
    marcar(query<HTMLInputElement>(fixture, '#pci-datos-correctos'));
    await fixture.whenStable();
    completar().click();
    await fixture.whenStable();
    // Mientras envía: estado de carga sin cambiar el texto del botón.
    expect(completar().disabled).toBe(true);
    expect(completar().classList.contains('btn--cargando')).toBe(true);
    expect(query(fixture, '#pci-explicacion').getAttribute('role')).toBe('status');
    const req = http.expectOne({ method: 'POST', url: `${BASE}/pre-check-in` });
    expect(req.request.body).toEqual({
      versionAgenda: 4,
      email: PERFIL.email,
      telefono: PERFIL.telefono,
      datosCorrectos: true,
    });
    expect(req.request.headers.get(CABECERA_IDEMPOTENCIA)).toMatch(UUID_V4);
    req.flush(citaDetalle({ preCheckInCompletadoEn: '2026-11-03T23:00:00Z' }));
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/paciente/citas', 'c-1']);
    expect(cache.leer<{ preCheckInCompletadoEn: string }>('cita:c-1')?.preCheckInCompletadoEn).toBe(
      '2026-11-03T23:00:00Z',
    );
    expect(cache.leer('citas:proximas')).toBeUndefined();
    // El pre-check-in no modifica el perfil: lo guardado se conserva.
    expect(cache.leer('perfil')).toEqual(PERFIL);
  });

  it('muestra errores[] del servidor junto al campo', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    marcar(query<HTMLInputElement>(fixture, '#pci-datos-correctos'));
    await fixture.whenStable();
    completar().click();
    await fixture.whenStable();
    http.expectOne(`${BASE}/pre-check-in`).flush(
      problema(400, 'VALIDACION', {
        errores: [{ campo: 'telefono', mensaje: 'Teléfono inválido' }],
      }),
      opcionesProblema(400),
    );
    await fixture.whenStable();
    expect(query(fixture, '#pci-telefono-error').textContent).toContain('Teléfono inválido');
    expect(query(fixture, '#pci-telefono').getAttribute('aria-describedby')).toBe(
      'pci-telefono-ayuda pci-telefono-error',
    );
    expect(document.activeElement?.id).toBe('pci-telefono');
    soltar();
  });

  async function marcarYEnviar() {
    marcar(query<HTMLInputElement>(fixture, '#pci-datos-correctos'));
    await fixture.whenStable();
    completar().click();
    await fixture.whenStable();
  }

  it('respuesta perdida pero COMPLETADA: vuelve al detalle con el aviso de éxito', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await marcarYEnviar();
    const req = http.expectOne(`${BASE}/pre-check-in`);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(operacion({ clave, tipo: 'PRE_CHECK_IN' }));
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/paciente/citas', 'c-1']);
    expect(TestBed.inject(AvisoFlashService).consumir()?.texto).toContain(
      'Pre-check-in completado',
    );
  });

  it('respuesta perdida pero RECHAZADA: muestra el error y no declara éxito', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await marcarYEnviar();
    const req = http.expectOne(`${BASE}/pre-check-in`);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http.expectOne(`/api/v1/operaciones/${clave}`).flush(
      operacion({
        clave,
        tipo: 'PRE_CHECK_IN',
        estado: 'RECHAZADA',
        httpStatus: 422,
        codigoError: 'FUERA_DE_PLAZO',
      }),
    );
    await fixture.whenStable();
    expect(navegar).not.toHaveBeenCalled();
    expect(texto(fixture)).toContain('fuera del plazo');
  });

  it('si el usuario sale de la pantalla, la acción se cancela: no redirige ni deja un aviso', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await marcarYEnviar();
    const req = http.expectOne(`${BASE}/pre-check-in`);
    fixture.destroy();
    expect(req.cancelled).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
    expect(TestBed.inject(AvisoFlashService).consumir()).toBeNull();
  });
});

describe('PreCheckInComponent con datos guardados (stale-while-revalidate)', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<PreCheckInComponent>;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      imports: [PreCheckInComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const cache = TestBed.inject(CacheService);
    cache.guardar('cita:c-1', citaDetalle({ accionesPermitidas: ['PRE_CHECK_IN'], versionAgenda: 4 }));
    cache.guardar('perfil', PERFIL);
    fixture = TestBed.createComponent(PreCheckInComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('pinta al instante, prellena y actualiza el prellenado si el formulario no se tocó', async () => {
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBeNull();
    expect(query<HTMLInputElement>(fixture, '#pci-email').value).toBe(PERFIL.email);
    expect(boton(fixture, 'Completar pre-check-in')!.disabled).toBe(true);

    http.expectOne(BASE).flush(citaDetalle({ accionesPermitidas: ['PRE_CHECK_IN'], versionAgenda: 5 }));
    http.expectOne('/api/v1/pacientes/me/perfil').flush({ ...PERFIL, email: 'ana.nueva@ejemplo.invalid' });
    await fixture.whenStable();
    expect(query<HTMLInputElement>(fixture, '#pci-email').value).toBe('ana.nueva@ejemplo.invalid');
  });

  it('no pisa lo que la persona ya escribió cuando llega la versión fresca', async () => {
    escribir(query<HTMLInputElement>(fixture, '#pci-telefono'), '+51 911 222 333');
    query<HTMLInputElement>(fixture, '#pci-telefono').dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    http.expectOne(BASE).flush(citaDetalle({ accionesPermitidas: ['PRE_CHECK_IN'], versionAgenda: 5 }));
    http.expectOne('/api/v1/pacientes/me/perfil').flush({ ...PERFIL, telefono: '+51 999 999 999' });
    await fixture.whenStable();
    expect(query<HTMLInputElement>(fixture, '#pci-telefono').value).toBe('+51 911 222 333');

    marcar(query<HTMLInputElement>(fixture, '#pci-datos-correctos'));
    await fixture.whenStable();
    boton(fixture, 'Completar pre-check-in')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/pre-check-in`);
    expect(req.request.body).toEqual({
      versionAgenda: 5,
      email: PERFIL.email,
      telefono: '+51 911 222 333',
      datosCorrectos: true,
    });
    req.flush(problema(422, 'FUERA_DE_PLAZO'), opcionesProblema(422));
    await fixture.whenStable();
  });
});
