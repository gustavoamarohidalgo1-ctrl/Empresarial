import { Params } from '@angular/router';
import { ResultadoAuditoria } from '../../../core/modelos/contrato';
import { esFechaIsoValida } from '../../../shared/utils/fecha-lima';
import { ORDEN_RESULTADOS } from './formato-auditoria';

/** Filtro de `GET /admin/auditoria`. Fechas locales de Lima (`YYYY-MM-DD`), opcionales. */
export interface FiltroBitacora {
  desde: string | null;
  hasta: string | null;
  accion: string | null;
  resultado: ResultadoAuditoria | null;
  /** Correo exacto. Nunca va a la URL (dato personal): vive solo en la pantalla. */
  usuario: string | null;
  pagina: number;
  tamano: number;
}

export const TAMANOS_PAGINA: readonly number[] = [25, 50, 100];
export const TAMANO_POR_DEFECTO = 25;

export const FILTRO_BITACORA_VACIO: FiltroBitacora = {
  desde: null,
  hasta: null,
  accion: null,
  resultado: null,
  usuario: null,
  pagina: 0,
  tamano: TAMANO_POR_DEFECTO,
};

const PATRON_ACCION = /^[A-Z0-9_]{1,80}$/;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function entero(valor: string | null, minimo: number, maximo: number): number | null {
  if (valor === null || !/^\d{1,6}$/.test(valor)) return null;
  const n = Number(valor);
  return n >= minimo && n <= maximo ? n : null;
}

/**
 * Lee el filtro de la URL. Lo inválido se ignora. El correo nunca se lee de la URL.
 * La página llega en base 1 (`pagina=2` es la segunda) y se guarda en base 0, como la API.
 */
export function leerFiltroBitacora(parametro: (nombre: string) => string | null): FiltroBitacora {
  const fecha = (n: string) => {
    const v = parametro(n);
    return v && esFechaIsoValida(v) ? v : null;
  };
  const accion = parametro('accion');
  const resultado = parametro('resultado');
  const tamano = entero(parametro('tamano'), 1, 100);
  const pagina = entero(parametro('pagina'), 1, 100_000);
  return {
    desde: fecha('desde'),
    hasta: fecha('hasta'),
    accion: accion && PATRON_ACCION.test(accion) ? accion : null,
    resultado: ORDEN_RESULTADOS.includes(resultado as ResultadoAuditoria)
      ? (resultado as ResultadoAuditoria)
      : null,
    usuario: null,
    pagina: pagina === null ? 0 : pagina - 1,
    tamano: tamano !== null && TAMANOS_PAGINA.includes(tamano) ? tamano : TAMANO_POR_DEFECTO,
  };
}

/** `queryParams` del filtro (sin el correo; se omite lo que tiene el valor por defecto). */
export function parametrosBitacora(filtro: FiltroBitacora): Params {
  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    accion: filtro.accion,
    resultado: filtro.resultado,
    pagina: filtro.pagina > 0 ? filtro.pagina + 1 : null,
    tamano: filtro.tamano !== TAMANO_POR_DEFECTO ? filtro.tamano : null,
  };
}

/** Parámetros de la API (`pagina` en base 0). */
export function consultaBitacora(filtro: FiltroBitacora): Record<string, string> {
  const consulta: Record<string, string> = {
    pagina: String(filtro.pagina),
    tamano: String(filtro.tamano),
  };
  for (const k of ['desde', 'hasta', 'accion', 'resultado', 'usuario'] as const) {
    const v = filtro[k];
    if (v) consulta[k] = v;
  }
  return consulta;
}

export interface ErrorFiltro {
  campo: 'desde' | 'hasta' | 'usuario';
  mensaje: string;
}

/** Valida el formulario antes de consultar (fechas y correo). */
export function validarFiltroBitacora(filtro: FiltroBitacora): ErrorFiltro[] {
  const errores: ErrorFiltro[] = [];
  if (filtro.desde && !esFechaIsoValida(filtro.desde)) {
    errores.push({ campo: 'desde', mensaje: 'Escribe una fecha válida.' });
  }
  if (filtro.hasta && !esFechaIsoValida(filtro.hasta)) {
    errores.push({ campo: 'hasta', mensaje: 'Escribe una fecha válida.' });
  }
  if (filtro.desde && filtro.hasta && filtro.desde > filtro.hasta && !errores.length) {
    errores.push({
      campo: 'hasta',
      mensaje: 'La fecha final debe ser igual o posterior a la inicial.',
    });
  }
  if (filtro.usuario && (!PATRON_CORREO.test(filtro.usuario) || filtro.usuario.length > 160)) {
    errores.push({
      campo: 'usuario',
      mensaje: 'Escribe un correo válido, por ejemplo nombre@dominio.pe.',
    });
  }
  return errores;
}

/** Cantidad de filtros aplicados (sin contar la paginación). */
export function filtrosActivos(filtro: FiltroBitacora): number {
  return [filtro.desde, filtro.hasta, filtro.accion, filtro.resultado, filtro.usuario].filter(
    Boolean,
  ).length;
}
