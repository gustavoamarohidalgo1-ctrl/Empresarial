import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, of, throwError } from 'rxjs';
import { OPERADOR, PACIENTE } from '../../../testing/datos-prueba';
import { AuthService } from '../auth/auth.service';
import { UsuarioSesion } from '../modelos/contrato';
import { CacheService, ResultadoSwr } from './cache.service';

/** Fuente controlable: cada suscripción cuenta como una «petición» y puede cancelarse. */
function fuenteControlada<T>() {
  const peticiones: Subject<T>[] = [];
  let canceladas = 0;
  const fuente = vi.fn(
    () =>
      new Observable<T>((s) => {
        const sujeto = new Subject<T>();
        peticiones.push(sujeto);
        let terminada = false;
        const sub = sujeto.subscribe({
          next: (v) => s.next(v),
          error: (e) => {
            terminada = true;
            s.error(e);
          },
          complete: () => {
            terminada = true;
            s.complete();
          },
        });
        return () => {
          if (!terminada) canceladas++;
          sub.unsubscribe();
        };
      }),
  );
  return {
    fuente,
    responder(valor: T, i = peticiones.length - 1) {
      peticiones[i].next(valor);
      peticiones[i].complete();
    },
    fallar(error: unknown, i = peticiones.length - 1) {
      peticiones[i].error(error);
    },
    get canceladas() {
      return canceladas;
    },
  };
}

