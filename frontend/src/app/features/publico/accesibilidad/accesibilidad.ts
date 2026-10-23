import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { DocumentoComponent, EntradaIndice } from '../compartido/documento/documento';

export const INDICE_ACCESIBILIDAD: readonly EntradaIndice[] = [
  { id: 'accesibilidad-compromiso', texto: 'Nuestro compromiso' },
  { id: 'accesibilidad-funciones', texto: 'Funciones de accesibilidad' },
  { id: 'accesibilidad-compatibilidad', texto: 'Compatibilidad' },
  { id: 'accesibilidad-evaluacion', texto: 'Cómo lo evaluamos' },
  { id: 'accesibilidad-contacto', texto: 'Reporta una barrera' },
];

/** Declaración de accesibilidad de SIGA-SP (WCAG 2.2, nivel AA). */
@Component({
  selector: 'app-accesibilidad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DocumentoComponent, IconoComponent],
  templateUrl: './accesibilidad.html',
})
export class AccesibilidadComponent {
  protected readonly indice = INDICE_ACCESIBILIDAD;
}
