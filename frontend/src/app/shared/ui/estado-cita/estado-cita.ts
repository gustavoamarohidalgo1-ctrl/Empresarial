import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EstadoCita } from '../../../core/modelos/contrato';
import { IconoComponent } from '../icono/icono';
import { NombreIcono } from '../icono/iconos';

/** Etiquetas de respaldo si el servidor no envía `estadoEtiqueta`. */
export const ETIQUETA_ESTADO: Readonly<Record<EstadoCita, string>> = {
  PENDIENTE: 'Pendiente',
  CONFIRMADA: 'Confirmada',
  CHECK_IN: 'Check-in',
  EN_ESPERA: 'En espera',
  EN_ATENCION: 'En atención',
  COMPLETADA: 'Completada',
  CANCELADA: 'Cancelada',
  NO_ASISTIO: 'No asistió',
};

/** Icono de cada estado (tabla de estados de docs/diseno.md). */
export const ICONO_ESTADO: Readonly<Record<EstadoCita, NombreIcono>> = {
  PENDIENTE: 'clock',
  CONFIRMADA: 'check-circle',
  CHECK_IN: 'map-pin',
  EN_ESPERA: 'hourglass',
  EN_ATENCION: 'stethoscope',
  COMPLETADA: 'check-check',
  CANCELADA: 'x-circle',
  NO_ASISTIO: 'user-x',
};

/**
 * Píldora de estado de la cita: icono + TEXTO (el color solo refuerza, WCAG 1.4.1).
 * Para lectores de pantalla se anuncia «Estado: <texto>».
 *
 * Uso: `<app-estado-cita [estado]="c.estado" [etiqueta]="c.estadoEtiqueta" />` · `tamano="sm"`
 */
@Component({
  selector: 'app-estado-cita',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconoComponent],
  template: `<span
    class="estado"
    [class.estado--sm]="tamano() === 'sm'"
    [attr.data-estado]="estado()"
    ><app-icono class="estado__icono" [nombre]="icono()" [trazo]="2" /><span class="solo-lectores"
      >Estado: </span
    >{{ texto() }}</span
  >`,
  styleUrl: './estado-cita.css',
})
export class EstadoCitaComponent {
  readonly estado = input.required<EstadoCita>();
  readonly etiqueta = input<string | null | undefined>(null);
  readonly tamano = input<'sm' | 'md'>('md');

  protected readonly texto = computed(
    () => this.etiqueta()?.trim() || ETIQUETA_ESTADO[this.estado()] || this.estado(),
  );
  protected readonly icono = computed<NombreIcono>(() => ICONO_ESTADO[this.estado()] ?? 'info');
}
