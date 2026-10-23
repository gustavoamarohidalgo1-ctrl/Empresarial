import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Observable, Subscription, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { LIMITE_INACTIVIDAD_MS, escucharInteraccion, superaInactividad } from '../auth/inactividad';
import { api } from '../http/api';
import { ConteoNoLeidas, NotificacionPaciente } from '../modelos/contrato';

/** Cada cuánto se vuelve a consultar el contador mientras la pestaña está visible. */
export const INTERVALO_SONDEO_MS = 60_000;

/**
 * Sin interacción de la persona durante este tiempo, el sondeo se detiene. Así una pestaña
 * olvidada en un equipo compartido deja de renovar la sesión del servidor (30 min de inactividad)
 * y esta termina caducando. Es el mismo límite del panel del operador (`core/auth/inactividad`).
 */
export { LIMITE_INACTIVIDAD_MS };

/** Separación mínima entre dos consultas no forzadas del contador. */
export const SEPARACION_MINIMA_MS = 5_000;

/** Una consulta en vuelo más antigua que esto se da por colgada: no bloquea la siguiente. */
export const ESPERA_MAXIMA_CONSULTA_MS = 30_000;

/**
 * Segundo refresco tras una acción cuyo aviso crea el servidor de forma asíncrona
 * (p. ej. «Reserva registrada», que genera un oyente después de responder 201).
 */
export const RETRASO_AVISO_ASINCRONO_MS = 2_500;

/** Máximo de notificaciones que admite `GET /pacientes/me/notificaciones` (docs/api.md). */
export const LIMITE_MAXIMO_NOTIFICACIONES = 100;

const RUTA = '/pacientes/me/notificaciones';

export interface OpcionesRefresco {
  /**
   * Consulta aunque haya otra en vuelo (que se descarta), aunque la última sea de hace menos de
   * 5 s y aunque la persona lleve 15 min sin interactuar. Para después de una acción que cambia
   * el contador.
   */
  forzar?: boolean;
}

/**
 * Notificaciones del paciente (docs/api.md § «Notificaciones del paciente»).
 *
 * - `noLeidas`: contador de no leídas para la cabecera (0 si no hay un paciente en sesión).
 * - Sondeo: solo con un usuario de rol PACIENTE (`AuthService.usuario()`), cada 60 s y solo
 *   mientras la pestaña está visible; al volver a la pestaña consulta en el acto. Se detiene al
 *   cerrar sesión o si el rol cambia, y vuelve a empezar desde 0 si cambia el paciente.
 * - Inactividad: tras 15 min sin interacción (pointerdown, keydown, wheel o touchstart) el sondeo
 *   se detiene para no mantener viva la sesión del servidor. La primera interacción lo reanuda
 *   y consulta en el acto.
 * - Autolimitación: `refrescarConteo()` no lanza otra consulta si hay una en vuelo (salvo que
 *   lleve 30 s colgada) o la última terminó hace menos de 5 s (la cabecera lo llama en cada
 *   navegación, también al iniciar sesión).
 *   `refrescarConteo({ forzar: true })` y `refrescarTrasAccion()` consultan siempre.
 * - Las respuestas que llegan tarde (de otro usuario o tras cerrar sesión) se descartan.
 * - `listar`, `marcarLeida` y `marcarTodas` mantienen el contador al día.
 */
