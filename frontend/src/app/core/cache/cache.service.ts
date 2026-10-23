import { Injectable, inject } from '@angular/core';
import { Observable, catchError, concat, defer, finalize, map, of, share, tap } from 'rxjs';
import { AuthService } from '../auth/auth.service';

/** Resultado de `swr()`: los datos y de dónde vienen. */
export interface ResultadoSwr<T> {
  datos: T;
  /** `true` si `datos` es lo guardado en memoria (puede estar desactualizado). */
  desdeCache: boolean;
  /** `true` mientras se pide la versión fresca en segundo plano. */
  revalidando: boolean;
  /** Error de la revalidación (solo cuando había datos guardados que mostrar). */
  error?: unknown;
}

export interface OpcionesObtener {
  /** Vigencia en ms. Por defecto, toda la sesión (catálogos). */
  vigenciaMs?: number;
}

export interface OpcionesSwr {
  /**
   * Si lo guardado tiene menos de esta edad (ms), se devuelve sin revalidar.
   * Por defecto 0: siempre se revalida.
   */
  vigenciaMs?: number;
}

interface Entrada {
  valor: unknown;
  guardadoEn: number;
}

/**
 * Caché en memoria (nunca en localStorage: datos de salud) con dos modos:
 *
 * - `obtener(clave, fuente)`: devuelve lo guardado si sigue vigente; si no, lo pide UNA vez
 *   (las peticiones simultáneas comparten la misma). Para catálogos.
 * - `swr(clave, fuente)`: *stale-while-revalidate*. Emite lo guardado al instante (si hay)
 *   y luego la versión fresca. Si la revalidación falla y había datos, emite esos datos con
 *   `error` y termina sin error; si no había datos, propaga el error.
 *
 * Los errores no se guardan. Si nadie queda suscrito, la petición en curso se cancela.
 * La caché pertenece al usuario de la sesión: si cambia (otro usuario, otro rol o cierre de
 * sesión), se vacía antes de leer o escribir, y lo que estaba en vuelo ya no se guarda.
 */
@Injectable({ providedIn: 'root' })
export class CacheService {
  private readonly auth = inject(AuthService);
  private readonly entradas = new Map<string, Entrada>();
  private readonly enCurso = new Map<string, Observable<unknown>>();
  private readonly versiones = new Map<string, number>();
  /** Cambia con `limpiar()`: una respuesta pedida antes de limpiar ya no se guarda. */
  private generacion = 0;
  /** Usuario dueño de lo guardado (`id:rol`); `undefined` hasta el primer uso. */
  private dueno: string | null | undefined = undefined;

  obtener<T>(
    clave: string,
    fuente: () => Observable<T>,
    opciones: OpcionesObtener = {},
  ): Observable<T> {
    return defer(() => {
      this.comprobarDueno();
      const entrada = this.entradas.get(clave);
      if (entrada && this.edad(entrada) < (opciones.vigenciaMs ?? Infinity)) {
        return of(entrada.valor as T);
      }
      return this.pedir(clave, fuente);
    });
  }

  swr<T>(
    clave: string,
    fuente: () => Observable<T>,
    opciones: OpcionesSwr = {},
  ): Observable<ResultadoSwr<T>> {
    return defer(() => {
      this.comprobarDueno();
      const fresco = () =>
        this.pedir(clave, fuente).pipe(
          map((datos): ResultadoSwr<T> => ({ datos, desdeCache: false, revalidando: false })),
        );
      const entrada = this.entradas.get(clave);
      if (!entrada) return fresco();
      const guardado = entrada.valor as T;
      if (this.edad(entrada) < (opciones.vigenciaMs ?? 0)) {
        return of<ResultadoSwr<T>>({ datos: guardado, desdeCache: true, revalidando: false });
      }
      return concat(
        of<ResultadoSwr<T>>({ datos: guardado, desdeCache: true, revalidando: true }),
        defer(fresco).pipe(
          catchError((error: unknown) =>
            of<ResultadoSwr<T>>({ datos: guardado, desdeCache: true, revalidando: false, error }),
          ),
        ),
      );
    });
  }

  /** Lo guardado para `clave` (vigente o no), o `undefined`. */
  leer<T>(clave: string): T | undefined {
    this.comprobarDueno();
    return this.entradas.get(clave)?.valor as T | undefined;
  }

  /** Guarda un valor (p. ej. la cita devuelta por una acción, para que el detalle la muestre). */
  guardar<T>(clave: string, valor: T): void {
    this.comprobarDueno();
    this.cambiarVersion(clave);
    this.entradas.set(clave, { valor, guardadoEn: this.ahora() });
  }

  /** Borra una clave exacta. */
  invalidar(clave: string): void {
    this.cambiarVersion(clave);
    this.entradas.delete(clave);
  }

  /** Borra todas las claves que empiezan por `prefijo` (p. ej. `'citas:'`). */
  invalidarPrefijo(prefijo: string): void {
    const claves = new Set([...this.entradas.keys(), ...this.enCurso.keys()]);
    for (const clave of claves) {
      if (clave.startsWith(prefijo)) this.invalidar(clave);
    }
  }

  /**
   * Cada `guardar`/`invalidar` cambia la versión de la clave y suelta la petición en vuelo: una
   * revalidación que responda después no puede pisar un valor más nuevo (p. ej. el que devolvió
   * una acción) ni resucitar uno invalidado.
   */
  private cambiarVersion(clave: string): void {
    this.versiones.set(clave, (this.versiones.get(clave) ?? 0) + 1);
    this.enCurso.delete(clave);
  }

  /** Vacía todo (y descarta lo que esté en vuelo). */
  limpiar(): void {
    this.generacion++;
    this.entradas.clear();
    this.enCurso.clear();
  }

  protected ahora(): number {
    return Date.now();
  }

  /** Si cambió el usuario de la sesión desde el último uso, vacía la caché. */
  private comprobarDueno(): void {
    const usuario = this.auth.usuario();
    const actual = usuario ? `${usuario.id}:${usuario.rol}` : null;
    if (actual === this.dueno) return;
    if (this.dueno !== undefined) this.limpiar();
    this.dueno = actual;
  }

  private edad(entrada: Entrada): number {
    return this.ahora() - entrada.guardadoEn;
  }

  private pedir<T>(clave: string, fuente: () => Observable<T>): Observable<T> {
    return defer(() => {
      const existente = this.enCurso.get(clave) as Observable<T> | undefined;
      if (existente) return existente;
      const generacion = this.generacion;
      const version = this.versiones.get(clave) ?? 0;
      const compartido: Observable<T> = fuente().pipe(
        tap((valor) => {
          this.comprobarDueno();
          if (generacion === this.generacion && version === (this.versiones.get(clave) ?? 0)) {
            this.entradas.set(clave, { valor, guardadoEn: this.ahora() });
          }
        }),
        finalize(() => {
          if (this.enCurso.get(clave) === compartido) this.enCurso.delete(clave);
        }),
        share(),
      );
      this.enCurso.set(clave, compartido);
      return compartido;
    });
  }
}
