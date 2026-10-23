import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { CacheService } from '../../../core/cache/cache.service';
import { api } from '../../../core/http/api';
import {
  CitaDetalle,
  CuerpoReserva,
  Especialidad,
  HorarioReserva,
  ProfesionalCatalogo,
  SedeCatalogo,
} from '../../../core/modelos/contrato';

/** Prefijo de las claves de disponibilidad en la caché (se invalida tras reservar). */
export const PREFIJO_DISPONIBILIDAD = 'reserva:disponibilidad:';

/** La disponibilidad se reutiliza un minuto al ir y volver entre pasos; luego se vuelve a pedir. */
export const VIGENCIA_DISPONIBILIDAD_MS = 60_000;

export interface ConsultaDisponibilidad {
  especialidad: string;
  /** `YYYY-MM-DD` en Lima (incluido). */
  desde: string;
  /** `YYYY-MM-DD` en Lima (incluido). */
  hasta: string;
  /** Código del profesional; sin él, todos los de la especialidad. */
  profesional?: string | null;
}

export function claveDisponibilidad(c: ConsultaDisponibilidad): string {
  return `${PREFIJO_DISPONIBILIDAD}${c.especialidad}:${c.profesional || '*'}:${c.desde}:${c.hasta}`;
}

/**
 * Endpoints de la reserva de citas (docs/api.md § «Reserva de citas»).
 * Los catálogos se guardan en memoria toda la sesión; la disponibilidad, un minuto.
 * `reservar` recibe las cabeceras con `Idempotency-Key` desde `IdempotenciaService`.
 */
@Injectable({ providedIn: 'root' })
export class ReservaApiService {
  private readonly http = inject(HttpClient);
  private readonly cache = inject(CacheService);

  especialidades(): Observable<Especialidad[]> {
    return this.cache.obtener('catalogo:especialidades', () =>
      this.http.get<Especialidad[]>(api('/catalogos/especialidades')),
    );
  }

  profesionales(especialidad: string): Observable<ProfesionalCatalogo[]> {
    return this.cache.obtener(`catalogo:profesionales:${especialidad}`, () =>
      this.http.get<ProfesionalCatalogo[]>(api('/catalogos/profesionales'), {
        params: new HttpParams().set('especialidad', especialidad),
      }),
    );
  }

  sedes(): Observable<SedeCatalogo[]> {
    return this.cache.obtener('catalogo:sedes', () =>
      this.http.get<SedeCatalogo[]>(api('/catalogos/sedes')),
    );
  }

  /** Horarios libres y futuros, por inicio ascendente. */
  disponibilidad(consulta: ConsultaDisponibilidad): Observable<HorarioReserva[]> {
    let params = new HttpParams()
      .set('especialidad', consulta.especialidad)
      .set('desde', consulta.desde)
      .set('hasta', consulta.hasta);
    if (consulta.profesional) params = params.set('profesional', consulta.profesional);
    return this.cache.obtener(
      claveDisponibilidad(consulta),
      () => this.http.get<HorarioReserva[]>(api('/pacientes/me/disponibilidad'), { params }),
      { vigenciaMs: VIGENCIA_DISPONIBILIDAD_MS },
    );
  }

  /** Olvida la disponibilidad guardada (tras reservar, tras un 409 o al pulsar «Actualizar»). */
  olvidarDisponibilidad(): void {
    this.cache.invalidarPrefijo(PREFIJO_DISPONIBILIDAD);
  }

  /** `POST /pacientes/me/citas` → 201 con la cita creada (Pendiente, versión 1). */
  reservar(cuerpo: CuerpoReserva, headers: HttpHeaders): Observable<CitaDetalle> {
    return this.http.post<CitaDetalle>(api('/pacientes/me/citas'), cuerpo, { headers });
  }
}
