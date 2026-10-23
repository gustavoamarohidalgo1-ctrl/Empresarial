import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CacheService } from '../../../core/cache/cache.service';
import { CABECERA_IDEMPOTENCIA } from '../../../core/idempotencia/idempotencia.service';
import {
  Especialidad,
  HorarioReserva,
  ProfesionalCatalogo,
  SedeCatalogo,
} from '../../../core/modelos/contrato';
import { NotificacionesService } from '../../../core/notificaciones/notificaciones.service';
import {
  UUID_V4,
  adjuntar,
  citaDetalle,
  citaResumen,
  opcionesProblema,
  operacion,
  problema,
} from '../../../../testing/datos-prueba';
import { boton, enlace, escribir, query, texto } from '../../../../testing/dom';
import { ReservarCitaComponent, TEXTO_HORARIO_NO_DISPONIBLE, TEXTO_LIMITE_CITAS } from './reservar';

const ESPECIALIDADES: Especialidad[] = [
  {
    codigo: 'MED-GEN',
    nombre: 'Medicina general',
    descripcion: 'Evaluación integral y control preventivo',
  },
  { codigo: 'CARDIO', nombre: 'Cardiología', descripcion: 'Corazón y sistema circulatorio' },
  { codigo: 'DERMA', nombre: 'Dermatología', descripcion: 'Piel, cabello y uñas' },
];

const CARDIO = { codigo: 'CARDIO', nombre: 'Cardiología' };
const PROFESIONALES: ProfesionalCatalogo[] = [
  { codigo: 'P02', nombre: 'Dra. Lucía Paredes Rojas', especialidad: CARDIO },
  { codigo: 'P03', nombre: 'Dr. Martín Quispe Salazar', especialidad: CARDIO },
];

const SURCO = { codigo: 'SURCO', nombre: 'Sede Surco' };
const SAN_ISIDRO = { codigo: 'SAN-ISIDRO', nombre: 'Sede San Isidro' };
const SEDES: SedeCatalogo[] = [
  {
    codigo: 'SURCO',
    nombre: 'Sede Surco',
    direccion: 'Av. Caminos del Inca 1234, Santiago de Surco',
  },
  {
    codigo: 'SAN-ISIDRO',
    nombre: 'Sede San Isidro',
    direccion: 'Av. Javier Prado Este 456, San Isidro',
  },
];

function horario(
  horarioId: string,
  inicio: string,
  profesional: ProfesionalCatalogo,
  sede = SURCO,
): HorarioReserva {
  const fin = new Date(Date.parse(inicio) + 20 * 60_000).toISOString().replace('.000', '');
  return {
    horarioId,
    inicio,
    fin,
    profesional: { codigo: profesional.codigo, nombre: profesional.nombre },
    sede,
  };
}

/** «Hoy» es el viernes 23 de octubre de 2026 a las 10:00 de Lima. */
const AHORA = '2026-10-23T15:00:00Z';
const [P02, P03] = PROFESIONALES;
const HORARIOS: HorarioReserva[] = [
  horario('h-1', '2026-10-26T14:00:00Z', P02), // lun 26 · 09:00
  horario('h-2', '2026-10-26T14:20:00Z', P03, SAN_ISIDRO), // lun 26 · 09:20
  horario('h-3', '2026-10-27T19:00:00Z', P02), // mar 27 · 14:00
  horario('h-4', '2026-10-27T23:30:00Z', P03, SAN_ISIDRO), // mar 27 · 18:30
];

const URL_DISPONIBILIDAD = '/api/v1/pacientes/me/disponibilidad';
const URL_CITAS = '/api/v1/pacientes/me/citas';