describe('CacheService', () => {
  let cache: CacheService;
  let ahora: number;
  const usuario = signal<UsuarioSesion | null>(PACIENTE);

  beforeEach(() => {
    usuario.set(PACIENTE);
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { usuario } }],
    });
    cache = TestBed.inject(CacheService);
    ahora = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => ahora);
  });

  afterEach(() => vi.restoreAllMocks());

  describe('obtener (catálogos)', () => {
    it('pide una vez y luego responde desde memoria', () => {
      const f = fuenteControlada<string[]>();
      const primero: string[][] = [];
      cache.obtener('motivos', f.fuente).subscribe((v) => primero.push(v));
      f.responder(['A', 'B']);

      const segundo: string[][] = [];
      cache.obtener('motivos', f.fuente).subscribe((v) => segundo.push(v));
      expect(f.fuente).toHaveBeenCalledTimes(1);
      expect(primero).toEqual([['A', 'B']]);
      expect(segundo).toEqual([['A', 'B']]);
    });

    it('las peticiones simultáneas comparten la misma', () => {
      const f = fuenteControlada<number>();
      const a: number[] = [];
      const b: number[] = [];
      cache.obtener('x', f.fuente).subscribe((v) => a.push(v));
      cache.obtener('x', f.fuente).subscribe((v) => b.push(v));
      f.responder(42);
      expect(f.fuente).toHaveBeenCalledTimes(1);
      expect(a).toEqual([42]);
      expect(b).toEqual([42]);
    });

    it('no guarda errores: el siguiente intento vuelve a pedir', () => {
      const f = fuenteControlada<number>();
      const errores: unknown[] = [];
      cache.obtener('x', f.fuente).subscribe({ error: (e) => errores.push(e) });
      f.fallar('caído');
      expect(errores).toEqual(['caído']);

      const valores: number[] = [];
      cache.obtener('x', f.fuente).subscribe((v) => valores.push(v));
      f.responder(1);
      expect(f.fuente).toHaveBeenCalledTimes(2);
      expect(valores).toEqual([1]);
    });

    it('si nadie queda suscrito, cancela la petición en curso y no guarda nada', () => {
      const f = fuenteControlada<number>();
      cache.obtener('x', f.fuente).subscribe().unsubscribe();
      expect(f.canceladas).toBe(1);
      expect(cache.leer('x')).toBeUndefined();
    });

    it('respeta la vigencia indicada', () => {
      const f = fuenteControlada<number>();
      cache.obtener('x', f.fuente, { vigenciaMs: 1000 }).subscribe();
      f.responder(1);
      ahora += 999;
      cache.obtener('x', f.fuente, { vigenciaMs: 1000 }).subscribe();
      expect(f.fuente).toHaveBeenCalledTimes(1);
      ahora += 1;
      cache.obtener('x', f.fuente, { vigenciaMs: 1000 }).subscribe();
      expect(f.fuente).toHaveBeenCalledTimes(2);
    });
  });

  describe('swr (stale-while-revalidate)', () => {
    it('sin datos guardados emite solo la respuesta fresca', () => {
      const r: ResultadoSwr<string>[] = [];
      cache.swr('citas', () => of('v1')).subscribe((x) => r.push(x));
      expect(r).toEqual([{ datos: 'v1', desdeCache: false, revalidando: false }]);
    });

    it('con datos guardados los emite al instante y luego revalida', () => {
      cache.guardar('citas', 'viejo');
      const f = fuenteControlada<string>();
      const r: ResultadoSwr<string>[] = [];
      cache.swr('citas', f.fuente).subscribe((x) => r.push(x));
      expect(r).toEqual([{ datos: 'viejo', desdeCache: true, revalidando: true }]);
      f.responder('nuevo');
      expect(r[1]).toEqual({ datos: 'nuevo', desdeCache: false, revalidando: false });
      expect(cache.leer('citas')).toBe('nuevo');
    });

    it('si la revalidación falla, conserva lo guardado y expone el error sin romper', () => {
      cache.guardar('citas', 'viejo');
      const r: ResultadoSwr<string>[] = [];
      let completo = false;
      cache
        .swr('citas', () => throwError(() => 'sin red'))
        .subscribe({
          next: (x) => r.push(x),
          complete: () => (completo = true),
        });
      expect(r.at(-1)).toEqual({
        datos: 'viejo',
        desdeCache: true,
        revalidando: false,
        error: 'sin red',
      });
      expect(completo).toBe(true);
      expect(cache.leer('citas')).toBe('viejo');
    });

    it('sin datos guardados, el error se propaga (la pantalla muestra su estado de error)', () => {
      const errores: unknown[] = [];
      cache
        .swr('citas', () => throwError(() => 'sin red'))
        .subscribe({
          error: (e) => errores.push(e),
        });
      expect(errores).toEqual(['sin red']);
    });

    it('con vigenciaMs no revalida si lo guardado es reciente', () => {
      cache.guardar('citas', 'reciente');
      const fuente = vi.fn(() => of('nuevo'));
      const r: ResultadoSwr<string>[] = [];
      cache.swr('citas', fuente, { vigenciaMs: 30_000 }).subscribe((x) => r.push(x));
      expect(fuente).not.toHaveBeenCalled();
      expect(r).toEqual([{ datos: 'reciente', desdeCache: true, revalidando: false }]);
    });
  });

  describe('versión por clave (carreras con acciones)', () => {
    it('una revalidación que responde después de guardar() no pisa el valor más nuevo', () => {
      const f = fuenteControlada<string>();
      cache.guardar('cita:1', 'v1');
      cache.swr('cita:1', f.fuente).subscribe();
      // Mientras la revalidación sigue en vuelo, una acción guarda el resultado del servidor.
      cache.guardar('cita:1', 'v-accion');
      f.responder('v-anterior');

      expect(cache.leer('cita:1')).toBe('v-accion');
    });

    it('una petición en vuelo no resucita una clave invalidada', () => {
      const f = fuenteControlada<string>();
      cache.obtener('citas:proximas', f.fuente).subscribe();
      cache.invalidarPrefijo('citas:');
      f.responder('viejo');

      expect(cache.leer('citas:proximas')).toBeUndefined();
    });
  });

  describe('invalidación', () => {
    it('invalidar, invalidarPrefijo y limpiar', () => {
      cache.guardar('citas:proximas', 1);
      cache.guardar('citas:historial', 2);
      cache.guardar('cita:c-1', 3);
      cache.invalidar('cita:c-1');
      expect(cache.leer('cita:c-1')).toBeUndefined();
      cache.invalidarPrefijo('citas:');
      expect(cache.leer('citas:proximas')).toBeUndefined();
      expect(cache.leer('citas:historial')).toBeUndefined();
      cache.guardar('x', 1);
      cache.limpiar();
      expect(cache.leer('x')).toBeUndefined();
    });

    it('una respuesta pedida antes de limpiar() no se guarda (cambio de usuario)', () => {
      const f = fuenteControlada<string>();
      const valores: string[] = [];
      cache.obtener('perfil', f.fuente).subscribe((v) => valores.push(v));
      cache.limpiar();
      f.responder('datos del usuario anterior');
      expect(valores).toEqual(['datos del usuario anterior']);
      expect(cache.leer('perfil')).toBeUndefined();
    });
  });

  describe('pertenece al usuario de la sesión', () => {
    it('se vacía al cerrar sesión o al cambiar de usuario o de rol', () => {
      cache.guardar('citas:proximas', ['de Ana']);
      usuario.set(null);
      expect(cache.leer('citas:proximas')).toBeUndefined();

      usuario.set(PACIENTE);
      cache.guardar('citas:proximas', ['de Ana']);
      usuario.set(OPERADOR);
      const fuente = vi.fn(() => of(['de Olga']));
      const valores: string[][] = [];
      cache.obtener('citas:proximas', fuente).subscribe((v) => valores.push(v));
      expect(fuente).toHaveBeenCalled();
      expect(valores).toEqual([['de Olga']]);
    });

    it('lo que llega tras un cambio de usuario no queda guardado para el nuevo', () => {
      const f = fuenteControlada<string>();
      cache.obtener('perfil', f.fuente).subscribe();
      usuario.set(OPERADOR);
      f.responder('perfil de Ana');
      expect(cache.leer('perfil')).toBeUndefined();
    });

    it('se conserva mientras la sesión sea del mismo usuario', () => {
      cache.guardar('catalogo:motivos:CANCELACION', ['A']);
      usuario.set({ ...PACIENTE });
      expect(cache.leer('catalogo:motivos:CANCELACION')).toEqual(['A']);
    });
  });
});
