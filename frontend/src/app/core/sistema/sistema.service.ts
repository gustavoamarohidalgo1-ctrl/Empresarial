import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, finalize, of, shareReplay, tap } from 'rxjs';
import { api } from '../http/api';
import { InfoSistema } from '../modelos/contrato';

/**
 * Información pública del sistema (`GET /sistema/info`): nombre, versión y entorno.
 * Se pide una sola vez por carga de la app y se guarda en memoria; las peticiones
 * simultáneas comparten una. Si falla, se asume producción (no se muestra nada propio del
 * entorno de desarrollo) y la siguiente llamada vuelve a intentarlo.
 */
@Injectable({ providedIn: 'root' })
export class SistemaService {
  private readonly http = inject(HttpClient);
  private readonly infoActual = signal<InfoSistema | null>(null);
  private enCurso: Observable<InfoSistema | null> | null = null;

  readonly info = this.infoActual.asReadonly();
  /** `true` solo si el servidor confirma el entorno de desarrollo. */
  readonly esDesarrollo = computed(() => this.infoActual()?.entorno === 'desarrollo');

  obtener(): Observable<InfoSistema | null> {
    const actual = this.infoActual();
    if (actual) return of(actual);
    if (!this.enCurso) {
      this.enCurso = this.http.get<InfoSistema>(api('/sistema/info')).pipe(
        tap((info) => this.infoActual.set(info)),
        catchError(() => of(null)),
        finalize(() => (this.enCurso = null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }
    return this.enCurso;
  }

  /** Dispara la consulta sin esperar el resultado (la app lo lee con `info()`). */
  cargar(): void {
    this.obtener().subscribe();
  }
}
