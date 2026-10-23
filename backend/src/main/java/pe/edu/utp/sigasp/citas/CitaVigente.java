package pe.edu.utp.sigasp.citas;

import java.time.Instant;
import java.util.UUID;

/** Vista mínima de una cita con su versión de agenda vigente, para otros módulos. */
public record CitaVigente(UUID citaId, String codigo, UUID pacienteId, String estado, int versionAgenda,
        Instant inicio, Instant fin, String especialidad, String profesional, String sede) {
}
