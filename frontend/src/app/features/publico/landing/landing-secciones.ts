import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { MarcaComponent } from '../../../shared/ui/marca/marca';
import { Elemento, ElementoConEnlace } from './contenido';

/**
 * Segunda mitad de la portada: confianza (seguridad, privacidad y accesibilidad), el equipo
 * de la sede, preguntas frecuentes (`<details>` nativo) y la llamada final a crear cuenta.
 */
@Component({
  selector: 'app-landing-secciones',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, MarcaComponent],
  templateUrl: './landing-secciones.html',
  styleUrl: './landing-secciones.css',
})
export class LandingSeccionesComponent {
  readonly confianza = input.required<readonly ElementoConEnlace[]>();
  readonly equipo = input.required<readonly Elemento[]>();
  readonly preguntas = input.required<readonly { pregunta: string; respuesta: string }[]>();
}
