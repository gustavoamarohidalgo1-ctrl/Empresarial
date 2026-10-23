package pe.edu.utp.sigasp.citas;

import java.time.Instant;
import java.util.UUID;

/**
 * Evento de integración: una cita cambió. Lo consumen notificaciones (recordatorios y avisos)
 * y, más adelante, analítica. Se publica dentro de la transacción y los oyentes asíncronos lo
 * reciben solo si la transacción se confirma (registro de publicación de Spring Modulith).
 *
 * @param tipoEvento    tipo del evento de la línea de tiempo (CONFIRMADA, CANCELADA, REPROGRAMADA…)
 * @param versionAgenda versión de agenda vigente tras el cambio
 * @param estado        estado de la cita tras el cambio
 */
public record CitaActualizada(UUID citaId, String codigo, UUID pacienteId, String tipoEvento, int versionAgenda,
        String estado, Instant inicio, Instant ocurridoEn) {
}
