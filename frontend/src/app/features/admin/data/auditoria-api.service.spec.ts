import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { paginaAuditoria } from '../../../../testing/indicadores-prueba';
import { FILTRO_BITACORA_VACIO } from '../bitacora/filtro-bitacora';
import { AuditoriaApiService } from './auditoria-api.service';

describe('AuditoriaApiService', () => {
  let http: HttpTestingController;
  let api: AuditoriaApiService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AuditoriaApiService);
  });

  afterEach(() => http.verify());

  it('consulta GET /admin/auditoria con la página, el tamaño y solo los filtros elegidos', () => {
    let recibida: unknown;
    api
      .pagina({ ...FILTRO_BITACORA_VACIO, resultado: 'FALLO', usuario: 'ana@correo.pe', pagina: 2 })
      .subscribe((p) => (recibida = p));
    const peticion = http.expectOne((r) => r.url === '/api/v1/admin/auditoria');
    expect(peticion.request.method).toBe('GET');
    expect(peticion.request.params.keys().sort()).toEqual([
      'pagina',
      'resultado',
      'tamano',
      'usuario',
    ]);
    expect(peticion.request.params.get('pagina')).toBe('2');
    expect(peticion.request.params.get('usuario')).toBe('ana@correo.pe');
    const pagina = paginaAuditoria();
    peticion.flush(pagina);
    expect(recibida).toEqual(pagina);
  });
});
