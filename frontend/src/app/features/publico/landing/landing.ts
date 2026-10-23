import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { BENEFICIOS, CONFIANZA, EQUIPO, PASOS, PREGUNTAS, SELLOS_HERO } from './contenido';
import { IlustracionHeroComponent } from './ilustracion-hero';
import { LandingSeccionesComponent } from './landing-secciones';

/**
 * Página pública de presentación («/», solo sin sesión): portada con llamadas a crear cuenta e
 * iniciar sesión, beneficios, «Cómo funciona», confianza (seguridad, Ley N.º 29733 y
 * accesibilidad), el equipo de la sede, preguntas frecuentes y una llamada final.
 * Ocupa todo el ancho: la app no le pone el `.contenedor` (ver `app.ts`).
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, IlustracionHeroComponent, LandingSeccionesComponent],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class LandingComponent {
  protected readonly sellos = SELLOS_HERO;
  protected readonly beneficios = BENEFICIOS;
  protected readonly pasos = PASOS;
  protected readonly confianza = CONFIANZA;
  protected readonly equipo = EQUIPO;
  protected readonly preguntas = PREGUNTAS;
}
