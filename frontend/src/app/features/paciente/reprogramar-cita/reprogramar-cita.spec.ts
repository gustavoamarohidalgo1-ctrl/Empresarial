import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AvisoFlashService } from '../../../core/avisos/aviso-flash.service';
import { CacheService } from '../../../core/cache/cache.service';
import { CABECERA_IDEMPOTENCIA } from '../../../core/idempotencia/idempotencia.service';
import { HorarioDisponible } from '../../../core/modelos/contrato';
import {
  adjuntar,
  citaDetalle,
  opcionesProblema,
  operacion,
  problema,
} from '../../../../testing/datos-prueba';
import { boton, elegir, query, texto } from '../../../../testing/dom';
import { hoyEnLima, sumarDias } from '../../../shared/utils/fecha-lima';
import { ReprogramarCitaComponent, franjaDe } from './reprogramar-cita';

const BASE = '/api/v1/pacientes/me/citas/c-1';
const MOTIVOS = [{ codigo: 'REP-DISPONIBILIDAD', descripcion: 'Cambio de disponibilidad personal' }];

function horario(id: string, inicio: string, fin: string): HorarioDisponible {
  return {
    id,
    inicio,
    fin,
    sede: { codigo: 'SURCO', nombre: 'Sede de prueba Surco' },
    profesional: { codigo: 'P01', nombre: 'Profesional P01' },
  };
}

const HORARIOS = [
  horario('h-1', '2026-11-06T15:30:00Z', '2026-11-06T15:50:00Z'),
  horario('h-2', '2026-11-06T16:00:00Z', '2026-11-06T16:20:00Z'),
  horario('h-3', '2026-11-07T14:00:00Z', '2026-11-07T14:20:00Z'),
];

/** Día de Lima de cada horario de prueba (para elegir su chip). */
const DIA: Record<string, string> = { 'h-1': '2026-11-06', 'h-2': '2026-11-06', 'h-3': '2026-11-07' };

function configurar(): HttpTestingController {
  TestBed.configureTestingModule({
    imports: [ReprogramarCitaComponent],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  });
  return TestBed.inject(HttpTestingController);
}

async function elegirYRevisar(fixture: ComponentFixture<unknown>, idHorario = 'h-2') {
  query<HTMLInputElement>(fixture, `input[name="dia"][value="${DIA[idHorario]}"]`).click();
  await fixture.whenStable();
  query<HTMLInputElement>(fixture, `input[value="${idHorario}"]`).click();
  elegir(query<HTMLSelectElement>(fixture, '#motivo-reprogramacion'), 'REP-DISPONIBILIDAD');
  await fixture.whenStable();
  boton(fixture, 'Revisar el cambio')!.click();
  await fixture.whenStable();
}

