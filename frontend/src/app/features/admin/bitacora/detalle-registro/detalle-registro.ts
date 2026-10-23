import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MENSAJES_POR_CODIGO } from '../../../../core/errores/error.service';
import { EntradaAuditoria } from '../../../../core/modelos/contrato';
import { IconoComponent } from '../../../../shared/ui/icono/icono';
import { formatearDiaLargo } from '../../../../shared/utils/fecha-lima';
import {
  actorSinUsuario,
  etiquetaAccion,
  etiquetaEntidad,
  etiquetaRol,
  explicacionCodigoAuditoria,
  fechaHoraLima,
  presentacionResultado,
} from '../formato-auditoria';
import { ResultadoAuditoriaComponent } from '../resultado-auditoria/resultado-auditoria';

export const ID_TITULO_DETALLE = 'bitacora-detalle-titulo';

/**
 * Panel de detalle de una entrada de la bitácora (solo lectura): todos los campos, con los
 * identificadores completos y copiables. Escape o «Cerrar» lo cierran; la página devuelve el
 * foco a la fila de origen.
 */
@Component({
  selector: 'app-detalle-registro',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent, ResultadoAuditoriaComponent],
  templateUrl: './detalle-registro.html',
  styleUrl: './detalle-registro.css',
  host: { '(keydown.escape)': 'cerrar.emit()' },
})
export class DetalleRegistroComponent {
  readonly entrada = input.required<EntradaAuditoria>();
  /** Valor recién copiado (muestra la confirmación junto a su botón). */
  readonly copiado = input<string | null>(null);

  readonly cerrar = output<void>();
  readonly copiar = output<{ valor: string; descripcion: string }>();

  protected readonly idTitulo = ID_TITULO_DETALLE;

  protected readonly vista = computed(() => {
    const e = this.entrada();
    const { hora } = fechaHoraLima(e.ocurridoEn);
    const resultado = presentacionResultado(e.resultado);
    return {
      accion: etiquetaAccion(e.accion),
      entidad: etiquetaEntidad(e.entidad),
      dia: formatearDiaLargo(e.ocurridoEn),
      hora,
      actor: e.actor
        ? { nombre: e.actor.nombre, rol: etiquetaRol(e.actor.rol), id: e.actor.id }
        : null,
      /** Sin actor: «Visitante sin sesión» o «Sistema», según la acción. */
      anonimo: e.actor ? null : actorSinUsuario(e.accion),
      descripcionResultado: resultado.descripcion,
      mensajeCodigo: e.codigo
        ? (explicacionCodigoAuditoria(e.codigo) ?? MENSAJES_POR_CODIGO[e.codigo] ?? null)
        : null,
    };
  });
}
