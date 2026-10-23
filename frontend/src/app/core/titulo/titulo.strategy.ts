import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

export const NOMBRE_APP = 'SIGA-SP';

/** Título de página por ruta: «<título de la ruta> · SIGA-SP» (WCAG 2.4.2). */
@Injectable({ providedIn: 'root' })
export class TituloStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const titulo = this.buildTitle(snapshot);
    this.title.setTitle(titulo ? `${titulo} · ${NOMBRE_APP}` : NOMBRE_APP);
  }
}
