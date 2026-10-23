import { TestBed } from '@angular/core/testing';
import { CanMatchFn, Route, UrlSegment } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { InfoSistema } from '../modelos/contrato';
import { soloDesarrolloGuard } from './desarrollo.guard';
import { SistemaService } from './sistema.service';

describe('soloDesarrolloGuard', () => {
  async function coincide(info: InfoSistema | null): Promise<unknown> {
    TestBed.configureTestingModule({
      providers: [{ provide: SistemaService, useValue: { obtener: () => of(info) } }],
    });
    const resultado = TestBed.runInInjectionContext(() =>
      soloDesarrolloGuard({} as Route, [] as UrlSegment[], {} as Parameters<CanMatchFn>[2]),
    ) as Observable<boolean>;
    return firstValueFrom(resultado);
  }

  it('deja pasar solo si el servidor confirma el entorno de desarrollo', async () => {
    expect(await coincide({ nombre: 'SIGA-SP', version: '1.1.0', entorno: 'desarrollo' })).toBe(
      true,
    );
  });

  it('en producción, o si no se pudo consultar, la ruta no coincide (se ve la 404)', async () => {
    expect(await coincide({ nombre: 'SIGA-SP', version: '1.1.0', entorno: 'produccion' })).toBe(
      false,
    );
  });

  it('si /sistema/info falló, se trata como producción', async () => {
    expect(await coincide(null)).toBe(false);
  });
});
