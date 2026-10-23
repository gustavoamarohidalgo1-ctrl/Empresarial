import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconoComponent } from '../../../shared/ui/icono/icono';
import { DocumentoComponent, EntradaIndice } from '../compartido/documento/documento';
import { VERSION_PRIVACIDAD } from './version';

export { VERSION_PRIVACIDAD };

export const INDICE_PRIVACIDAD: readonly EntradaIndice[] = [
  { id: 'privacidad-responsable', texto: 'Quién trata tus datos' },
  { id: 'privacidad-datos', texto: 'Qué datos tratamos' },
  { id: 'privacidad-sensibles', texto: 'Datos sensibles: tu salud' },
  { id: 'privacidad-finalidades', texto: 'Para qué los usamos' },
  { id: 'privacidad-base-legal', texto: 'Base legal' },
  { id: 'privacidad-destinatarios', texto: 'Con quién los compartimos' },
  { id: 'privacidad-conservacion', texto: 'Cuánto tiempo los conservamos' },
  { id: 'privacidad-seguridad', texto: 'Cómo los protegemos' },
  { id: 'privacidad-cookies', texto: 'Cookies y almacenamiento' },
  { id: 'privacidad-derechos', texto: 'Tus derechos (ARCO)' },
  { id: 'privacidad-cambios', texto: 'Cambios a esta política' },
];

/** Política de privacidad de SIGA-SP (Ley N.º 29733 y su reglamento, D.S. N.º 016-2024-JUS). */
@Component({
  selector: 'app-privacidad',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DocumentoComponent, IconoComponent],
  templateUrl: './privacidad.html',
})
export class PrivacidadComponent {
  protected readonly indice = INDICE_PRIVACIDAD;
  protected readonly version = VERSION_PRIVACIDAD;
}
