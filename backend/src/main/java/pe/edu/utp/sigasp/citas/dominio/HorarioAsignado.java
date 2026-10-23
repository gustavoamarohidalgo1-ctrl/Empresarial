package pe.edu.utp.sigasp.citas.dominio;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/** Horario que la agenda asignó a una versión de la cita. */
public record HorarioAsignado(UUID horarioId, UUID profesionalId, UUID sedeId, Instant inicio, Instant fin) {

    public HorarioAsignado {
        Objects.requireNonNull(profesionalId, "profesionalId");
        Objects.requireNonNull(sedeId, "sedeId");
        Objects.requireNonNull(inicio, "inicio");
        Objects.requireNonNull(fin, "fin");
        if (!fin.isAfter(inicio)) {
            throw new IllegalArgumentException("El fin debe ser posterior al inicio");
        }
    }
}
