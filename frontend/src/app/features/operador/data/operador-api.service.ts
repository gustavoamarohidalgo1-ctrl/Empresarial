import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { api } from '../../../core/http/api';
import { CitaOperador, CuerpoTransicion } from '../../../core/modelos/contrato';

/** Endpoints del operador (`/operador/...`). */
@Injectable({ providedIn: 'root' })
export class OperadorApiService {
  private readonly http = inject(HttpClient);

  /** Citas del día local (`YYYY-MM-DD`) de los profesionales asignados al operador. */
  citasDelDia(fecha: string): Observable<CitaOperador[]> {
    return this.http.get<CitaOperador[]>(api('/operador/citas'), {
      params: new HttpParams().set('fecha', fecha),
    });
  }

  transicion(id: string, cuerpo: CuerpoTransicion, headers: HttpHeaders): Observable<CitaOperador> {
    return this.http.post<CitaOperador>(
      api(`/operador/citas/${encodeURIComponent(id)}/transiciones`),
      cuerpo,
      { headers },
    );
  }
}
