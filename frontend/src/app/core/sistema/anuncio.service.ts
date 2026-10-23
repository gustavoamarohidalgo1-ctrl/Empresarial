import { Injectable, signal } from '@angular/core';
import { TipoAviso } from '../avisos/aviso-flash.service';

/** Aviso global que la app muestra sobre la página de destino (p. ej. la bienvenida). */
export interface Anuncio {
  tipo: TipoAviso;
  titulo: string;
  texto: string;
  /** Acción opcional: enlace interno («Reservar cita»). */
  accion?: { texto: string; ruta: string };
}

/**
 * Anuncios del marco de la app (`app.html`), independientes de cada pantalla.
 *
 * Ciclo: `publicar()` lo deja pendiente; la app lo muestra al terminar la siguiente
 * navegación (`alNavegar()`), así no aparece en la página de origen, y lo retira en la
 * navegación posterior o cuando la persona lo cierra. Solo vive en memoria.
 */
@Injectable({ providedIn: 'root' })
export class AnuncioService {
  private pendiente: Anuncio | null = null;
  private readonly visibleActual = signal<Anuncio | null>(null);

  /** Anuncio que se muestra ahora mismo (o `null`). */
  readonly visible = this.visibleActual.asReadonly();

  publicar(anuncio: Anuncio): void {
    this.pendiente = anuncio;
  }

  /** Lo llama la app en cada `NavigationEnd`. */
  alNavegar(): void {
    this.visibleActual.set(this.pendiente);
    this.pendiente = null;
  }

  descartar(): void {
    this.visibleActual.set(null);
  }
}
