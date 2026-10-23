import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { api } from '../../../core/http/api';
import {
  ActualizacionPerfil,
  AlcanceCitas,
  CitaDetalle,
  CitaResumen,
  CuerpoCancelacion,
  CuerpoConfirmacion,
  CuerpoLlegada,
  CuerpoPreCheckIn,
  CuerpoReprogramacion,
  EventoLineaTiempo,
  HorarioDisponible,
  PerfilPaciente,
} from '../../../core/modelos/contrato';

/**
 * Endpoints del paciente (`/pacientes/me/...`). Nunca envían el ID del paciente:
 * el servidor usa la identidad de la sesión.
 * Las acciones reciben las cabeceras con `Idempotency-Key` desde `IdempotenciaService`.
 */
@Injectable({ providedIn: 'root' })
export class PacienteApiService {
  private readonly http = inject(HttpClient);

  private cita(id: string, sufijo = ''): string {
    return api(`/pacientes/me/citas/${encodeURIComponent(id)}${sufijo}`);
  }

  listarCitas(alcance: AlcanceCitas): Observable<CitaResumen[]> {
    return this.http.get<CitaResumen[]>(api('/pacientes/me/citas'), {
      params: new HttpParams().set('alcance', alcance),
    });
  }

  obtenerCita(id: string): Observable<CitaDetalle> {
    return this.http.get<CitaDetalle>(this.cita(id));
  }

  lineaTiempo(id: string): Observable<EventoLineaTiempo[]> {
    return this.http.get<EventoLineaTiempo[]>(this.cita(id, '/linea-tiempo'));
  }

  horariosDisponibles(id: string, desde: string, hasta: string): Observable<HorarioDisponible[]> {
    return this.http.get<HorarioDisponible[]>(this.cita(id, '/horarios-disponibles'), {
      params: new HttpParams().set('desde', desde).set('hasta', hasta),
    });
  }

  confirmar(id: string, cuerpo: CuerpoConfirmacion, headers: HttpHeaders): Observable<CitaDetalle> {
    return this.http.post<CitaDetalle>(this.cita(id, '/confirmacion'), cuerpo, { headers });
  }

  cancelar(id: string, cuerpo: CuerpoCancelacion, headers: HttpHeaders): Observable<CitaDetalle> {
    return this.http.post<CitaDetalle>(this.cita(id, '/cancelacion'), cuerpo, { headers });
  }

  reprogramar(
    id: string,
    cuerpo: CuerpoReprogramacion,
    headers: HttpHeaders,
  ): Observable<CitaDetalle> {
    return this.http.post<CitaDetalle>(this.cita(id, '/reprogramacion'), cuerpo, { headers });
  }

  preCheckIn(id: string, cuerpo: CuerpoPreCheckIn, headers: HttpHeaders): Observable<CitaDetalle> {
    return this.http.post<CitaDetalle>(this.cita(id, '/pre-check-in'), cuerpo, { headers });
  }

  registrarLlegada(
    id: string,
    cuerpo: CuerpoLlegada,
    headers: HttpHeaders,
  ): Observable<CitaDetalle> {
    return this.http.post<CitaDetalle>(this.cita(id, '/llegada'), cuerpo, { headers });
  }

  obtenerPerfil(): Observable<PerfilPaciente> {
    return this.http.get<PerfilPaciente>(api('/pacientes/me/perfil'));
  }

  actualizarPerfil(cambios: ActualizacionPerfil): Observable<PerfilPaciente> {
    return this.http.patch<PerfilPaciente>(api('/pacientes/me/perfil'), cambios);
  }
}
