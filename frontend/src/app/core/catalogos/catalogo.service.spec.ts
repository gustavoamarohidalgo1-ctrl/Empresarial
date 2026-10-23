import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Motivo } from '../modelos/contrato';
import { CatalogoService } from './catalogo.service';

const URL = '/api/v1/catalogos/motivos';
const MOTIVOS: Motivo[] = [{ codigo: 'CAN-PERSONAL', descripcion: 'Compromiso personal' }];

describe('CatalogoService', () => {
  let http: HttpTestingController;
  let catalogo: CatalogoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    catalogo = TestBed.inject(CatalogoService);
  });

  afterEach(() => http.verify());

  it('pide los motivos por tipo una sola vez y luego los sirve desde memoria', () => {
    const recibidos: Motivo[][] = [];
    catalogo.motivos('CANCELACION').subscribe((m) => recibidos.push(m));
    const peticion = http.expectOne((r) => r.url === URL);
    expect(peticion.request.params.get('tipo')).toBe('CANCELACION');
    peticion.flush(MOTIVOS);

    catalogo.motivos('CANCELACION').subscribe((m) => recibidos.push(m));
    http.expectNone((r) => r.url === URL);
    expect(recibidos).toEqual([MOTIVOS, MOTIVOS]);
  });

  it('cada tipo tiene su propia entrada', () => {
    catalogo.motivos('CANCELACION').subscribe();
    http.expectOne((r) => r.params.get('tipo') === 'CANCELACION').flush(MOTIVOS);
    catalogo.motivos('REPROGRAMACION').subscribe();
    http.expectOne((r) => r.params.get('tipo') === 'REPROGRAMACION').flush([]);
  });

  it('si la petición falla, el siguiente intento vuelve a pedir', () => {
    catalogo.motivos('CANCELACION').subscribe({ error: () => undefined });
    http.expectOne((r) => r.url === URL).flush(null, { status: 500, statusText: 'Error' });
    catalogo.motivos('CANCELACION').subscribe();
    http.expectOne((r) => r.url === URL).flush(MOTIVOS);
  });
});
