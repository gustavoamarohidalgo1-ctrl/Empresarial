import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CacheService } from '../cache/cache.service';
import { api } from '../http/api';
import { Motivo, TipoMotivo } from '../modelos/contrato';

/**
 * `GET /catalogos/motivos?tipo=…` (cualquier usuario autenticado).
 * Los motivos se guardan en memoria durante la sesión: se piden una sola vez por tipo.
 */
@Injectable({ providedIn: 'root' })
export class CatalogoService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(CacheService);

  motivos(tipo: TipoMotivo): Observable<Motivo[]> {
    return this.cache.obtener(`catalogo:motivos:${tipo}`, () =>
      this.http.get<Motivo[]>(api('/catalogos/motivos'), {
        params: new HttpParams().set('tipo', tipo),
      }),
    );
  }
}
