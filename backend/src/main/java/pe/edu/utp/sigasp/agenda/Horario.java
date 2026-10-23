package pe.edu.utp.sigasp.agenda;

import java.time.Instant;
import java.util.UUID;

/** Franja de agenda de un profesional en una sede. */
public record Horario(UUID id, UUID profesionalId, UUID sedeId, Instant inicio, Instant fin) {
}
