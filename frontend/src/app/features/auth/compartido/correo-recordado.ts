import { Injectable } from '@angular/core';

/**
 * Recuerda en memoria el último correo escrito en una pantalla de cuenta para no pedirlo dos
 * veces (p. ej. de «Crear cuenta» a «Iniciar sesión» si el correo ya estaba registrado).
 * Nunca va a la URL ni al almacenamiento del navegador, y se consume una sola vez.
 */
@Injectable({ providedIn: 'root' })
export class CorreoRecordadoService {
  private correo: string | null = null;

  recordar(correo: string): void {
    const limpio = correo.trim();
    this.correo = limpio || null;
  }

  consumir(): string | null {
    const correo = this.correo;
    this.correo = null;
    return correo;
  }
}