describe('ReservarCitaComponent', () => {
  let fixture: ComponentFixture<ReservarCitaComponent>;
  let http: HttpTestingController;
  let soltar: () => void = () => undefined;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(AHORA));
    TestBed.configureTestingModule({
      imports: [ReservarCitaComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    soltar();
    http.verify();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function titulo(): string {
    return query(fixture, '#titulo-paso').textContent!.replace(/\s+/g, ' ').trim();
  }

  async function estable(): Promise<void> {
    await fixture.whenStable();
  }

  async function iniciar(especialidad?: string): Promise<void> {
    fixture = TestBed.createComponent(ReservarCitaComponent);
    soltar = adjuntar(fixture.nativeElement);
    if (especialidad) fixture.componentRef.setInput('especialidad', especialidad);
    await estable();
    http.expectOne('/api/v1/catalogos/especialidades').flush(ESPECIALIDADES);
    await estable();
  }

  function disponibilidad(profesional: string | null = null) {
    return http.expectOne(
      (r) =>
        r.url === URL_DISPONIBILIDAD &&
        r.params.get('especialidad') === 'CARDIO' &&
        r.params.get('profesional') === profesional,
    );
  }

  async function continuar(): Promise<void> {
    boton(fixture, 'Continuar')!.click();
    await estable();
  }

  async function elegir(selector: string): Promise<void> {
    query<HTMLInputElement>(fixture, selector).click();
    await estable();
  }

  async function irAPaso2(): Promise<void> {
    await elegir('input[name="especialidad"][value="CARDIO"]');
    await continuar();
    http
      .expectOne(
        (r) =>
          r.url === '/api/v1/catalogos/profesionales' && r.params.get('especialidad') === 'CARDIO',
      )
      .flush(PROFESIONALES);
    const general = disponibilidad();
    expect(general.request.params.get('desde')).toBe('2026-10-23');
    expect(general.request.params.get('hasta')).toBe('2026-11-05');
    general.flush(HORARIOS);
    await estable();
  }

  /** Llega al paso 3 con «Cualquier profesional» (reutiliza la disponibilidad del paso 2). */
  async function irAPaso3(): Promise<void> {
    await irAPaso2();
    await continuar();
  }

  async function irAPaso4(idHorario = 'h-1'): Promise<void> {
    await irAPaso3();
    if (idHorario === 'h-3') await elegir('input[name="dia-reserva"][value="2026-10-27"]');
    await elegir(`input[name="horario-reserva"][value="${idHorario}"]`);
    await continuar();
    http.expectOne('/api/v1/catalogos/sedes').flush(SEDES);
    await estable();
  }

  async function confirmar() {
    boton(fixture, 'Confirmar reserva')!.click();
    await estable();
    return http.expectOne({ method: 'POST', url: URL_CITAS });
  }

  describe('paso 1 · especialidad', () => {
    it('muestra el progreso «Paso 1 de 4» y tarjetas con nombre y descripción', async () => {
      await iniciar();
      expect(query(fixture, 'h1').textContent).toContain('Reservar cita');
      const progreso = query(fixture, 'nav[aria-label="Progreso de la reserva"]');
      expect(progreso.textContent!.replace(/\s+/g, ' ')).toContain('Paso 1 de 4');
      expect(query(fixture, '[aria-current="step"]').textContent).toContain('Especialidad');
      expect(titulo()).toBe('Paso 1 de 4: ¿Qué especialidad necesitas?');

      const nombres = Array.from(el().querySelectorAll('.opcion__nombre')).map(
        (n) => n.textContent,
      );
      expect(nombres).toEqual(['Cardiología', 'Dermatología', 'Medicina general']);
      expect(texto(fixture)).toContain('Corazón y sistema circulatorio');
      expect(el().querySelectorAll('input[name="especialidad"][type="radio"]').length).toBe(3);
    });

    it('sin elegir, «Continuar» está deshabilitado y explica por qué', async () => {
      await iniciar();
      const continuarBtn = boton(fixture, 'Continuar')!;
      expect(continuarBtn.disabled).toBe(true);
      expect(continuarBtn.getAttribute('aria-describedby')).toBe('explicacion-continuar');
      expect(query(fixture, '#explicacion-continuar').textContent).toContain(
        'Elige una especialidad para continuar.',
      );
      await elegir('input[value="CARDIO"]');
      expect(boton(fixture, 'Continuar')!.disabled).toBe(false);
    });

    it('busca sin distinguir tildes y anuncia el resultado', async () => {
      await iniciar();
      escribir(query<HTMLInputElement>(fixture, '#buscar-especialidad'), 'cardiologia');
      await estable();
      const nombres = Array.from(el().querySelectorAll('.opcion__nombre')).map(
        (n) => n.textContent,
      );
      expect(nombres).toEqual(['Cardiología']);
      expect(texto(fixture)).toContain('1 especialidad coincide.');

      escribir(query<HTMLInputElement>(fixture, '#buscar-especialidad'), 'xyz');
      await estable();
      expect(texto(fixture)).toContain('No encontramos esa especialidad');
      boton(fixture, 'Limpiar búsqueda')!.click();
      await estable();
      expect(el().querySelectorAll('.opcion__nombre').length).toBe(3);
      expect(document.activeElement?.id).toBe('buscar-especialidad');
    });

    it('con ?especialidad=CODE queda preseleccionada', async () => {
      await iniciar('cardio');
      expect(query<HTMLInputElement>(fixture, 'input[value="CARDIO"]').checked).toBe(true);
      expect(boton(fixture, 'Continuar')!.disabled).toBe(false);
      expect(texto(fixture)).toContain('Tu reserva');
    });

    it('ignora un código de especialidad que no existe', async () => {
      await iniciar('NO-EXISTE');
      expect(el().querySelector('input[name="especialidad"]:checked')).toBeNull();
    });

    it('si el catálogo falla, muestra el error y permite reintentar', async () => {
      fixture = TestBed.createComponent(ReservarCitaComponent);
      await estable();
      expect(query(fixture, '[aria-busy="true"]').textContent).toContain(
        'Cargando especialidades…',
      );
      http
        .expectOne('/api/v1/catalogos/especialidades')
        .flush(problema(500, 'ERROR_INTERNO'), opcionesProblema(500));
      await estable();
      expect(texto(fixture)).toContain('No pudimos cargar las especialidades');
      boton(fixture, 'Reintentar')!.click();
      await estable();
      http.expectOne('/api/v1/catalogos/especialidades').flush(ESPECIALIDADES);
      await estable();
      expect(el().querySelectorAll('.opcion').length).toBe(3);
    });
  });

  describe('paso 2 · profesional', () => {
    it('recomienda «Cualquier profesional» y muestra la sede y el próximo horario de cada uno', async () => {
      await iniciar();
      await irAPaso2();
      expect(titulo()).toContain('Paso 2 de 4');
      expect(document.activeElement?.id).toBe('titulo-paso');
      const opciones = Array.from(
        el().querySelectorAll<HTMLElement>('app-paso-profesional .opcion'),
      );
      expect(opciones.length).toBe(3);
      expect(opciones[0].textContent).toContain('Cualquier profesional disponible');
      expect(opciones[0].textContent).toContain('Recomendado');
      expect(opciones[0].textContent).toContain('4 horarios libres');
      expect(query<HTMLInputElement>(fixture, 'input[name="profesional"][value="*"]').checked).toBe(
        true,
      );

      expect(opciones[1].textContent).toContain('Dra. Lucía Paredes Rojas');
      expect(opciones[1].textContent).toContain('Sede Surco');
      expect(opciones[1].textContent).toContain('Próximo horario: en 3 días, 09:00');
      expect(opciones[2].textContent).toContain('Sede San Isidro');
    });

    it('el paso completado del progreso permite volver a él', async () => {
      await iniciar();
      await irAPaso2();
      const volver = boton(fixture, /Especialidad: completado/)!;
      volver.click();
      await estable();
      expect(titulo()).toContain('Paso 1 de 4');
      expect(query<HTMLInputElement>(fixture, 'input[value="CARDIO"]').checked).toBe(true);
    });
  });

  describe('paso 3 · fecha y hora', () => {
    it('con «Cualquiera» reutiliza la disponibilidad y muestra profesional y sede por horario', async () => {
      await iniciar();
      await irAPaso3();
      expect(titulo()).toContain('Paso 3 de 4');
      const chips = Array.from(el().querySelectorAll<HTMLElement>('label.dia'));
      expect(chips.map((c) => c.querySelector('.dia__titulo')!.textContent!.trim())).toEqual([
        'Lunes, 26 de octubre de 2026,',
        'Martes, 27 de octubre de 2026,',
      ]);
      expect(
        chips.map((c) =>
          c.querySelector('.chip__contador')!.textContent!.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual(['2 horarios libres', '2 horarios libres']);

      const hora = query(fixture, 'input[value="h-1"]').closest('label')!;
      expect(hora.textContent!.replace(/\s+/g, ' ').trim()).toBe(
        '09:00 – 09:20, con Dra. Lucía Paredes Rojas, en Sede Surco',
      );
      expect(query(fixture, '.franja').getAttribute('aria-label')).toBe('Mañana');
      // Hay dos sedes: se puede filtrar por sede.
      expect(el().querySelectorAll('[aria-label="Filtrar por sede"] .chip').length).toBe(3);
    });

    it('agrupa por mañana, tarde y noche y filtra por sede', async () => {
      await iniciar();
      await irAPaso3();
      await elegir('input[name="dia-reserva"][value="2026-10-27"]');
      const franjas = Array.from(el().querySelectorAll('.franja')).map((f) =>
        f.getAttribute('aria-label'),
      );
      expect(franjas).toEqual(['Tarde', 'Noche']);

      const sanIsidro = Array.from(
        el().querySelectorAll<HTMLButtonElement>('[aria-label="Filtrar por sede"] .chip'),
      ).find((b) => b.textContent!.includes('San Isidro'))!;
      sanIsidro.click();
      await estable();
      expect(sanIsidro.getAttribute('aria-pressed')).toBe('true');
      expect(el().querySelector('input[value="h-1"]')).toBeNull();
      expect(el().querySelector('input[value="h-2"]')).toBeTruthy();
    });

    it('con un profesional pide solo sus horarios; sin horarios ofrece otras fechas u otro profesional', async () => {
      await iniciar();
      await irAPaso2();
      await elegir('input[name="profesional"][value="P02"]');
      await continuar();
      disponibilidad('P02').flush([]);
      await estable();
      expect(texto(fixture)).toContain('No hay horarios en estas fechas');
      expect(texto(fixture)).toContain('Busca en otras fechas o elige otro profesional.');

      boton(fixture, /Ver fechas siguientes/)!.click();
      await estable();
      const siguiente = disponibilidad('P02');
      expect(siguiente.request.params.get('desde')).toBe('2026-11-06');
      expect(siguiente.request.params.get('hasta')).toBe('2026-11-19');
      siguiente.flush([horario('h-9', '2026-11-09T15:00:00Z', P02)]);
      await estable();
      expect(texto(fixture)).toContain('Lunes, 9 de noviembre de 2026');
      // Sin «Cualquiera», cada hora muestra solo su horario.
      const hora = query(fixture, 'input[value="h-9"]').closest('label')!;
      expect(hora.textContent!.replace(/\s+/g, ' ').trim()).toBe('10:00 – 10:20');

      // De vuelta a las primeras fechas: se reutiliza lo consultado hace un momento.
      boton(fixture, 'Anteriores')!.click();
      await estable();
      expect(texto(fixture)).toContain('No hay horarios en estas fechas');
      boton(fixture, /Cambiar profesional/)!.click();
      await estable();
      expect(titulo()).toContain('Paso 2 de 4');
    });

    it('recuerda con una nota discreta la anticipación mínima de 2 horas', async () => {
      await iniciar();
      await irAPaso3();
      const nota = query(fixture, 'app-paso-horario .nota-anticipacion');
      expect(nota.textContent!.trim()).toBe(
        'Puedes reservar con al menos 2 horas de anticipación.',
      );
      // El icono es decorativo: la nota se lee solo como texto.
      expect(nota.querySelector('app-icono')?.getAttribute('aria-hidden')).toBe('true');
    });

    it('«Anteriores» no permite ir antes de hoy', async () => {
      await iniciar();
      await irAPaso3();
      const anteriores = boton(fixture, 'Anteriores')!;
      expect(anteriores.disabled).toBe(true);
      expect(texto(fixture)).toContain('del 23 oct 2026 al 05 nov 2026');
    });

    it('exige elegir una hora para continuar', async () => {
      await iniciar();
      await irAPaso3();
      expect(boton(fixture, 'Continuar')!.disabled).toBe(true);
      expect(texto(fixture)).toContain('Elige un día y una hora para continuar.');
      await elegir('input[value="h-2"]');
      expect(boton(fixture, 'Continuar')!.disabled).toBe(false);
      expect(query(fixture, 'aside.resumen').textContent).toContain('26 oct 2026, 09:20');
    });
  });

  describe('paso 4 · revisar y confirmar', () => {
    it('resume fecha, especialidad, profesional, sede con dirección y hora de Lima', async () => {
      await iniciar();
      await irAPaso4('h-3');
      expect(titulo()).toBe('Paso 4 de 4: Revisa y confirma tu cita');
      const t = texto(fixture);
      expect(t).toContain('Martes, 27 de octubre de 2026');
      expect(t).toContain('14:00');
      expect(t).toContain('Cardiología');
      expect(t).toContain('Dra. Lucía Paredes Rojas');
      expect(t).toContain('Asignado según el horario que elegiste');
      expect(t).toContain('Av. Caminos del Inca 1234, Santiago de Surco');
      expect(t).toContain('Hora de Lima');
      expect(t).toContain('podrás confirmarla, reprogramarla o cancelarla');
      expect(query(fixture, 'app-paso-confirmar app-ficha-fecha')).toBeTruthy();
    });

    it('volver atrás conserva todo lo elegido', async () => {
      await iniciar();
      await irAPaso4('h-3');
      boton(fixture, 'Atrás')!.click();
      await estable();
      expect(titulo()).toContain('Paso 3 de 4');
      expect(query<HTMLInputElement>(fixture, 'input[value="h-3"]').checked).toBe(true);
      boton(fixture, 'Atrás')!.click();
      await estable();
      expect(query<HTMLInputElement>(fixture, 'input[name="profesional"][value="*"]').checked).toBe(
        true,
      );
      boton(fixture, 'Atrás')!.click();
      await estable();
      expect(query<HTMLInputElement>(fixture, 'input[value="CARDIO"]').checked).toBe(true);

      // Hacia adelante de nuevo: los catálogos y la disponibilidad se reutilizan.
      await continuar();
      await continuar();
      expect(query<HTMLInputElement>(fixture, 'input[value="h-3"]').checked).toBe(true);
      await continuar();
      expect(titulo()).toContain('Paso 4 de 4');
    });

    it('201 → éxito con el código, enlaces, caché invalidada y contador de notificaciones', async () => {
      const cache = TestBed.inject(CacheService);
      cache.guardar('citas:proximas', [citaResumen()]);
      // El aviso «Reserva registrada» llega por un oyente asíncrono: ahora y a los 2,5 s.
      const refrescar = vi
        .spyOn(TestBed.inject(NotificacionesService), 'refrescarTrasAccion')
        .mockImplementation(() => undefined);
      await iniciar();
      await irAPaso4();

      const req = await confirmar();
      expect(req.request.body).toEqual({ horarioId: 'h-1', especialidadCodigo: 'CARDIO' });
      expect(req.request.headers.get(CABECERA_IDEMPOTENCIA)).toMatch(UUID_V4);
      const botonConfirmar = boton(fixture, 'Confirmar reserva')!;
      expect(botonConfirmar.classList.contains('btn--cargando')).toBe(true);
      expect(botonConfirmar.getAttribute('aria-disabled')).toBe('true');
      expect(texto(fixture)).toContain('Reservando tu cita.');

      req.flush(citaDetalle({ id: 'c-9', codigo: 'SP-2026-000124' }), {
        status: 201,
        statusText: 'Created',
      });
      await estable();

      expect(texto(fixture)).toContain('Tu cita está reservada');
      expect(query(fixture, '.codigo__valor').textContent).toBe('SP-2026-000124');
      expect(enlace(fixture, 'Ver mi cita')!.getAttribute('href')).toBe('/paciente/citas/c-9');
      expect(enlace(fixture, 'Volver a mis citas')!.getAttribute('href')).toBe('/paciente/citas');
      expect(document.activeElement?.id).toBe('titulo-exito');
      expect(el().querySelector('app-progreso-reserva')).toBeNull();
      expect(cache.leer('citas:proximas')).toBeUndefined();
      expect(cache.leer('cita:c-9')).toBeTruthy();
      expect(refrescar).toHaveBeenCalledTimes(1);
    });

    it('409 HORARIO_NO_DISPONIBLE → vuelve al paso 3 con el aviso y los horarios recargados', async () => {
      await iniciar();
      await irAPaso4();
      (await confirmar()).flush(problema(409, 'HORARIO_NO_DISPONIBLE'), opcionesProblema(409));
      await estable();

      // La disponibilidad se vuelve a pedir (no se usa la guardada).
      disponibilidad().flush(HORARIOS.slice(1));
      await estable();
      expect(titulo()).toContain('Paso 3 de 4');
      expect(texto(fixture)).toContain('Ese horario ya no está disponible');
      expect(texto(fixture)).toContain(TEXTO_HORARIO_NO_DISPONIBLE);
      expect(el().querySelector('input[value="h-1"]')).toBeNull();
      expect(boton(fixture, 'Continuar')!.disabled).toBe(true);
      const activo = document.activeElement as HTMLElement;
      expect(activo.classList.contains('foco-resultado')).toBe(true);
      expect(activo.textContent).toContain('Ese horario ya no está disponible');
    });

    it('409 HORARIO_NO_DISPONIBLE por anticipación → muestra el motivo del servidor', async () => {
      const detalle =
        'Las citas se reservan con al menos 2 horas de anticipación. Elige un horario desde el 23/10/2026 12:00.';
      await iniciar();
      await irAPaso4();
      (await confirmar()).flush(
        problema(409, 'HORARIO_NO_DISPONIBLE', { detail: detalle }),
        opcionesProblema(409),
      );
      await estable();
      disponibilidad().flush(HORARIOS.slice(1));
      await estable();
      const aviso = query(fixture, '.paso__aviso');
      expect(aviso.textContent).toContain('Ese horario ya no está disponible');
      expect(aviso.textContent).toContain(detalle);
      expect(aviso.textContent).not.toContain('Otra persona');
      expect(titulo()).toContain('Paso 3 de 4');
    });

    it('422 LIMITE_CITAS sin detalle → texto general con enlace a Mis citas', async () => {
      await iniciar();
      await irAPaso4();
      (await confirmar()).flush(problema(422, 'LIMITE_CITAS'), opcionesProblema(422));
      await estable();
      const t = texto(fixture);
      expect(t).toContain('No puedes reservar esta cita');
      expect(t).toContain(TEXTO_LIMITE_CITAS);
      expect(t).toContain('hasta 5 citas activas');
      expect(enlace(fixture, 'Ir a Mis citas')!.getAttribute('href')).toBe('/paciente/citas');
      expect(titulo()).toContain('Paso 4 de 4');
      expect((document.activeElement as HTMLElement).textContent).toContain(
        'No puedes reservar esta cita',
      );

      boton(fixture, /Elegir otra fecha u hora/)!.click();
      await estable();
      disponibilidad().flush(HORARIOS);
      await estable();
      expect(titulo()).toContain('Paso 3 de 4');
    });

    it.each([
      'Ya tienes 5 citas activas. Para reservar otra, cancela alguna o espera a que se complete.',
      'Ya tienes una cita de Cardiología el lunes 26 de octubre. Solo se permite una por especialidad y día.',
      'Ya tienes una cita que se cruza con este horario. Elige otra hora.',
    ])(
      '422 LIMITE_CITAS con detalle → muestra el motivo concreto del servidor: %s',
      async (detalle) => {
        await iniciar();
        await irAPaso4();
        (await confirmar()).flush(
          problema(422, 'LIMITE_CITAS', { detail: detalle }),
          opcionesProblema(422),
        );
        await estable();
        const aviso = query(fixture, '.paso__aviso');
        expect(aviso.textContent).toContain('No puedes reservar esta cita');
        expect(aviso.textContent).toContain(detalle);
        expect(aviso.textContent).not.toContain(TEXTO_LIMITE_CITAS);
        expect(enlace(fixture, 'Ir a Mis citas')).toBeTruthy();
        expect(boton(fixture, /Elegir otra fecha u hora/)).toBeTruthy();
      },
    );

    it('422 LIMITE_CITAS conocido por /operaciones (sin detalle) → texto general', async () => {
      await iniciar();
      await irAPaso4();
      const req = await confirmar();
      const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await estable();
      http.expectOne(`/api/v1/operaciones/${clave}`).flush(
        operacion({
          clave,
          tipo: 'CITA_RESERVAR',
          recursoId: '',
          estado: 'RECHAZADA',
          httpStatus: 422,
          codigoError: 'LIMITE_CITAS',
        }),
      );
      await estable();
      const aviso = query(fixture, '.paso__aviso');
      expect(aviso.textContent).toContain('No puedes reservar esta cita');
      expect(aviso.textContent).toContain(TEXTO_LIMITE_CITAS);
      expect(enlace(fixture, 'Ir a Mis citas')).toBeTruthy();
    });

    it('respuesta perdida y operación completada → éxito, pidiendo la cita para su código', async () => {
      await iniciar();
      await irAPaso4();
      const req = await confirmar();
      const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await estable();
      http
        .expectOne(`/api/v1/operaciones/${clave}`)
        .flush(operacion({ clave, tipo: 'CITA_RESERVAR', recursoId: 'c-9', httpStatus: 201 }));
      await estable();
      expect(texto(fixture)).toContain('Tu cita está reservada');
      expect(texto(fixture)).toContain('Obteniendo el código de la cita');

      http
        .expectOne(`${URL_CITAS}/c-9`)
        .flush(citaDetalle({ id: 'c-9', codigo: 'SP-2026-000125' }));
      await estable();
      expect(query(fixture, '.codigo__valor').textContent).toBe('SP-2026-000125');
      expect(enlace(fixture, 'Ver mi cita')!.getAttribute('href')).toBe('/paciente/citas/c-9');
    });

    it('respuesta perdida y operación no registrada → «Reintentar» con la misma clave', async () => {
      await iniciar();
      await irAPaso4();
      const req = await confirmar();
      const clave = req.request.headers.get(CABECERA_IDEMPOTENCIA)!;
      req.error(new ProgressEvent('error'), { status: 0, statusText: 'Unknown Error' });
      await estable();
      http
        .expectOne(`/api/v1/operaciones/${clave}`)
        .flush(problema(404, 'RECURSO_NO_ENCONTRADO'), opcionesProblema(404));
      await estable();
      expect(texto(fixture)).toContain('La operación no se registró');

      boton(fixture, 'Reintentar')!.click();
      await estable();
      const reintento = http.expectOne({ method: 'POST', url: URL_CITAS });
      expect(reintento.request.headers.get(CABECERA_IDEMPOTENCIA)).toBe(clave);
      reintento.flush(citaDetalle({ id: 'c-9', codigo: 'SP-2026-000124' }), {
        status: 201,
        statusText: 'Created',
      });
      await estable();
      expect(texto(fixture)).toContain('Tu cita está reservada');
    });

    it('otro rechazo (400) ofrece elegir otro horario', async () => {
      await iniciar();
      await irAPaso4();
      (await confirmar()).flush(
        problema(400, 'VALIDACION', {
          detail: 'La especialidad no coincide con la del profesional.',
        }),
        opcionesProblema(400),
      );
      await estable();
      expect(texto(fixture)).toContain('No pudimos reservar la cita');
      expect(texto(fixture)).toContain('La especialidad no coincide con la del profesional.');
      expect(boton(fixture, /Elegir otra fecha u hora/)).toBeTruthy();
    });
  });
});
