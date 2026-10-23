import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../../ui/icono/icono';
import { PaginaEstadoComponent } from './pagina-estado';

@Component({
  selector: 'app-no-encontrada',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconoComponent, PaginaEstadoComponent],
  template: `
    <app-pagina-estado
      ilustracion="no-encontrada"
      codigo="Error 404"
      titulo="Página no encontrada"
      texto="La dirección que abriste no existe en SIGA-SP."
    >
      <p class="texto-sm">Revisa que esté bien escrita o vuelve al inicio para continuar.</p>
      <a acciones class="btn btn--primario" routerLink="/">
        <app-icono nombre="house" /> Ir al inicio
      </a>
    </app-pagina-estado>
  `,
})
export class NoEncontradaComponent {}
