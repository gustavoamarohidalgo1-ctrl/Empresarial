import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { EMPTY, Observable, of, switchMap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { Rol } from '../modelos/contrato';

interface ConexionRed {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Emite una vez cuando el navegador está ocioso (`requestIdleCallback`, con un tope de 4 s).
 * Sin esa API (Safari), espera 1,5 s con `setTimeout`. Cancelable al desuscribirse.
 */
export function cuandoEsteOcioso(ventana: Window | null | undefined): Observable<void> {
  return new Observable<void>((suscriptor) => {
    const listo = () => {
      suscriptor.next();
      suscriptor.complete();
    };
    if (ventana && typeof ventana.requestIdleCallback === 'function') {
      const id = ventana.requestIdleCallback(listo, { timeout: 4000 });
      return () => ventana.cancelIdleCallback?.(id);
    }
    const id = setTimeout(listo, 1500);
    return () => clearTimeout(id);
  });
}

/**
 * Precarga en tiempo ocioso SOLO los módulos lazy que el rol del usuario puede abrir:
 * - sin sesión, nada (el login ya está cargado);
 * - rutas con `data.roles`: solo si incluye el rol del usuario;
 * - rutas sin `data.roles`: las hijas de un módulo permitido (p. ej. pantallas del paciente);
 * - rutas con `data.precarga: false`: nunca (login, acceso denegado, 404);
 * - con ahorro de datos (`navigator.connection.saveData`) o red 2G: nada.
 * La decisión se repite justo antes de cargar (la sesión pudo cerrarse mientras tanto).
 */
@Injectable({ providedIn: 'root' })
export class PrecargaPorRol implements PreloadingStrategy {
  private readonly auth = inject(AuthService);
  private readonly ventana = inject(DOCUMENT).defaultView;

  preload(ruta: Route, cargar: () => Observable<unknown>): Observable<unknown> {
    if (!this.debePrecargar(ruta)) return of(null);
    return cuandoEsteOcioso(this.ventana).pipe(
      switchMap(() => (this.debePrecargar(ruta) ? cargar() : EMPTY)),
    );
  }

  debePrecargar(ruta: Route): boolean {
    const usuario = this.auth.usuario();
    if (!usuario || this.ahorroDeDatos()) return false;
    const datos = ruta.data ?? {};
    if (datos['precarga'] === false) return false;
    const roles = datos['roles'] as readonly Rol[] | undefined;
    return !roles || roles.includes(usuario.rol);
  }

  private ahorroDeDatos(): boolean {
    const conexion = (
      this.ventana?.navigator as (Navigator & { connection?: ConexionRed }) | undefined
    )?.connection;
    if (!conexion) return false;
    return conexion.saveData === true || /(^|-)2g$/.test(conexion.effectiveType ?? '');
  }
}
