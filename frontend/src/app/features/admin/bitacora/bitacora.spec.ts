import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { entradaAuditoria, paginaAuditoria } from '../../../../testing/indicadores-prueba';
import { boton, botones, elegir, escribir } from '../../../../testing/dom';
import { PaginaAuditoria } from '../../../core/modelos/contrato';
import { BitacoraComponent } from './bitacora';

const URL_API = '/api/v1/admin/auditoria';

const normalizar = (t: string | null | undefined) => (t ?? '').replace(/\s+/g, ' ').trim();

/** Texto con un espacio entre nodos (las celdas no llevan espacios entre sí). */
function textoDe(el: Element | null | undefined): string {
  if (!el) return '';
  const recorrido = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const partes: string[] = [];
  while (recorrido.nextNode()) partes.push(recorrido.currentNode.textContent ?? '');
  return normalizar(partes.join(' '));
}

describe('BitacoraComponent', () => {
  let http: HttpTestingController;
  let harness: RouterTestingHarness;
  let host: HTMLElement;

  async function abrir(url = '/admin/bitacora') {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'admin/bitacora', component: BitacoraComponent }]),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url, BitacoraComponent);
    host = harness.routeNativeElement!;
    await estable();
  }

  const estable = () => harness.fixture.whenStable();
  const solicitud = () => http.expectOne((r) => r.url === URL_API);
  async function responder(pagina: PaginaAuditoria = paginaAuditoria()) {
    solicitud().flush(pagina);
    await estable();
  }
  const filas = () => Array.from(host.querySelectorAll<HTMLTableRowElement>('tbody tr.bit__fila'));
  const anuncio = () =>
    normalizar(host.querySelector('p.solo-lectores[role="status"]')?.textContent);
  const url = () => TestBed.inject(Router).url;

  afterEach(() => http.verify());

  it('muestra esqueletos y luego la tabla con fecha de Lima, actor, acción, entidad, resultado y solicitud', async () => {
    await abrir();
    const resultados = host.querySelector('section.bit__resultados')!;
    expect(resultados.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelectorAll('tbody tr app-esqueleto').length).toBeGreaterThan(0);
    const peticion = solicitud();
    expect(peticion.request.params.get('pagina')).toBe('0');
    expect(peticion.request.params.get('tamano')).toBe('25');
    peticion.flush(paginaAuditoria());
    await estable();

    expect(resultados.getAttribute('aria-busy')).toBe('false');
    expect(filas()).toHaveLength(3);
    const celdas = (i: number) => Array.from(filas()[i].children).map((c) => textoDe(c));
    expect(celdas(0)).toEqual([
      '23 oct 2026 09:14:05',
      'Ana Lucía Torres Paciente',
      'Confirmar cita CITA_CONFIRMAR',
      'Cita 0b6c4f2a…',
      'Resultado: Éxito',
      '7f3c2a9e4b1d Copiar el ID de solicitud 7f3c2a9e4b1d',
      'Detalle del registro 812: Confirmar cita, 23 oct 2026 09:14:05',
    ]);
    expect(celdas(1).slice(1, 3)).toEqual([
      'Sistema Proceso automático',
      'Cerrar cita por inasistencia CITA_MARCAR_NO_ASISTIO',
    ]);
    expect(celdas(1)[5]).toBe('—');
    expect(celdas(2)[4]).toBe('Resultado: Rechazo VERSION_OBSOLETA');
    // En móvil cada celda muestra su etiqueta (tabla apilable).
    expect(filas()[0].querySelector('td')?.getAttribute('data-etiqueta')).toBe('Fecha y hora');
    expect(host.querySelector('table')?.classList).toContain('tabla--apilable');
    expect(textoDe(host.querySelector('.bit__meta'))).toContain('60 registros');
    expect(anuncio()).toBe('60 registros. Página 1 de 3.');
  });

  it('es de solo lectura: no ofrece acciones de edición', async () => {
    await abrir();
    await responder();
    expect(textoDe(host.querySelector('app-encabezado-pagina'))).toContain('Solo lectura');
    const textos = botones(harness.fixture).map((b) => normalizar(b.textContent));
    expect(textos.some((t) => /editar|eliminar|borrar|modificar/i.test(t))).toBe(false);
  });

  it('el desplegable de acciones usa textos legibles; aplicar consulta la API y la URL no lleva el correo', async () => {
    await abrir();
    await responder();
    const accion = host.querySelector<HTMLSelectElement>('#bitacora-accion')!;
    expect(Array.from(accion.options).map((o) => o.text.trim())).toEqual([
      'Todas las acciones',
      'Cancelar cita',
      'Confirmar cita',
      'Iniciar sesión',
    ]);

    elegir(accion, 'CITA_CANCELAR');
    elegir(host.querySelector<HTMLSelectElement>('#bitacora-resultado')!, 'DENEGADO');
    escribir(host.querySelector<HTMLInputElement>('#bitacora-usuario')!, ' ana@correo.pe ');
    boton(harness.fixture, 'Aplicar filtros')!.click();
    await estable();

    const peticion = solicitud();
    expect(peticion.request.params.get('accion')).toBe('CITA_CANCELAR');
    expect(peticion.request.params.get('resultado')).toBe('DENEGADO');
    expect(peticion.request.params.get('usuario')).toBe('ana@correo.pe');
    expect(peticion.request.params.get('pagina')).toBe('0');
    expect(url()).toBe('/admin/bitacora?accion=CITA_CANCELAR&resultado=DENEGADO');
    expect(url()).not.toContain('correo');
    peticion.flush(paginaAuditoria({ elementos: [], total: 0 }));
    await estable();
    expect(textoDe(host.querySelector('#bitacora-filtros-titulo'))).toContain('3 activos');
    expect(host.textContent).toContain('No hay registros con estos filtros');

    boton(harness.fixture, 'Quitar filtros')!.click();
    await estable();
    expect(solicitud().request.params.keys().sort()).toEqual(['pagina', 'tamano']);
    expect(url()).toBe('/admin/bitacora');
  });

  it('valida el formulario y lleva el foco al primer campo con error', async () => {
    await abrir();
    await responder();
    const desde = host.querySelector<HTMLInputElement>('#bitacora-desde')!;
    const hasta = host.querySelector<HTMLInputElement>('#bitacora-hasta')!;
    desde.value = '2026-10-10';
    desde.dispatchEvent(new Event('change'));
    hasta.value = '2026-10-01';
    hasta.dispatchEvent(new Event('change'));
    escribir(host.querySelector<HTMLInputElement>('#bitacora-usuario')!, 'ana@');
    boton(harness.fixture, 'Aplicar filtros')!.click();
    await estable();

    http.expectNone((r) => r.url === URL_API);
    expect(host.querySelector('#bitacora-hasta-error')?.textContent).toContain('igual o posterior');
    expect(host.querySelector('#bitacora-usuario-error')?.textContent).toContain('correo válido');
    expect(hasta.getAttribute('aria-invalid')).toBe('true');
    expect(hasta.getAttribute('aria-describedby')).toBe('bitacora-hasta-error');
    expect(document.activeElement).toBe(hasta);

    hasta.value = '2026-10-31';
    hasta.dispatchEvent(new Event('change'));
    await estable();
    expect(host.querySelector('#bitacora-hasta-error')).toBeNull();
  });

  it('pagina con «Siguiente», «Anterior» y el tamaño de página, conservando la tabla atenuada', async () => {
    await abrir();
    await responder();
    expect(textoDe(host.querySelector('.bit__rango'))).toBe('Mostrando 1–25 de 60');
    expect(boton(harness.fixture, /Anterior/)!.getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('nav[aria-label="Paginación de la bitácora"]')).not.toBeNull();

    boton(harness.fixture, /Siguiente/)!.click();
    await estable();
    const peticion = solicitud();
    expect(peticion.request.params.get('pagina')).toBe('1');
    expect(url()).toBe('/admin/bitacora?pagina=2');
    expect(host.querySelector('.bit__atenuada')).not.toBeNull();
    peticion.flush(paginaAuditoria({ pagina: 1, elementos: [entradaAuditoria({ id: 700 })] }));
    await estable();
    expect(textoDe(host.querySelector('.bit__rango'))).toBe('Mostrando 26–50 de 60');
    expect(textoDe(host.querySelector('.bit__pagina-actual'))).toBe('Página 2 de 3');
    expect(anuncio()).toBe('60 registros. Página 2 de 3.');

    elegir(host.querySelector<HTMLSelectElement>('#bitacora-tamano')!, '50');
    await estable();
    const porTamano = solicitud();
    expect(porTamano.request.params.get('tamano')).toBe('50');
    expect(porTamano.request.params.get('pagina')).toBe('0');
    expect(url()).toBe('/admin/bitacora?tamano=50');
    porTamano.flush(paginaAuditoria({ tamano: 50 }));
    await estable();
  });

  it('aplica los filtros de un enlace compartido', async () => {
    await abrir('/admin/bitacora?accion=LOGOUT&resultado=FALLO&pagina=3');
    const peticion = solicitud();
    expect(peticion.request.params.get('accion')).toBe('LOGOUT');
    expect(peticion.request.params.get('pagina')).toBe('2');
    peticion.flush(paginaAuditoria({ pagina: 2 }));
    await estable();
    const accion = host.querySelector<HTMLSelectElement>('#bitacora-accion')!;
    expect(accion.value).toBe('LOGOUT');
    expect(accion.selectedOptions[0].text.trim()).toBe('Cerrar sesión');
    expect(host.querySelector<HTMLSelectElement>('#bitacora-resultado')!.value).toBe('FALLO');
  });

  it('abre el panel de detalle al elegir una fila, mueve el foco y lo devuelve al cerrar', async () => {
    await abrir();
    await responder();
    const ver = host.querySelector<HTMLButtonElement>('#bitacora-ver-810')!;
    expect(ver.getAttribute('aria-expanded')).toBe('false');
    ver.click();
    await estable();

    const panel = host.querySelector('app-detalle-registro')!;
    expect(panel.id).toBe('bitacora-detalle');
    expect(ver.getAttribute('aria-expanded')).toBe('true');
    expect(ver.getAttribute('aria-controls')).toBe('bitacora-detalle');
    expect(document.activeElement?.id).toBe('bitacora-detalle-titulo');
    const texto = textoDe(panel);
    expect(texto).toContain('Registro #810');
    expect(texto).toContain('Iniciar atención (operador)');
    expect(texto).toContain('Omar Operador Operador');
    expect(texto).toContain('VERSION_OBSOLETA');
    expect(texto).toContain('La cita cambió');
    expect(texto).toContain('0b6c4f2a-1111-2222-3333-444455556666');
    expect(filas()[2].classList).toContain('bit__fila--activa');
    expect(host.querySelector('.bit__cuerpo--con-detalle')).not.toBeNull();

    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await estable();
    expect(host.querySelector('app-detalle-registro')).toBeNull();
    expect(document.activeElement).toBe(ver);

    // Con el ratón, toda la fila abre el detalle.
    filas()[1].querySelector('td')!.click();
    await estable();
    expect(textoDe(host.querySelector('app-detalle-registro'))).toContain(
      'Proceso automático, sin usuario',
    );
    boton(harness.fixture, 'Cerrar el detalle')!.click();
    await estable();
    expect(document.activeElement?.id).toBe('bitacora-ver-811');
  });

  it('distingue al visitante sin sesión del proceso automático del sistema', async () => {
    await abrir();
    await responder(
      paginaAuditoria({
        elementos: [
          entradaAuditoria({
            id: 905,
            actor: null,
            accion: 'LOGIN',
            entidad: 'SESION',
            entidadId: null,
            resultado: 'DENEGADO',
            codigo: 'CUENTA_BLOQUEADA_TEMPORALMENTE',
          }),
          entradaAuditoria({
            id: 904,
            actor: null,
            accion: 'RECUPERACION_SOLICITAR',
            entidad: 'USUARIO',
          }),
          entradaAuditoria({
            id: 903,
            actor: null,
            accion: 'CONTRASENA_RESTABLECER',
            entidad: 'USUARIO',
            resultado: 'RECHAZO',
            codigo: 'ENLACE_INVALIDO',
          }),
          entradaAuditoria({
            id: 902,
            actor: null,
            accion: 'REGISTRO',
            entidad: 'USUARIO',
            entidadId: null,
            resultado: 'RECHAZO',
            codigo: 'CORREO_REGISTRADO',
          }),
          entradaAuditoria({
            id: 901,
            actor: null,
            accion: 'CITA_MARCAR_NO_ASISTIO',
            requestId: null,
          }),
        ],
        total: 5,
      }),
    );
    const actores = filas().map((f) => textoDe(f.querySelector('td[data-etiqueta="Actor"]')));
    expect(actores).toEqual([
      'Visitante sin sesión Sin identificar',
      'Visitante sin sesión Sin identificar',
      'Visitante sin sesión Sin identificar',
      'Visitante sin sesión Sin identificar',
      'Sistema Proceso automático',
    ]);
    // Cada uno con su icono decorativo.
    const icono = (i: number) =>
      filas()[i].querySelector('td[data-etiqueta="Actor"] app-icono.bit__icono-actor');
    expect(icono(0)).not.toBeNull();
    expect(icono(4)).not.toBeNull();
    expect(icono(0)!.innerHTML).not.toBe(icono(4)!.innerHTML);

    host.querySelector<HTMLButtonElement>('#bitacora-ver-905')!.click();
    await estable();
    let panel = textoDe(host.querySelector('app-detalle-registro'));
    expect(panel).toContain('Visitante sin sesión');
    expect(panel).toContain('la bitácora no identifica a la persona');
    expect(panel).not.toContain('Proceso automático');
    expect(panel).toContain('bloqueada temporalmente');

    host.querySelector<HTMLButtonElement>('#bitacora-ver-901')!.click();
    await estable();
    panel = textoDe(host.querySelector('app-detalle-registro'));
    expect(panel).toContain('Sistema Proceso automático, sin usuario');
    expect(panel).toContain('Sin ID (acción del sistema)');
    expect(panel).not.toContain('Visitante');
  });

  describe('copiar el ID de solicitud', () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    afterEach(() => {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else delete (navigator as { clipboard?: unknown }).clipboard;
    });

    function simularPortapapeles(writeText: (t: string) => Promise<void>) {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    }

    it('lo copia, lo anuncia y muestra la confirmación', async () => {
      const copiados: string[] = [];
      simularPortapapeles(async (t) => {
        copiados.push(t);
      });
      await abrir();
      await responder();
      boton(harness.fixture, /Copiar el ID de solicitud 7f3c2a9e4b1d/)!.click();
      await new Promise((r) => setTimeout(r));
      await estable();
      expect(copiados).toEqual(['7f3c2a9e4b1d']);
      expect(anuncio()).toBe('ID de solicitud copiado: 7f3c2a9e4b1d.');
    });

    it('si el navegador lo impide, explica cómo copiarlo a mano', async () => {
      simularPortapapeles(() => Promise.reject(new Error('denegado')));
      await abrir();
      await responder();
      boton(harness.fixture, /Copiar el ID de solicitud 7f3c2a9e4b1d/)!.click();
      await new Promise((r) => setTimeout(r));
      await estable();
      expect(anuncio()).toContain('No pudimos copiar');
    });
  });

  it('sin filtros y sin datos dice que aún no hay registros', async () => {
    await abrir();
    await responder(paginaAuditoria({ elementos: [], total: 0, acciones: [] }));
    expect(host.textContent).toContain('Aún no hay registros');
    expect(host.querySelector('nav.bit__paginacion')).toBeNull();
  });

  it('si falla muestra el error con «Reintentar» y el foco pasa al título', async () => {
    await abrir();
    solicitud().flush({ codigo: 'ACCESO_DENEGADO' }, { status: 403, statusText: 'Prohibido' });
    await estable();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'No pudimos cargar la bitácora',
    );
    boton(harness.fixture, 'Reintentar')!.click();
    await estable();
    expect(document.activeElement?.id).toBe('bitacora-registros-titulo');
    await responder();
    expect(filas()).toHaveLength(3);
  });
});
