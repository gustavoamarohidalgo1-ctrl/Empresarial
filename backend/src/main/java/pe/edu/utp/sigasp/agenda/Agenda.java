package pe.edu.utp.sigasp.agenda;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Puerto hacia la agenda (fuente de disponibilidad). Las operaciones de escritura deben
 * ejecutarse dentro de la transacción del caso de uso: si la transacción se revierte, la
 * ocupación vuelve a su estado original.
 */
public interface Agenda {

    /** Horarios libres y posteriores a {@code ahora} del profesional, en el rango [desde, hasta). */
    List<Horario> libres(UUID profesionalId, Instant desde, Instant hasta, Instant ahora);

    /**
     * Horarios libres y posteriores a {@code ahora} de cualquiera de los profesionales, en [desde, hasta),
     * ordenados por inicio (reserva de una cita nueva por especialidad).
     */
    List<Horario> libres(Collection<UUID> profesionalIds, Instant desde, Instant hasta, Instant ahora);

    /** Un horario por su identificador, esté libre u ocupado. Consultar no reserva. */
    Optional<Horario> buscar(UUID horarioId);

    /**
     * Ocupa el horario para la cita si sigue libre y es futuro. Es atómico: si otra transacción
     * lo ocupó antes, devuelve vacío. Consultar disponibilidad no reserva.
     */
    Optional<Horario> ocupar(UUID horarioId, UUID citaId, Instant ahora);

    /** Libera el horario que ocupa la cita (no hace nada si no ocupa ninguno). */
    void liberar(UUID citaId);
}
