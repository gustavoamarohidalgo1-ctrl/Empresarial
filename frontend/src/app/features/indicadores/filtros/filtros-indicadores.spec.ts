import { ComponentFixture, TestBed } from '@angular/core/testing';
import { boton, elegir } from '../../../../testing/dom';
import { FiltroIndicadores, filtroPorDefecto, leerFiltro } from '../modelo/periodo';
import { FiltrosIndicadoresComponent } from './filtros-indicadores';

const HOY = '2026-10-23';
const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

const SEDES = [
  { codigo: 'SURCO', nombre: 'Sede Surco', direccion: null },
  { codigo: 'MIRAFLORES', nombre: 'Sede Miraflores', direccion: null },
];
const ESPECIALIDADES = [
  { codigo: 'CARDIO', nombre: 'Cardiología', descripcion: null },
  { codigo: 'DERMA', nombre: 'Dermatología', descripcion: null },
];
const PROFESIONALES = [
  {
    codigo: 'P02',
    nombre: 'Dra. Lucía Paredes',
    especialidad: { codigo: 'CARDIO', nombre: 'Cardiología' },
  },
  {
    codigo: 'P05',
    nombre: 'Dr. Andrés Quispe',
    especialidad: { codigo: 'DERMA', nombre: 'Dermatología' },
  },
];

