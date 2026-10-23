import { Injectable, signal } from '@angular/core';

export type TipoAviso = 'exito' | 'error' | 'advertencia' | 'info';

export interface AvisoFlash {
  tipo: TipoAviso;
  texto: string;
}

/**
 * Mensaje de resultado que sobrevive a una navegación (p. ej. «Tu cita fue reprogramada»
 * al volver al detalle). Vive solo en memoria y se consume una vez.
 */
@Injectable({ providedIn: 'root' })
export class AvisoFlashService {
  private readonly pendiente = signal<AvisoFlash | null>(null);

  publicar(aviso: AvisoFlash): void {
    this.pendiente.set(aviso);
  }

  consumir(): AvisoFlash | null {
    const aviso = this.pendiente();
    this.pendiente.set(null);
    return aviso;
  }
}
