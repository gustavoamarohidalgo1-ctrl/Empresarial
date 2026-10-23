import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { resumenIndicadores } from '../../../../testing/indicadores-prueba';
import { leerFiltro } from '../modelo/periodo';
import { IndicadoresApiService } from './indicadores-api.service';

const HOY = '2026-10-23';
const filtroDe = (p: Record<string, string>) => leerFiltro((n) => p[n] ?? null, HOY).filtro;

describe('IndicadoresApiService', () => {
  let http: HttpTestingController;
  let api: IndicadoresApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(IndicadoresApiService);
  });

  afterEach(() => http.verify());

  it('pide el resumen con las fechas y solo los códigos elegidos', () => {
    const filtro = filtroDe({ periodo: 'ultimos-7', sede: 'SURCO' });
    let recibido: unknown;
    api.resumen(filtro).subscribe((r) => (recibido = r));
    const peticion = http.expectOne((r) => r.url === '/api/v1/analitica/resumen');
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.keys().sort()).toEqual(['desde', 'hasta', 'sede']);
    expect(peticion.request.params.get('desde')).toBe('2026-10-17');
    expect(peticion.request.params.get('sede')).toBe('SURCO');
    const datos = resumenIndicadores();
    peticion.flush(datos);
    expect(recibido).toEqual(datos);
  });

  it('el enlace del CSV usa el mismo filtro', () => {
    const filtro = filtroDe({ desde: '2026-10-01', hasta: '2026-10-31', especialidad: 'CARDIO' });
    expect(api.urlCsv(filtro)).toBe(
      '/api/v1/analitica/resumen.csv?desde=2026-10-01&hasta=2026-10-31&especialidad=CARDIO',
    );
  });

  it('pide cada catálogo una sola vez por sesión', () => {
    api.sedes().subscribe();
    http
      .expectOne('/api/v1/catalogos/sedes')
      .flush([{ codigo: 'SURCO', nombre: 'Sede Surco', direccion: null }]);
    api.sedes().subscribe();
    http.expectNone('/api/v1/catalogos/sedes');

    api.especialidades().subscribe();
    http.expectOne('/api/v1/catalogos/especialidades').flush([]);
    api.profesionales().subscribe();
    const profesionales = http.expectOne((r) => r.url === '/api/v1/catalogos/profesionales');
    expect(profesionales.request.params.keys()).toEqual([]);
    profesionales.flush([]);
  });
});