@Injectable({ providedIn: 'root' })
export class NotificacionesService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly documento = inject(DOCUMENT);

  /** Total de notificaciones no leídas del paciente en sesión (0 si no aplica). */
  readonly noLeidas = signal(0);

  /** Paciente cuyo contador se sondea (`id`), o `null` si no hay paciente en sesión. */
  private pacienteActivo: string | null = null;
  private temporizador: ReturnType<typeof setInterval> | null = null;
  private refrescoDiferido: ReturnType<typeof setTimeout> | null = null;
  private consulta: Subscription | null = null;
  /** Instante (ms) de la última consulta del contador: cuando salió y, después, cuando terminó. */
  private ultimaConsulta = Number.NEGATIVE_INFINITY;
  /** Instante (ms) de la última interacción de la persona con la página. */
  private ultimaInteraccion = Date.now();
  /** El sondeo se detuvo por inactividad y espera la próxima interacción. */
  private enReposo = false;

  constructor() {
    effect(() => {
      const usuario = this.auth.usuario();
      const paciente = usuario?.rol === 'PACIENTE' ? usuario.id : null;
      untracked(() => this.cambiarPaciente(paciente));
    });

    const alCambiarVisibilidad = () => {
      if (!this.pacienteActivo) return;
      if (!this.visible()) {
        this.detenerSondeo();
      } else if (this.inactivo()) {
        // Volver a la pestaña no es interacción: se espera a que la persona actúe.
        this.reposar();
      } else {
        this.refrescarConteo();
        this.iniciarSondeo();
      }
    };
    // Lo más barato posible: anota la hora y solo trabaja si el sondeo estaba en reposo.
    const alInteractuar = () => {
      this.ultimaInteraccion = Date.now();
      if (this.enReposo) this.reanudar();
    };

    this.documento.addEventListener('visibilitychange', alCambiarVisibilidad);
    // Interacciones (pointerdown, keydown, wheel, touchstart): oyentes pasivos en captura.
    const dejarDeEscuchar = escucharInteraccion(this.documento, alInteractuar);
    inject(DestroyRef).onDestroy(() => {
      this.documento.removeEventListener('visibilitychange', alCambiarVisibilidad);
      dejarDeEscuchar();
      this.detenerSondeo();
      this.cancelarRefrescoDiferido();
      this.cancelarConsulta();
    });
  }

  /**
   * Vuelve a consultar el contador (p. ej. al iniciar sesión o al navegar). No hace nada si el
   * usuario en sesión no es un paciente. Sin `forzar`, tampoco si ya hay una consulta en vuelo,
   * si la última fue hace menos de 5 s o si la persona lleva 15 min sin interactuar. Los errores
   * se ignoran: el contador conserva su último valor y el siguiente sondeo lo intentará de nuevo.
   */
  refrescarConteo(opciones: OpcionesRefresco = {}): void {
    const paciente = this.pacienteEnSesion();
    if (!paciente) return;
    const ahora = Date.now();
    if (!opciones.forzar) {
      const desdeLaUltima = ahora - this.ultimaConsulta;
      if (this.consulta !== null && desdeLaUltima < ESPERA_MAXIMA_CONSULTA_MS) return;
      if (desdeLaUltima < SEPARACION_MINIMA_MS) return;
      if (this.inactivo(ahora)) return;
    }
    this.cancelarConsulta();
    this.ultimaConsulta = ahora;
    // Los 5 s cuentan desde que llega la respuesta (o el error), no desde que salió la consulta.
    const terminar = () => (this.ultimaConsulta = Date.now());
    const consulta = this.http.get<ConteoNoLeidas>(api(`${RUTA}/no-leidas`)).subscribe({
      next: (conteo) => {
        terminar();
        if (this.pacienteEnSesion() !== paciente) return;
        const total = Number(conteo?.total);
        this.noLeidas.set(Number.isFinite(total) && total > 0 ? Math.floor(total) : 0);
      },
      error: terminar,
    });
    // Si la respuesta fue síncrona (o falló al instante), la consulta ya terminó.
    this.consulta = consulta.closed ? null : consulta;
    consulta.add(() => {
      if (this.consulta === consulta) this.consulta = null;
    });
  }

  /**
   * Tras una acción cuyo aviso crea el servidor de forma asíncrona (p. ej. reservar una cita):
   * consulta en el acto y otra vez a los 2,5 s, ambas forzadas. Sigue aunque la pantalla que lo
   * pidió se cierre; se cancela si cambia el paciente.
   */
  refrescarTrasAccion(): void {
    if (!this.pacienteEnSesion()) return;
    this.refrescarConteo({ forzar: true });
    this.cancelarRefrescoDiferido();
    this.refrescoDiferido = setTimeout(() => {
      this.refrescoDiferido = null;
      this.refrescarConteo({ forzar: true });
    }, RETRASO_AVISO_ASINCRONO_MS);
  }

  /** `GET /pacientes/me/notificaciones?limite=…`: de la más reciente a la más antigua. */
  listar(limite = 50): Observable<NotificacionPaciente[]> {
    const tope = Math.min(Math.max(1, Math.floor(limite)), LIMITE_MAXIMO_NOTIFICACIONES);
    return this.http.get<NotificacionPaciente[]>(api(RUTA), {
      params: new HttpParams().set('limite', tope),
    });
  }

  /**
   * `POST /pacientes/me/notificaciones/{id}/lectura` (idempotente). Al terminar vuelve a pedir el
   * contador (forzado), que es la fuente de verdad (marcar una ya leída no lo cambia).
   */
  marcarLeida(id: string): Observable<void> {
    return this.http
      .post<void>(api(`${RUTA}/${encodeURIComponent(id)}/lectura`), null)
      .pipe(tap(() => this.refrescarConteo({ forzar: true })));
  }

  /**
   * `POST /pacientes/me/notificaciones/lectura`: marca todas como leídas (idempotente). Descarta
   * la consulta del contador que estuviera en vuelo, para que no devuelva un valor anterior.
   */
  marcarTodas(): Observable<void> {
    return this.http.post<void>(api(`${RUTA}/lectura`), null).pipe(
      tap(() => {
        this.cancelarConsulta();
        this.noLeidas.set(0);
      }),
    );
  }

  private pacienteEnSesion(): string | null {
    const usuario = this.auth.usuario();
    return usuario?.rol === 'PACIENTE' ? usuario.id : null;
  }

  private cambiarPaciente(paciente: string | null): void {
    if (paciente === this.pacienteActivo) return;
    this.detenerSondeo();
    this.cancelarRefrescoDiferido();
    this.cancelarConsulta();
    this.pacienteActivo = paciente;
    this.ultimaConsulta = Number.NEGATIVE_INFINITY;
    this.enReposo = false;
    this.noLeidas.set(0);
    if (!paciente) return;
    // Iniciar sesión (o recuperarla al abrir la app) cuenta como actividad.
    this.ultimaInteraccion = Date.now();
    this.refrescarConteo();
    if (this.visible()) this.iniciarSondeo();
  }

  /** Cada 60 s: consulta, salvo que la persona lleve 15 min sin interactuar (entonces reposa). */
  private sondear(): void {
    if (!this.visible()) return;
    if (this.inactivo()) {
      this.reposar();
      return;
    }
    this.refrescarConteo();
  }

  private reposar(): void {
    this.enReposo = true;
    this.detenerSondeo();
  }

  /** Primera interacción tras el reposo: consulta en el acto y reanuda el sondeo. */
  private reanudar(): void {
    this.enReposo = false;
    if (!this.pacienteActivo || !this.visible()) return;
    this.refrescarConteo();
    this.iniciarSondeo();
  }

  private inactivo(ahora = Date.now()): boolean {
    return superaInactividad(this.ultimaInteraccion, ahora);
  }

  private iniciarSondeo(): void {
    if (this.temporizador !== null) return;
    this.temporizador = setInterval(() => this.sondear(), INTERVALO_SONDEO_MS);
  }

  private detenerSondeo(): void {
    if (this.temporizador === null) return;
    clearInterval(this.temporizador);
    this.temporizador = null;
  }

  private cancelarRefrescoDiferido(): void {
    if (this.refrescoDiferido === null) return;
    clearTimeout(this.refrescoDiferido);
    this.refrescoDiferido = null;
  }

  private cancelarConsulta(): void {
    const consulta = this.consulta;
    this.consulta = null;
    consulta?.unsubscribe();
  }

  private visible(): boolean {
    return this.documento.visibilityState !== 'hidden';
  }
}
