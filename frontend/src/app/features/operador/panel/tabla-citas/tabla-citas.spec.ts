import { TestBed } from '@angular/core/testing';
import { CitaOperador } from '../../../../core/modelos/contrato';
import { citaOperador } from '../../../../../testing/datos-prueba';
import { AccionSolicitada, TablaCitasOperadorComponent } from './tabla-citas';

const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

async function crear(entradas: Record<string, unknown>) {
  const fixture = TestBed.createComponent(TablaCitasOperadorComponent);
  for (const [nombre, valor] of Object.entries(entradas)) {
    fixture.componentRef.setInput(nombre, valor);
  }
  const emitidas: AccionSolicitada[] = [];
  fixture.componentInstance.accion.subscribe((a) => emitidas.push(a));
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, emitidas };
}

const varias = (): CitaOperador[] => [
  citaOperador({ accionesPermitidas: ['INICIAR_ATENCION', 'COMPLETAR'] }),
  citaOperador({
    id: 'c-2',
    codigo: 'CIT002',
    estado: 'COMPLETADA',
    estadoEtiqueta: 'Completada',
    accionesPermitidas: [],
  }),
];

describe('TablaCitasOperadorComponent', () => {
  it('con cargando dibuja 4 filas esqueleto ocultas para lectores de pantalla', async () => {
    const { el } = await crear({ cargando: true });
    const contenedor = el.querySelector('.contenedor-citas')!;
    expect(contenedor.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelectorAll('tr.cita').length).toBe(4);
    expect(el.querySelector('button')).toBeNull();
  });

  it('pinta una fila por cita con roles de tabla, encabezado de fila y leyenda', async () => {
    const { el } = await crear({ citas: varias(), leyenda: 'Citas del 06 nov 2026' });
    expect(el.querySelector('table')!.getAttribute('role')).toBe('table');
    expect(normalizar(el.querySelector('caption')!.textContent)).toBe('Citas del 06 nov 2026');
    const filas = el.querySelectorAll('tbody tr');
    expect(filas.length).toBe(2);
    const encabezado = filas[0].querySelector('th[scope="row"]')!;
    expect(normalizar(encabezado.textContent)).toBe('Ana Demo CIT001');
    expect(normalizar(filas[0].querySelector('.cita__hora')!.textContent)).toBe('10:30');
    const llegada = filas[0].querySelector('.cita__llegada')!;
    expect(llegada.querySelector('time')!.getAttribute('datetime')).toBe('2026-11-06T15:25:00Z');
    expect(normalizar(llegada.querySelector('time')!.textContent)).toBe('10:25');
    // La etiqueta «Llegada:» solo se ve en las tarjetas; para lectores ya está la columna.
    expect(llegada.querySelector('.cita__etiqueta-movil')!.getAttribute('aria-hidden')).toBe(
      'true',
    );
    expect(filas[1].classList.contains('cita--cerrada')).toBe(true);
    expect(normalizar(filas[1].querySelector('.cita__acciones')!.textContent)).toBe(
      'Sin acciones disponibles',
    );
  });

  it('la primera acción es la principal y cada botón emite su acción', async () => {
    const { el, emitidas } = await crear({ citas: varias() });
    const [principal, secundaria] = Array.from(el.querySelectorAll('button'));
    expect(principal.classList.contains('btn--primario')).toBe(true);
    expect(secundaria.classList.contains('btn--primario')).toBe(false);
    expect(normalizar(secundaria.textContent)).toBe('Completar atención: CIT001, Ana Demo');

    secundaria.click();
    expect(emitidas).toEqual([{ cita: varias()[0], accion: 'COMPLETAR' }]);
  });

  it('con una acción en curso muestra el spinner en su botón y bloquea los demás', async () => {
    const { el } = await crear({
      citas: varias(),
      enCurso: { id: 'c-1', accion: 'COMPLETAR' },
      idExplicacion: 'nota',
    });
    const [principal, secundaria] = Array.from(el.querySelectorAll('button'));
    expect(secundaria.classList.contains('btn--cargando')).toBe(true);
    expect(principal.classList.contains('btn--cargando')).toBe(false);
    for (const b of [principal, secundaria]) {
      expect(b.getAttribute('aria-disabled')).toBe('true');
      expect(b.getAttribute('aria-describedby')).toBe('nota');
      // aria-disabled (no disabled): el botón conserva el foco.
      expect(b.disabled).toBe(false);
    }
    expect(el.querySelector('tr.cita')!.classList.contains('cita--en-curso')).toBe(true);
  });
});
