import {
  EVENTOS_INTERACCION,
  LIMITE_INACTIVIDAD_MS,
  escucharInteraccion,
  superaInactividad,
} from './inactividad';

describe('inactividad', () => {
  it('el límite es de 15 minutos, por debajo de los 30 de la sesión del servidor', () => {
    expect(LIMITE_INACTIVIDAD_MS).toBe(15 * 60_000);
    expect(superaInactividad(0, LIMITE_INACTIVIDAD_MS - 1)).toBe(false);
    expect(superaInactividad(0, LIMITE_INACTIVIDAD_MS)).toBe(true);
  });

  it('escucha pointerdown, keydown, wheel y touchstart, y deja de hacerlo al retirarse', () => {
    const vistas: string[] = [];
    const retirar = escucharInteraccion(document, (e) => vistas.push(e.type));

    for (const tipo of EVENTOS_INTERACCION) {
      document.body.dispatchEvent(new Event(tipo, { bubbles: false }));
    }
    // Mover el ratón o volver a la pestaña no son interacción.
    document.body.dispatchEvent(new Event('mousemove', { bubbles: true }));
    document.dispatchEvent(new Event('visibilitychange'));
    expect(vistas).toEqual(['pointerdown', 'keydown', 'wheel', 'touchstart']);

    retirar();
    document.body.dispatchEvent(new Event('keydown', { bubbles: true }));
    expect(vistas).toHaveLength(4);
  });

  it('los oyentes van en captura: un manejador que corta la propagación no los oculta', () => {
    const boton = document.createElement('button');
    document.body.append(boton);
    boton.addEventListener('pointerdown', (e) => e.stopPropagation());
    let vistas = 0;
    const retirar = escucharInteraccion(document, () => vistas++);

    boton.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(vistas).toBe(1);

    retirar();
    boton.remove();
  });
});
