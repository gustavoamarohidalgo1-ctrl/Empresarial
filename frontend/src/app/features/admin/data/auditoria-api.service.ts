import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { api } from '../../../core/http/api';
import { PaginaAuditoria } from '../../../core/modelos/contrato';
import { FiltroBitacora, consultaBitacora } from '../bitacora/filtro-bitacora';

/**
 * `GET /admin/auditoria` (rol ADMINISTRADOR). Solo lectura: el contrato no tiene endpoints
 * de modificación. No se guarda en caché: la bitácora siempre se consulta fresca.
 */
@Injectable({ providedIn: 'root' })
export class AuditoriaApiService {
  private readonly http = inject(HttpClient);

  pagina(filtro: FiltroBitacora): Observable<PaginaAuditoria> {
    return this.http.get<PaginaAuditoria>(api('/admin/auditoria'), {
      params: new HttpParams({ fromObject: consultaBitacora(filtro) }),
    });
  }
}
