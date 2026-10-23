import {
  Binding,
  PendingTasks,
  Signal,
  Type,
  ViewContainerRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

export interface OpcionesDiferido<T> {
  /** Dónde se crea (un `viewChild(…, { read: ViewContainerRef })`); puede aparecer y desaparecer. */
  ancla: Signal<ViewContainerRef | undefined>;
  /** Carga el componente con `import()` (su propio chunk, fuera del bundle inicial). */
  importar: () => Promise<Type<T>>;
  /** Cuándo cargarlo (p. ej. «menú abierto» o «hay un paciente»). Se carga una sola vez. */
  cuando: Signal<boolean>;
  /** Entradas y salidas (`inputBinding`/`outputBinding`), nuevas en cada creación. */
  enlaces: () => Binding[];
}

/**
 * Componente cargado en diferido SIN `@defer`: el motor de `@defer` añade unos 3 kB (brotli) de
 * Angular al bundle inicial, más de lo que ahorra en la cabecera. Aquí solo se usan `import()` y
 * `ViewContainerRef.createComponent`, que ya están en el bundle.
 *
 * - Se importa la primera vez que `cuando()` es `true` o al llamar a `cargar()` (precarga).
 * - Se crea en `ancla` en cuanto el componente está cargado y el ancla existe; si el ancla se
 *   destruye (p. ej. al cerrar sesión) y vuelve a aparecer, se crea de nuevo.
 * - La carga es una tarea pendiente (`PendingTasks`): `whenStable()` la espera.
 * - Si la carga falla (sin conexión), el siguiente intento la repite.
 *
 * Debe llamarse en un contexto de inyección (constructor o inicializador de campo).
 */
export function componenteDiferido<T>(opciones: OpcionesDiferido<T>): {
  /** Pide la carga ya (precarga); no hace nada si ya se pidió. */
  cargar(): void;
  /** `true` cuando el componente ya está cargado (y, con ancla, creado). */
  cargado: Signal<boolean>;
} {
  const tareas = inject(PendingTasks);
  const tipo = signal<Type<T> | null>(null);
  let pedido = false;
  let creadoEn: ViewContainerRef | null = null;

  const cargar = (): void => {
    if (pedido) return;
    pedido = true;
    tareas.run(() =>
      opciones.importar().then(
        (componente) => tipo.set(componente),
        () => (pedido = false),
      ),
    );
  };

  effect(() => {
    if (opciones.cuando()) untracked(cargar);
  });

  effect(() => {
    const ancla = opciones.ancla();
    const componente = tipo();
    if (!ancla || !componente || ancla === creadoEn) return;
    creadoEn = ancla;
    untracked(() => ancla.createComponent(componente, { bindings: opciones.enlaces() }));
  });

  return { cargar, cargado: computed(() => tipo() !== null) };
}
