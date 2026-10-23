import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { api } from '../../../core/http/api';
import { CorreoSimulado } from '../../../core/modelos/contrato';

/** `GET /dev/correos`: buzón del correo simulado (solo perfil `dev`; 404 en producción). */
@Injectable({ providedIn: 'root' })
export class BuzonApiService {
  private readonly http = inject(HttpClient);

  listar(): Observable<CorreoSimulado[]> {
    return this.http.get<CorreoSimulado[]>(api('/dev/correos'));
  }
}