describe('ReprogramarCitaComponent', () => {
  let fixture: ComponentFixture<ReprogramarCitaComponent>;
  let http: HttpTestingController;

  beforeEach(async () => {
    http = configurar();
    fixture = TestBed.createComponent(ReprogramarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    // Sin datos guardados: esqueleto con el estado anunciado.
    expect(query(fixture, '[aria-busy="true"]').textContent).toContain('Cargando la cita…');
    http.expectOne(BASE).flush(citaDetalle());
    http
      .expectOne(
        (r) => r.url === '/api/v1/catalogos/motivos' && r.params.get('tipo') === 'REPROGRAMACION',
      )
      .flush(MOTIVOS);
    const horarios = http.expectOne((r) => r.url === `${BASE}/horarios-disponibles`);
    expect(horarios.request.params.get('desde')).toBe(hoyEnLima());
    expect(horarios.request.params.get('hasta')).toBe(sumarDias(hoyEnLima(), 14));
    horarios.flush(HORARIOS);
    await fixture.whenStable();
  });

  afterEach(() => http.verify());

  it('el encabezado tiene el h1, migas hasta la cita y su estado junto al título', () => {
    expect(query(fixture, 'h1').textContent).toContain('Reprogramar cita');
    const migas = query(fixture, 'nav[aria-label="Migas de pan"]');
    expect(migas.textContent).toContain('Mis citas');
    expect(migas.textContent).toContain('CIT001');
    expect(query(fixture, '[aria-current="page"]').textContent).toContain('Reprogramar');
    expect(query(fixture, '.ep__titulo-fila app-estado-cita').textContent).toContain('Pendiente');
  });

  it('muestra un chip por día (hora de Lima) con el número de horarios libres', () => {
    const chips = Array.from(fixture.nativeElement.querySelectorAll('label.dia')) as HTMLElement[];
    expect(chips.map((c) => c.querySelector('.dia__titulo')!.textContent!.trim())).toEqual([
      'Viernes, 6 de noviembre de 2026,',
      'Sábado, 7 de noviembre de 2026,',
    ]);
    expect(
      chips.map((c) => c.querySelector('.chip__contador')!.textContent!.replace(/\s+/g, ' ').trim()),
    ).toEqual(['2 horarios libres', '1 horario libre']);
    // El primer día queda elegido y sus horas se ven en la rejilla.
    expect(query<HTMLInputElement>(fixture, 'input[name="dia"][value="2026-11-06"]').checked).toBe(
      true,
    );
    expect(query(fixture, '.horas legend').textContent).toContain('Viernes, 6 de noviembre de 2026');
    expect(texto(fixture)).toContain('10:30 – 10:50');
    expect(fixture.nativeElement.querySelector('input[value="h-3"]')).toBeNull();
  });

  it('al cambiar de día muestra sus horas y el resumen «de → a» conserva la elección', async () => {
    const resumen = () => query(fixture, '.resumen-cambio app-cambio-horario').textContent!;
    expect(resumen()).toContain('Horario actual');
    expect(resumen()).toContain('09:00');
    expect(resumen()).toContain('Elige un día y una hora');

    query<HTMLInputElement>(fixture, 'input[value="h-1"]').click();
    await fixture.whenStable();
    expect(resumen()).toContain('Nuevo horario');
    expect(resumen()).toContain('10:30');
    expect(resumen()).not.toContain('Elige un día y una hora');

    query<HTMLInputElement>(fixture, 'input[name="dia"][value="2026-11-07"]').click();
    await fixture.whenStable();
    expect(query(fixture, '.horas legend').textContent).toContain('Sábado, 7 de noviembre de 2026');
    expect(query<HTMLInputElement>(fixture, 'input[value="h-3"]').checked).toBe(false);
    expect(fixture.nativeElement.querySelector('input[value="h-1"]')).toBeNull();
    expect(resumen()).toContain('10:30');
  });

  it('las horas son radios nombrados dentro de un grupo por franja', () => {
    const franja = query(fixture, '.franja');
    expect(franja.getAttribute('role')).toBe('group');
    expect(franja.getAttribute('aria-label')).toBe('Mañana');
    const radio = query<HTMLInputElement>(fixture, 'input[value="h-1"]');
    expect(radio.type).toBe('radio');
    expect(radio.closest('label')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('10:30 – 10:50');
  });

  it('exige horario y motivo, y muestra un resumen antes de guardar', async () => {
    expect(boton(fixture, 'Revisar el cambio')!.disabled).toBe(true);
    expect(texto(fixture)).toContain('Para continuar, elige un nuevo horario y un motivo.');
    expect(query(fixture, 'label[for="motivo-reprogramacion"]').textContent).toContain('Motivo');
    await elegirYRevisar(fixture);
    const t = texto(fixture);
    expect(t).toContain('Revisa el cambio antes de guardar');
    expect(t).toContain('04 nov 2026, 09:00');
    expect(t).toContain('06 nov 2026, 11:00 – 11:20');
    expect(t).toContain('Cambio de disponibilidad personal');
    expect(boton(fixture, 'Guardar cambio')).toBeTruthy();
  });

  it('mientras guarda, el botón muestra el estado de carga sin cambiar su texto', async () => {
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await elegirYRevisar(fixture);
    const guardar = boton(fixture, 'Guardar cambio')!;
    guardar.click();
    await fixture.whenStable();
    expect(guardar.disabled).toBe(true);
    expect(guardar.classList.contains('btn--cargando')).toBe(true);
    expect(guardar.textContent!.trim()).toBe('Guardar cambio');
    expect(query(fixture, '#explicacion-guardando').getAttribute('role')).toBe('status');
    http.expectOne(`${BASE}/reprogramacion`).flush(citaDetalle({ versionAgenda: 2 }));
    await fixture.whenStable();
  });

  it('ante 409 HORARIO_NO_DISPONIBLE informa que se conserva el horario anterior y recarga los horarios', async () => {
    const soltar = adjuntar(fixture.nativeElement);
    await elegirYRevisar(fixture);
    boton(fixture, 'Guardar cambio')!.click();
    await fixture.whenStable();
    const req = http.expectOne({ method: 'POST', url: `${BASE}/reprogramacion` });
    expect(req.request.body).toEqual({
      versionAgenda: 1,
      horarioId: 'h-2',
      motivoCodigo: 'REP-DISPONIBILIDAD',
    });
    req.flush(problema(409, 'HORARIO_NO_DISPONIBLE'), opcionesProblema(409));
    await fixture.whenStable();

    http.expectOne((r) => r.url === `${BASE}/horarios-disponibles`).flush([HORARIOS[0]]);
    await fixture.whenStable();
    const t = texto(fixture);
    expect(t).toContain('Horario no disponible');
    expect(t).toContain('Se conserva tu horario anterior: 04 nov 2026, 09:00');
    expect(boton(fixture, 'Revisar el cambio')!.disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('input[value="h-2"]')).toBeNull();
    // El motivo elegido se sigue viendo seleccionado (estado y vista coherentes).
    expect(query<HTMLSelectElement>(fixture, '#motivo-reprogramacion').value).toBe(
      'REP-DISPONIBILIDAD',
    );
    expect(texto(fixture)).toContain('Para continuar, elige un nuevo horario.');
    // «Guardar cambio» desapareció (volvió a la elección): el foco va al aviso, no a <body>.
    const activo = document.activeElement as HTMLElement;
    expect(activo.classList.contains('foco-resultado')).toBe(true);
    expect(activo.textContent).toContain('Horario no disponible');
    soltar();
  });

  it('tras guardar vuelve al detalle con un aviso de éxito y actualiza la caché', async () => {
    const cache = TestBed.inject(CacheService);
    cache.guardar('citas:proximas', []);
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await elegirYRevisar(fixture, 'h-3');
    boton(fixture, 'Guardar cambio')!.click();
    await fixture.whenStable();
    const devuelta = citaDetalle({ inicio: '2026-11-07T14:00:00Z', versionAgenda: 2 });
    http.expectOne(`${BASE}/reprogramacion`).flush(devuelta);
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/paciente/citas', 'c-1']);
    expect(TestBed.inject(AvisoFlashService).consumir()?.texto).toContain('07 nov 2026, 09:00');
    // El detalle pintará la cita devuelta al instante; las listas se vuelven a pedir.
    expect(cache.leer('cita:c-1')).toEqual(devuelta);
    expect(cache.leer('citas:proximas')).toBeUndefined();
  });

  it('respuesta perdida pero COMPLETADA: vuelve al detalle con el aviso de éxito', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await elegirYRevisar(fixture, 'h-3');
    boton(fixture, 'Guardar cambio')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/reprogramacion`);
    const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
    req.error(new ProgressEvent('error'), { status: 0 });
    http
      .expectOne(`/api/v1/operaciones/${clave}`)
      .flush(operacion({ clave, tipo: 'REPROGRAMAR_CITA' }));
    await fixture.whenStable();
    expect(navegar).toHaveBeenCalledWith(['/paciente/citas', 'c-1']);
    expect(TestBed.inject(AvisoFlashService).consumir()?.texto).toContain('07 nov 2026, 09:00');
    // Sin la cita devuelta, el detalle no usa lo guardado: la pide de nuevo.
    expect(TestBed.inject(CacheService).leer('cita:c-1')).toBeUndefined();
  });

  it('si el usuario sale de la pantalla, la acción se cancela: no redirige ni deja un aviso', async () => {
    const navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await elegirYRevisar(fixture, 'h-3');
    boton(fixture, 'Guardar cambio')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/reprogramacion`);
    fixture.destroy();
    expect(req.cancelled).toBe(true);
    expect(navegar).not.toHaveBeenCalled();
    expect(TestBed.inject(AvisoFlashService).consumir()).toBeNull();
  });
});

