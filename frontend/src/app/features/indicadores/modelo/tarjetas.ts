import {
  Indicador,
  IndicadorReprogramacion,
  ResumenIndicadores,
} from '../../../core/modelos/contrato';
import { DatosIndicador } from '../tarjeta-indicador/tarjeta-indicador';
import { formatearEntero, formatearMinutos, formatearTasa, plural } from './formato';

type Base = Pick<DatosIndicador, 'id' | 'titulo' | 'icono' | 'tono'>;

/** Las cinco tarjetas del tablero, en orden. */
export const DEFINICIONES_TARJETAS: readonly Base[] = [
  { id: 'confirmacion', titulo: 'Confirmación', icono: 'check-circle', tono: 'confirmada' },
  { id: 'cancelacion', titulo: 'Cancelación', icono: 'x-circle', tono: 'cancelada' },
  { id: 'reprogramacion', titulo: 'Reprogramación', icono: 'calendar-clock', tono: 'reprogramada' },
  { id: 'inasistencia', titulo: 'Inasistencia', icono: 'user-x', tono: 'no-asistio' },
  { id: 'espera', titulo: 'Espera promedio', icono: 'hourglass', tono: 'espera' },
];

const VACIO: Omit<DatosIndicador, keyof Base> = {
  valor: '',
  detalle: '',
  medidor: null,
  nota: null,
  provisional: null,
};

/** Tarjetas sin datos (títulos e iconos para los esqueletos). */
export function tarjetasCargando(): DatosIndicador[] {
  return DEFINICIONES_TARJETAS.map((d) => ({ ...d, ...VACIO }));
}

function tasa(
  base: Base,
  indicador: Indicador,
  unidad: [string, string],
  sinDatos: string,
): DatosIndicador {
  const calculable = indicador.tasa !== null && indicador.denominador > 0;
  return {
    ...base,
    valor: formatearTasa(calculable ? indicador.tasa : null),
    detalle: `${formatearEntero(indicador.numerador)} de ${plural(indicador.denominador, ...unidad)}`,
    medidor: calculable ? Math.min(100, Math.max(0, indicador.tasa ?? 0)) : null,
    nota: calculable ? null : sinDatos,
    provisional: null,
  };
}

/** Explicación del distintivo «Provisional» de la inasistencia. */
export function explicacionProvisional(pendientes: number): string {
  return pendientes > 0
    ? `Hay ${plural(pendientes, 'cita vencida pendiente', 'citas vencidas pendientes')} de clasificar como atendida o sin asistencia. La tasa puede cambiar cuando se cierren.`
    : 'Aún hay citas vencidas por cerrar en el periodo. La tasa puede cambiar cuando se cierren.';
}

/**
 * Si alguna cita se reprogramó más de una vez, la tarjeta indica el total de reprogramaciones
 * (`eventos`), que la tasa no refleja.
 */
function notaReprogramaciones(indicador: IndicadorReprogramacion): Partial<DatosIndicador> {
  const eventos = Number(indicador.eventos);
  if (!Number.isFinite(eventos) || eventos <= indicador.numerador) return {};
  return {
    nota: `En total, ${plural(eventos, 'reprogramación', 'reprogramaciones')}: algunas citas se reprogramaron más de una vez.`,
  };
}

/** Datos de las cinco tarjetas a partir del resumen de la API. */
export function construirTarjetas(resumen: ResumenIndicadores): DatosIndicador[] {
  const i = resumen.indicadores;
  const [confirmacion, cancelacion, reprogramacion, inasistencia, espera] = DEFINICIONES_TARJETAS;
  const sinCitas = 'No hay citas en el periodo para calcularla.';
  const datosInasistencia = tasa(
    inasistencia,
    i.inasistencia,
    ['cita vencida', 'citas vencidas'],
    'Aún no hay citas vencidas en el periodo.',
  );
  const valorEspera = i.esperaPromedioMinutos.valor;
  const observaciones = i.esperaPromedioMinutos.observaciones;
  const excluidas = i.esperaPromedioMinutos.excluidas;

  return [
    tasa(confirmacion, i.confirmacion, ['cita', 'citas'], sinCitas),
    tasa(cancelacion, i.cancelacion, ['cita', 'citas'], sinCitas),
    {
      ...tasa(reprogramacion, i.reprogramacion, ['cita', 'citas'], sinCitas),
      ...notaReprogramaciones(i.reprogramacion),
    },
    {
      ...datosInasistencia,
      provisional: i.inasistencia.provisional
        ? explicacionProvisional(i.inasistencia.pendientesDeClasificar)
        : null,
    },
    {
      ...espera,
      valor: formatearMinutos(valorEspera !== null && observaciones > 0 ? valorEspera : null),
      detalle: `De ${plural(observaciones, 'atención medida', 'atenciones medidas')}`,
      medidor: null,
      nota:
        valorEspera === null || observaciones === 0
          ? 'Aún no hay atenciones con llegada registrada.'
          : excluidas > 0
            ? `${plural(excluidas, 'atención excluida', 'atenciones excluidas')} por datos incompletos.`
            : null,
      provisional: null,
    },
  ];
}
