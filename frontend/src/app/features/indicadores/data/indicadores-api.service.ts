import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CacheService } from '../../../core/cache/cache.service';
import { api } from '../../../core/http/api';
import {
  Especialidad,
  ProfesionalCatalogo,
  ResumenIndicadores,
  SedeCatalogo,
} from '../../../core/modelos/contrato';
import { FiltroIndicadores, consultaApi } from '../modelo/periodo';

/** Claves de caché de los catálogos de los filtros (memoria de la sesión). */
export const CLAVES_CATALOGO = {
  sedes: 'indicadores:catalogo:sedes',
  especialidades: 'indicadores:catalogo:especialidades',
  profesionales: 'indicadores:catalogo:profesionales',
} as const;

/**
 * Endpoints del tablero de indicadores (roles RESPONSABLE y ADMINISTRADOR):
 * `GET /analitica/resumen`, `GET /analitica/resumen.csv` y los catálogos de los filtros.
 */
@Injectable({ providedIn: 'root' })
export class IndicadoresApiService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(CacheService);

  resumen(filtro: FiltroIndicadores): Observable<ResumenIndicadores> {
    return this.http.get<ResumenIndicadores>(api('/analitica/resumen'), {
      params: new HttpParams({ fromObject: consultaApi(filtro) }),
    });
  }

  /** Enlace de descarga del CSV con el mismo filtro (la cookie de sesión viaja sola). */
  urlCsv(filtro: FiltroIndicadores): string {
    const consulta = new HttpParams({ fromObject: consultaApi(filtro) }).toString();
    return `${api('/analitica/resumen.csv')}?${consulta}`;
  }

  sedes(): Observable<SedeCatalogo[]> {
    return this.cache.obtener(CLAVES_CATALOGO.sedes, () =>
      this.http.get<SedeCatalogo[]>(api('/catalogos/sedes')),
    );
  }

  especialidades(): Observable<Especialidad[]> {
    return this.cache.obtener(CLAVES_CATALOGO.especialidades, () =>
      this.http.get<Especialidad[]>(api('/catalogos/especialidades')),
    );
  }

  /** Todos los profesionales (se filtran por especialidad en el cliente). */
  profesionales(): Observable<ProfesionalCatalogo[]> {
    return this.cache.obtener(CLAVES_CATALOGO.profesionales, () =>
      this.http.get<ProfesionalCatalogo[]>(api('/catalogos/profesionales')),
    );
  }
}
