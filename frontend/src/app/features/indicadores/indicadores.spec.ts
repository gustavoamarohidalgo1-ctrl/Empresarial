import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { resumenIndicadores } from '../../../testing/indicadores-prueba';
import { boton, elegir } from '../../../testing/dom';
import { ResumenIndicadores } from '../../core/modelos/contrato';
import { hoyEnLima } from '../../shared/utils/fecha-lima';
import { IndicadoresComponent } from './indicadores';
import { resolverPreset } from './modelo/periodo';

const RESUMEN = '/api/v1/analitica/resumen';
const normalizar = (t: string | null | undefined) =>
  (t ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();

const SEDES = [{ codigo: 'SURCO', nombre: 'Sede Surco', direccion: 'Av. Primavera 123' }];
const ESPECIALIDADES = [{ codigo: 'CARDIO', nombre: 'Cardiología', descripcion: null }];
const PROFESIONALES = [
  {
    codigo: 'P02',
    nombre: 'Dra. Lucía Paredes',
    especialidad: { codigo: 'CARDIO', nombre: 'Cardiología' },
  },
];

describe('IndicadoresComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let host: HTMLElement;
  const HOY = hoyEnLima();

  async function abrir(url = '/indicadores', catalogos = true) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'indicadores', component: IndicadoresComponent }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, IndicadoresComponent);
    host = harness.routeNativeElement!;
    if (catalogos) {
      http.expectOne('/api/v1/catalogos/sedes').flush(SEDES);
      http.expectOne('/api/v1/catalogos/especialidades').flush(ESPECIALIDADES);
      http.expectOne((r) => r.url === '/api/v1/catalogos/profesionales').flush(PROFESIONALES);
    }
    await estable();
  }

  const estable = () => harness.fixture.whenStable();
  const solicitud = () => http.expectOne((r) => r.url === RESUMEN);
  async function responder(datos: ResumenIndicadores = resumenIndicadores()) {
    solicitud().flush(datos);
    await estable();
  }
  const seccion = () => host.querySelector<HTMLElement>('section.ind')!;
  const anuncio = () =>
    normalizar(host.querySelector('p.solo-lectores[role="status"]')?.textContent);

  afterEach(() => http.verify());

  it('primero muestra esqueletos del tamaño final y luego tarjetas, gráficos y metodología', async () => {
    await abrir();
    expect(seccion().getAttribute('aria-busy')).toBe('true');
    expect(host.textContent).toContain('Cargando los indicadores…');
    expect(host.querySelectorAll('app-tarjeta-indicador app-esqueleto').length).toBe(10);
    expect(host.querySelectorAll('.ind__esqueleto-grafico')).toHaveLength(3);

    await responder();
    expect(seccion().getAttribute('aria-busy')).toBe('false');
    const valores = Array.from(host.querySelectorAll('.ti__valor')).map((v) =>
      normalizar(v.textContent),
    );
    expect(valores).toEqual(['50.0 %', '8.3 %', '12.5 %', '15.0 %', '12.4 min']);
    expect(host.querySelector('app-grafico-dias')).not.toBeNull();
    expect(host.querySelector('app-grafico-estados')).not.toBeNull();
    expect(host.querySelector('app-grafico-especialidades')).not.toBeNull();

    const contexto = normalizar(host.querySelector('.ind__contexto')?.textContent);
    expect(contexto).toContain('Este mes');
    expect(contexto).toContain('120 citas');
    expect(contexto).toContain('Datos al 23 oct 2026, 09:00 · hora de Lima');
    expect(normalizar(host.querySelector('app-metodologia')?.textContent)).toContain(
      'Corte de los datos: 23 oct 2026, 09:00',
    );
    expect(anuncio()).toContain('Indicadores actualizados: 120 citas');
  });

  it('lee el filtro de la URL, lo envía a la API y el CSV usa el mismo filtro', async () => {
    await abrir('/indicadores?periodo=ultimos-7&sede=SURCO');
    const { desde, hasta } = resolverPreset('ultimos-7', HOY);
    const peticion = solicitud();
    expect(peticion.request.params.get('desde')).toBe(desde);
    expect(peticion.request.params.get('hasta')).toBe(hasta);
    expect(peticion.request.params.get('sede')).toBe('SURCO');
    peticion.flush(resumenIndicadores());
    await estable();

    const csv = Array.from(host.querySelectorAll('a')).find((a) =>
      a.textContent?.includes('Exportar CSV'),
    )!;
    expect(csv.getAttribute('href')).toBe(
      `/api/v1/analitica/resumen.csv?desde=${desde}&hasta=${hasta}&sede=SURCO`,
    );
    expect(csv.getAttribute('download')).toBe(`indicadores-${desde}_${hasta}.csv`);
    expect(host.querySelector<HTMLSelectElement>('#filtro-sede')!.value).toBe('SURCO');
    expect(host.querySelector<HTMLInputElement>('input[value="ultimos-7"]')!.checked).toBe(true);
  });

  it('al cambiar un filtro consulta de nuevo, conserva lo anterior atenuado y actualiza la URL', async () => {
    await abrir();
    await responder();

    elegir(host.querySelector<HTMLSelectElement>('#filtro-especialidad')!, 'CARDIO');
    await estable();
    const peticion = solicitud();
    expect(peticion.request.params.get('especialidad')).toBe('CARDIO');
    expect(host.querySelector('.ind__contenido--actualizando')).not.toBeNull();
    expect(host.querySelectorAll('.ti__valor')).toHaveLength(5);
    expect(normalizar(host.querySelector('.ind__meta')?.textContent)).toContain('Actualizando…');
    expect(TestBed.inject(Router).url).toBe('/indicadores?especialidad=CARDIO');

    peticion.flush(resumenIndicadores({ totalCitas: 50 }));
    await estable();
    expect(host.querySelector('.ind__contenido--actualizando')).toBeNull();
    expect(normalizar(host.querySelector('.ind__contexto')?.textContent)).toContain('50 citas');
  });

  it('navegar a otra URL (atrás o un enlace compartido) aplica su filtro', async () => {
    await abrir();
    await responder();
    await harness.navigateByUrl('/indicadores?periodo=mes-anterior');
    const { desde, hasta } = resolverPreset('mes-anterior', HOY);
    const peticion = solicitud();
    expect(peticion.request.params.get('desde')).toBe(desde);
    expect(peticion.request.params.get('hasta')).toBe(hasta);
    peticion.flush(resumenIndicadores());
    await estable();
    expect(normalizar(host.querySelector('.ind__titulo')?.textContent)).toContain('Mes anterior');
  });

  it('si falla muestra el error con «Reintentar» y el foco pasa al título de resultados', async () => {
    await abrir();
    solicitud().flush(
      { codigo: 'ERROR_INTERNO', requestId: 'abc123' },
      { status: 500, statusText: 'Error' },
    );
    await estable();
    const alerta = host.querySelector('[role="alert"]')!;
    expect(alerta.textContent).toContain('No pudimos cargar los indicadores');
    expect(alerta.textContent).toContain('abc123');
    expect(host.querySelector('app-tarjeta-indicador')).toBeNull();

    boton(harness.fixture, 'Reintentar')!.click();
    await estable();
    expect(document.activeElement?.id).toBe('ind-resultados-titulo');
    await responder();
    expect(host.querySelectorAll('app-tarjeta-indicador')).toHaveLength(5);
  });

  it('sin citas en el periodo muestra un estado vacío que propone el mes anterior', async () => {
    await abrir();
    await responder(resumenIndicadores({ totalCitas: 0, porDia: [], porEspecialidad: [] }));
    expect(host.textContent).toContain('No hay citas en este periodo');
    expect(host.querySelector('app-grafico-dias')).toBeNull();

    boton(harness.fixture, 'Ver el mes anterior')!.click();
    await estable();
    const { desde } = resolverPreset('mes-anterior', HOY);
    expect(solicitud().request.params.get('desde')).toBe(desde);
    expect(TestBed.inject(Router).url).toBe('/indicadores?periodo=mes-anterior');
  });

  it('con filtros, el estado vacío ofrece quitarlos', async () => {
    await abrir('/indicadores?sede=SURCO');
    await responder(resumenIndicadores({ totalCitas: 0 }));
    boton(harness.fixture, 'Quitar filtros')!.click();
    await estable();
    expect(solicitud().request.params.has('sede')).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/indicadores');
  });

  it('avisa si el enlace trae un periodo inválido y muestra el mes en curso', async () => {
    await abrir('/indicadores?periodo=personalizado&desde=2026-10-10&hasta=2026-10-01');
    expect(host.querySelector('app-aviso')?.textContent).toContain(
      'El periodo del enlace no es válido',
    );
    expect(solicitud().request.params.get('desde')).toBe(resolverPreset('este-mes', HOY).desde);
  });

  it('«Actualizar» vuelve a consultar con el mismo filtro (nuevo corte)', async () => {
    await abrir();
    await responder();
    boton(harness.fixture, 'Actualizar')!.click();
    await estable();
    solicitud().flush(resumenIndicadores({ corte: '2026-10-23T15:30:00Z' }));
    await estable();
    expect(normalizar(host.querySelector('.ind__contexto')?.textContent)).toContain(
      'Datos al 23 oct 2026, 10:30',
    );
  });

  it('si fallan los catálogos lo indica en los filtros y permite reintentar', async () => {
    await abrir('/indicadores', false);
    http
      .expectOne('/api/v1/catalogos/sedes')
      .flush(null, { status: 503, statusText: 'No disponible' });
    http.expectOne('/api/v1/catalogos/especialidades').flush(ESPECIALIDADES);
    http.expectOne((r) => r.url === '/api/v1/catalogos/profesionales').flush(PROFESIONALES);
    await responder();
    expect(host.querySelector('.fi__aviso')?.textContent).toContain('No pudimos cargar las listas');

    boton(harness.fixture, 'Reintentar')!.click();
    http.expectOne('/api/v1/catalogos/sedes').flush(SEDES);
    await estable();
    expect(host.querySelector('.fi__aviso')).toBeNull();
    expect(
      Array.from(host.querySelector<HTMLSelectElement>('#filtro-sede')!.options).map((o) =>
        o.text.trim(),
      ),
    ).toEqual(['Todas las sedes', 'Sede Surco']);
  });
});