describe('ReprogramarCitaComponent con la cita guardada (stale-while-revalidate)', () => {
  let http: HttpTestingController;

  afterEach(() => http.verify());

  it('pinta la cita al instante, sin esqueleto, y espera la versión fresca para guardar', async () => {
    http = configurar();
    const cache = TestBed.inject(CacheService);
    cache.guardar('cita:c-1', citaDetalle({ versionAgenda: 1 }));
    cache.guardar('catalogo:motivos:REPROGRAMACION', MOTIVOS);
    const fixture = TestBed.createComponent(ReprogramarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')?.textContent ?? '').not.toContain(
      'Cargando la cita',
    );
    expect(texto(fixture)).toContain('CIT001');
    const fresca = http.expectOne(BASE);
    http.expectOne((r) => r.url === `${BASE}/horarios-disponibles`).flush(HORARIOS);
    await fixture.whenStable();

    await elegirYRevisar(fixture);
    expect(boton(fixture, 'Guardar cambio')!.disabled).toBe(true);
    expect(texto(fixture)).toContain('Comprobando los datos más recientes de la cita…');

    fresca.flush(citaDetalle({ versionAgenda: 3 }));
    await fixture.whenStable();
    expect(boton(fixture, 'Guardar cambio')!.disabled).toBe(false);
    boton(fixture, 'Guardar cambio')!.click();
    await fixture.whenStable();
    const req = http.expectOne(`${BASE}/reprogramacion`);
    expect(req.request.body.versionAgenda).toBe(3);
    req.flush(problema(422, 'FUERA_DE_PLAZO'), opcionesProblema(422));
    await fixture.whenStable();
  });

  it('sin horarios libres muestra un estado vacío con un texto claro', async () => {
    http = configurar();
    const cache = TestBed.inject(CacheService);
    cache.guardar('cita:c-1', citaDetalle());
    cache.guardar('catalogo:motivos:REPROGRAMACION', MOTIVOS);
    const fixture = TestBed.createComponent(ReprogramarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    http.expectOne((r) => r.url === `${BASE}/horarios-disponibles`).flush([]);
    http.expectOne(BASE).flush(citaDetalle());
    await fixture.whenStable();
    const vacio = query(fixture, 'app-estado-vacio').textContent ?? '';
    expect(vacio).toContain('No hay horarios disponibles');
    expect(vacio).toContain('Vuelve a consultar más tarde.');
    expect(vacio).not.toMatch(/prueba/i);
  });

  it('si la cita ya no existe al revalidar, muestra «No encontramos esta cita»', async () => {
    http = configurar();
    const cache = TestBed.inject(CacheService);
    cache.guardar('cita:c-1', citaDetalle());
    cache.guardar('catalogo:motivos:REPROGRAMACION', MOTIVOS);
    const fixture = TestBed.createComponent(ReprogramarCitaComponent);
    fixture.componentRef.setInput('id', 'c-1');
    await fixture.whenStable();
    http.expectOne((r) => r.url === `${BASE}/horarios-disponibles`).flush([]);
    http.expectOne(BASE).flush(problema(404, 'CITA_NO_ENCONTRADA'), opcionesProblema(404));
    await fixture.whenStable();
    expect(texto(fixture)).toContain('No encontramos esta cita');
    expect(cache.leer('cita:c-1')).toBeUndefined();
  });
});

describe('franjaDe', () => {
  it('clasifica por la hora de Lima', () => {
    expect(franjaDe('2026-11-06T16:59:00Z')).toBe('Mañana'); // 11:59
    expect(franjaDe('2026-11-06T17:00:00Z')).toBe('Tarde'); // 12:00
    expect(franjaDe('2026-11-06T22:59:00Z')).toBe('Tarde'); // 17:59
    expect(franjaDe('2026-11-06T23:00:00Z')).toBe('Noche'); // 18:00
  });
});
