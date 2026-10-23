import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { of } from 'rxjs';
import { OPERADOR, PACIENTE } from '../../../testing/datos-prueba';
import { AuthService } from '../auth/auth.service';
import { UsuarioSesion } from '../modelos/contrato';
import { PrecargaPorRol, cuandoEsteOcioso } from './precarga-por-rol';

type Ventana = Window & {
  requestIdleCallback?: (cb: () => void, opciones?: unknown) => number;
  cancelIdleCallback?: (id: number) => void;
};

describe('PrecargaPorRol', () => {
  const usuario = signal<UsuarioSesion | null>(PACIENTE);
  const ventana = window as Ventana;
  let pendientes: (() => void)[];
  const originalRic = ventana.requestIdleCallback;
  const originalCic = ventana.cancelIdleCallback;

  const PACIENTE_RUTA: Route = { path: 'paciente', data: { roles: ['PACIENTE'] } };
  const OPERADOR_RUTA: Route = { path: 'operador', data: { roles: ['OPERADOR'] } };
  const HIJA: Route = { path: 'citas/:id' };
  const LOGIN: Route = { path: 'login', data: { precarga: false } };

  beforeEach(() => {
    usuario.set(PACIENTE);
    pendientes = [];
    ventana.requestIdleCallback = vi.fn((cb: () => void) => pendientes.push(cb));
    ventana.cancelIdleCallback = vi.fn();
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { usuario } }],
    });
  });

  afterEach(() => {
    ventana.requestIdleCallback = originalRic;
    ventana.cancelIdleCallback = originalCic;
    Object.defineProperty(navigator, 'connection', { value: undefined, configurable: true });
  });

  function precargar(ruta: Route) {
    const cargar = vi.fn(() => of('cargado'));
    const resultados: unknown[] = [];
    TestBed.inject(PrecargaPorRol)
      .preload(ruta, cargar)
      .subscribe((r) => resultados.push(r));
    return { cargar, resultados };
  }

  const ocio = () => pendientes.splice(0).forEach((cb) => cb());

  it('precarga el módulo del rol del usuario cuando el navegador está ocioso', () => {
    const { cargar, resultados } = precargar(PACIENTE_RUTA);
    expect(cargar).not.toHaveBeenCalled();
    ocio();
    expect(cargar).toHaveBeenCalledTimes(1);
    expect(resultados).toEqual(['cargado']);
  });

  it('no precarga módulos de otros roles', () => {
    const { cargar, resultados } = precargar(OPERADOR_RUTA);
    ocio();
    expect(cargar).not.toHaveBeenCalled();
    expect(resultados).toEqual([null]);
    usuario.set(OPERADOR);
    const operador = precargar(OPERADOR_RUTA);
    ocio();
    expect(operador.cargar).toHaveBeenCalled();
  });

  it('precarga las pantallas hijas (sin roles) de un módulo permitido', () => {
    const { cargar } = precargar(HIJA);
    ocio();
    expect(cargar).toHaveBeenCalled();
  });

  it('sin sesión, o en rutas marcadas con precarga: false, no precarga nada', () => {
    expect(precargar(LOGIN).resultados).toEqual([null]);
    usuario.set(null);
    const { cargar, resultados } = precargar(HIJA);
    ocio();
    expect(cargar).not.toHaveBeenCalled();
    expect(resultados).toEqual([null]);
  });

  it('si la sesión se cierra antes del momento ocioso, no carga', () => {
    const { cargar } = precargar(PACIENTE_RUTA);
    usuario.set(null);
    ocio();
    expect(cargar).not.toHaveBeenCalled();
  });

  it('respeta el ahorro de datos y las redes 2G', () => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    });
    expect(precargar(PACIENTE_RUTA).resultados).toEqual([null]);
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false, effectiveType: 'slow-2g' },
      configurable: true,
    });
    expect(precargar(PACIENTE_RUTA).resultados).toEqual([null]);
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: false, effectiveType: '4g' },
      configurable: true,
    });
    const { cargar } = precargar(PACIENTE_RUTA);
    ocio();
    expect(cargar).toHaveBeenCalled();
  });
});

describe('cuandoEsteOcioso', () => {
  it('sin requestIdleCallback espera con setTimeout y se puede cancelar', () => {
    vi.useFakeTimers();
    try {
      const sinApi = {} as Window;
      const emitido = vi.fn();
      cuandoEsteOcioso(sinApi).subscribe(emitido);
      vi.advanceTimersByTime(1499);
      expect(emitido).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(emitido).toHaveBeenCalledTimes(1);

      const cancelado = vi.fn();
      cuandoEsteOcioso(sinApi).subscribe(cancelado).unsubscribe();
      vi.advanceTimersByTime(2000);
      expect(cancelado).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('con requestIdleCallback cancela la espera al desuscribirse', () => {
    const cancelar = vi.fn();
    const ventana = {
      requestIdleCallback: vi.fn(() => 7),
      cancelIdleCallback: cancelar,
    } as unknown as Window;
    cuandoEsteOcioso(ventana).subscribe().unsubscribe();
    expect(cancelar).toHaveBeenCalledWith(7);
  });
});