describe('FiltrosIndicadoresComponent', () => {
  let fixture: ComponentFixture<FiltrosIndicadoresComponent>;
  let host: HTMLElement;
  let emitidos: FiltroIndicadores[];

  async function crear(filtro: FiltroIndicadores = filtroPorDefecto(HOY)) {
    fixture = TestBed.createComponent(FiltrosIndicadoresComponent);
    fixture.componentRef.setInput('filtro', filtro);
    fixture.componentRef.setInput('hoy', HOY);
    fixture.componentRef.setInput('sedes', SEDES);
    fixture.componentRef.setInput('especialidades', ESPECIALIDADES);
    fixture.componentRef.setInput('profesionales', PROFESIONALES);
    emitidos = [];
    // La página aplica el filtro: se simula devolviéndolo como entrada.
    fixture.componentInstance.cambiar.subscribe((f) => {
      emitidos.push(f);
      fixture.componentRef.setInput('filtro', f);
    });
    await fixture.whenStable();
    host = fixture.nativeElement as HTMLElement;
  }

  const radio = (id: string) =>
    host.querySelector<HTMLInputElement>(`input[name="filtro-periodo"][value="${id}"]`)!;
  const chips = () => Array.from(host.querySelectorAll<HTMLButtonElement>('.fi__chip'));

  it('ofrece los atajos de periodo como radios etiquetados dentro de un fieldset', async () => {
    await crear();
    expect(host.querySelector('fieldset legend')?.textContent?.trim()).toBe('Periodo');
    const etiquetas = Array.from(host.querySelectorAll('fieldset label')).map((l) =>
      normalizar(l.textContent),
    );
    expect(etiquetas).toEqual([
      'Este mes',
      'Últimos 7 días',
      'Últimos 30 días',
      'Mes anterior',
      'Personalizado',
    ]);
    expect(radio('este-mes').checked).toBe(true);
    expect(chips()).toHaveLength(0);
  });

  it('un atajo se aplica al instante con sus fechas', async () => {
    await crear();
    radio('ultimos-7').click();
    await fixture.whenStable();
    expect(emitidos.at(-1)).toMatchObject({
      periodo: 'ultimos-7',
      desde: '2026-10-17',
      hasta: HOY,
    });
    expect(normalizar(chips()[0].textContent)).toMatch(
      /^Periodo: Últimos 7 días ?\. Quitar este filtro$/,
    );
  });

  it('«Personalizado» pide las fechas, las valida y se aplica con «Aplicar periodo»', async () => {
    await crear();
    radio('personalizado').click();
    await fixture.whenStable();
    expect(emitidos).toHaveLength(0);
    const desde = host.querySelector<HTMLInputElement>('#filtro-desde')!;
    const hasta = host.querySelector<HTMLInputElement>('#filtro-hasta')!;
    expect(desde.value).toBe('2026-10-01');

    desde.value = '2026-10-20';
    desde.dispatchEvent(new Event('change'));
    hasta.value = '2026-10-05';
    hasta.dispatchEvent(new Event('change'));
    boton(fixture, 'Aplicar periodo')!.click();
    await fixture.whenStable();
    expect(emitidos).toHaveLength(0);
    expect(host.querySelector('#filtro-rango-error')?.textContent).toContain('anterior o igual');
    expect(desde.getAttribute('aria-invalid')).toBe('true');
    expect(desde.getAttribute('aria-describedby')).toContain('filtro-rango-error');

    hasta.value = '2026-10-22';
    hasta.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    expect(host.querySelector('#filtro-rango-error')).toBeNull();
    boton(fixture, 'Aplicar periodo')!.click();
    await fixture.whenStable();
    expect(emitidos.at(-1)).toMatchObject({
      periodo: 'personalizado',
      desde: '2026-10-20',
      hasta: '2026-10-22',
    });
    expect(normalizar(chips()[0].textContent)).toContain('Periodo: 20 oct 2026 – 22 oct 2026');
  });

  it('sede, especialidad y profesional se eligen de los catálogos; el profesional depende de la especialidad', async () => {
    await crear();
    const profesional = () => host.querySelector<HTMLSelectElement>('#filtro-profesional')!;
    expect(Array.from(profesional().options).map((o) => o.text.trim())).toEqual([
      'Todos los profesionales',
      'Dr. Andrés Quispe',
      'Dra. Lucía Paredes',
    ]);

    elegir(host.querySelector<HTMLSelectElement>('#filtro-sede')!, 'SURCO');
    elegir(profesional(), 'P05');
    await fixture.whenStable();
    expect(emitidos.at(-1)).toMatchObject({ sede: 'SURCO', profesional: 'P05' });

    // Al elegir otra especialidad, el profesional que no pertenece a ella se quita.
    elegir(host.querySelector<HTMLSelectElement>('#filtro-especialidad')!, 'CARDIO');
    await fixture.whenStable();
    expect(emitidos.at(-1)).toMatchObject({ especialidad: 'CARDIO', profesional: null });
    expect(Array.from(profesional().options).map((o) => o.value)).toEqual(['', 'P02']);
    expect(chips().map((c) => normalizar(c.querySelector('span')?.textContent))).toEqual([
      'Sede: Sede Surco',
      'Especialidad: Cardiología',
    ]);
  });

  it('los chips se quitan uno a uno y «Limpiar filtros» vuelve al mes en curso', async () => {
    await crear(
      leerFiltro(
        (n) =>
          (
            ({ periodo: 'mes-anterior', sede: 'SURCO', profesional: 'X9' }) as Record<
              string,
              string
            >
          )[n] ?? null,
        HOY,
      ).filtro,
    );
    // Un código que no está en el catálogo se muestra tal cual (enlace compartido).
    expect(chips().map((c) => normalizar(c.querySelector('span')?.textContent))).toEqual([
      'Periodo: Mes anterior',
      'Sede: Sede Surco',
      'Profesional: X9',
    ]);

    chips()[1].click();
    await fixture.whenStable();
    expect(emitidos.at(-1)).toMatchObject({
      periodo: 'mes-anterior',
      sede: null,
      profesional: 'X9',
    });
    expect(chips()).toHaveLength(2);
    expect(document.activeElement).toBe(chips()[1]);

    boton(fixture, 'Limpiar filtros')!.click();
    await fixture.whenStable();
    expect(emitidos.at(-1)).toEqual(filtroPorDefecto(HOY));
    expect(chips()).toHaveLength(0);
    expect(document.activeElement?.id).toBe('filtros-titulo');
  });

  it('avisa si los catálogos fallaron y permite reintentar', async () => {
    await crear();
    let reintentos = 0;
    fixture.componentInstance.reintentarCatalogos.subscribe(() => reintentos++);
    fixture.componentRef.setInput('errorCatalogos', true);
    await fixture.whenStable();
    expect(host.querySelector('.fi__aviso')?.textContent).toContain('No pudimos cargar las listas');
    boton(fixture, 'Reintentar')!.click();
    expect(reintentos).toBe(1);
  });
});
