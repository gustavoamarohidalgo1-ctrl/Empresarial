import { Pipe, PipeTransform } from '@angular/core';
import {
  EntradaFecha,
  formatearDiaLargo,
  formatearFecha,
  formatearFechaHora,
  formatearHora,
} from '../utils/fecha-lima';

export type FormatoFechaLima = 'fecha-hora' | 'fecha' | 'hora' | 'dia';

/**
 * Muestra un instante UTC de la API en hora de Lima.
 * Uso: `{{ cita.inicio | fechaLima }}` → «04 nov 2026, 09:00»;
 * `{{ cita.inicio | fechaLima: 'hora' }}` → «09:00».
 */
@Pipe({ name: 'fechaLima' })
export class FechaLimaPipe implements PipeTransform {
  transform(valor: EntradaFecha, formato: FormatoFechaLima = 'fecha-hora'): string {
    switch (formato) {
      case 'fecha':
        return formatearFecha(valor);
      case 'hora':
        return formatearHora(valor);
      case 'dia':
        return formatearDiaLargo(valor);
      default:
        return formatearFechaHora(valor);
    }
  }
}
