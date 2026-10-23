import { ChangeDetectionStrategy, Component, booleanAttribute, input, output } from '@angular/core';
import { AccionOperador, CitaOperador } from '../../../../core/modelos/contrato';
import { FechaLimaPipe } from '../../../../shared/pipes/fecha-lima.pipe';
import { EsqueletoComponent } from '../../../../shared/ui/esqueleto/esqueleto';
import { EstadoCitaComponent } from '../../../../shared/ui/estado-cita/estado-cita';
import { IconoComponent } from '../../../../shared/ui/icono/icono';
import { GRUPO_DE_ESTADO, ICONO_ACCION_OPERADOR } from '../resumen-dia';

/** Etiqueta de cada acción del operador (texto del botón). */
export const ETIQUETA_ACCION_OPERADOR: Readonly<Record<AccionOperador, string>> = {
  REGISTRAR_LLEGADA: 'Registrar llegada',
  PASAR_A_ESPERA: 'Pasar a espera',
  INICIAR_ATENCION: 'Iniciar atención',
  COMPLETAR: 'Completar atención',
};

export interface AccionSolicitada {
  cita: CitaOperador;
  accion: AccionOperador;
}

/**
 * Citas del día del operador: tabla en escritorio (≥ 60rem) y tarjetas en tablet y móvil, con
 * el mismo marcado (roles de tabla explícitos para que no se pierda la semántica al apilar).
 * La primera acción permitida es la principal (botón primario). Con `cargando` dibuja
 * esqueletos con la misma caja (CLS ≈ 0), ocultos para lectores de pantalla.
 */
@Component({
  selector: 'app-tabla-citas-operador',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EsqueletoComponent, EstadoCitaComponent, FechaLimaPipe, IconoComponent],
  templateUrl: './tabla-citas.html',
  styleUrl: './tabla-citas.css',
})
export class TablaCitasOperadorComponent {
  readonly citas = input<readonly CitaOperador[]>([]);
  /** Muestra filas esqueleto (sin datos). */
  readonly cargando = input(false, { transform: booleanAttribute });
  /** Título de la tabla para lectores de pantalla (`<caption>`). */
  readonly leyenda = input('');
  /** Acción en curso: su botón muestra el spinner y las demás quedan bloqueadas. */
  readonly enCurso = input<{ id: string; accion: AccionOperador } | null>(null);
  /** `id` del texto que explica por qué las acciones están bloqueadas. */
  readonly idExplicacion = input<string | null>(null);

  readonly accion = output<AccionSolicitada>();

  protected readonly etiquetaAccion = ETIQUETA_ACCION_OPERADOR;
  protected readonly iconoAccion = ICONO_ACCION_OPERADOR;
  protected readonly filasEsqueleto = [1, 2, 3, 4];

  protected esCerrada(cita: CitaOperador): boolean {
    const grupo = GRUPO_DE_ESTADO[cita.estado];
    return grupo === 'completadas' || grupo === 'cerradas';
  }
}
