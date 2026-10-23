import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { InfoSistema } from '../modelos/contrato';
import { SistemaService } from './sistema.service';

const URL = '/api/v1/sistema/info';
const DESARROLLO: InfoSistema = { nombre: 'SIGA-SP', version: '1.1.0', entorno: 'desarrollo' };

describe('SistemaService', () => {
  let http: HttpTestingController;
  let sistema: SistemaService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    sistema = TestBed.inject(SistemaService);
  });

  afterEach(() => http.verify());

  it('consulta /sistema/info una sola vez (peticiones simultáneas comparten una) y lo guarda', () => {
    const recibidos: (InfoSistema | null)[] = [];
    sistema.obtener().subscribe((i) => recibidos.push(i));
    sistema.obtener().subscribe((i) => recibidos.push(i));
    http.expectOne(URL).flush(DESARROLLO);
    expect(recibidos).toEqual([DESARROLLO, DESARROLLO]);
    expect(sistema.info()).toEqual(DESARROLLO);
    expect(sistema.esDesarrollo()).toBe(true);

    sistema.cargar();
    http.expectNone(URL); // ya está en caché
  });

  it('en producción no marca desarrollo', () => {
    sistema.cargar();
    http.expectOne(URL).flush({ ...DESARROLLO, entorno: 'produccion' });
    expect(sistema.esDesarrollo()).toBe(false);
  });

  it('si falla, se asume producción y la siguiente llamada lo reintenta', () => {
    let resultado: InfoSistema | null | undefined;
    sistema.obtener().subscribe((i) => (resultado = i));
    http.expectOne(URL).flush(null, { status: 503, statusText: 'Unavailable' });
    expect(resultado).toBeNull();
    expect(sistema.esDesarrollo()).toBe(false);

    sistema.cargar();
    http.expectOne(URL).flush(DESARROLLO);
    expect(sistema.esDesarrollo()).toBe(true);
  });
});
