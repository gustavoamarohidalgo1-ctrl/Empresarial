package pe.edu.utp.sigasp.agenda.interno;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.agenda.Agenda;
import pe.edu.utp.sigasp.agenda.Horario;

/**
 * Agenda local sobre la tabla {@code horario}. La reserva es un UPDATE condicional: con
 * READ COMMITTED, si dos transacciones compiten por el mismo horario la segunda vuelve a
 * evaluar {@code cita_id IS NULL} tras el bloqueo y no lo ocupa.
 */
@Component
class AgendaLocal implements Agenda {

    private static final int MAX_FRANJAS = 2_000;
    /** Varios profesionales de una especialidad en 31 días: holgura de sobra para la reserva. */
    private static final int MAX_FRANJAS_ESPECIALIDAD = 6_000;

    private final JdbcClient jdbc;

    AgendaLocal(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    @Transactional(readOnly = true)
    public List<Horario> libres(UUID profesionalId, Instant desde, Instant hasta, Instant ahora) {
        // Rango [desde, hasta) y siempre futuro. El límite cubre con holgura los 31 días que admite la API
        // (unas 27 franjas por día y profesional); no recorta en silencio un rango válido.
        return jdbc.sql("""
                        SELECT id, profesional_id, sede_id, inicio, fin FROM horario
                        WHERE profesional_id = :profesional AND cita_id IS NULL
                          AND inicio >= :desde AND inicio > :ahora AND inicio < :hasta
                        ORDER BY inicio
                        LIMIT :maximo
                        """)
                .param("profesional", profesionalId)
                .param("desde", Timestamp.from(desde))
                .param("ahora", Timestamp.from(ahora))
                .param("hasta", Timestamp.from(hasta))
                .param("maximo", MAX_FRANJAS)
                .query(AgendaLocal::mapear)
                .list();
    }

    @Override
    @Transactional(readOnly = true)
    public List<Horario> libres(Collection<UUID> profesionalIds, Instant desde, Instant hasta, Instant ahora) {
        if (profesionalIds.isEmpty()) {
            return List.of();
        }
        return jdbc.sql("""
                        SELECT id, profesional_id, sede_id, inicio, fin FROM horario
                        WHERE profesional_id IN (:profesionales) AND cita_id IS NULL
                          AND inicio >= :desde AND inicio > :ahora AND inicio < :hasta
                        ORDER BY inicio, profesional_id
                        LIMIT :maximo
                        """)
                .param("profesionales", List.copyOf(profesionalIds))
                .param("desde", Timestamp.from(desde))
                .param("ahora", Timestamp.from(ahora))
                .param("hasta", Timestamp.from(hasta))
                .param("maximo", MAX_FRANJAS_ESPECIALIDAD)
                .query(AgendaLocal::mapear)
                .list();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<Horario> buscar(UUID horarioId) {
        return jdbc.sql("SELECT id, profesional_id, sede_id, inicio, fin FROM horario WHERE id = :horario")
                .param("horario", horarioId)
                .query(AgendaLocal::mapear)
                .optional();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public Optional<Horario> ocupar(UUID horarioId, UUID citaId, Instant ahora) {
        int filas = jdbc.sql("""
                        UPDATE horario SET cita_id = :cita
                        WHERE id = :horario AND cita_id IS NULL AND inicio > :ahora
                        """)
                .param("cita", citaId)
                .param("horario", horarioId)
                .param("ahora", Timestamp.from(ahora))
                .update();
        if (filas == 0) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT id, profesional_id, sede_id, inicio, fin FROM horario WHERE id = :horario")
                .param("horario", horarioId)
                .query(AgendaLocal::mapear)
                .optional();
    }

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void liberar(UUID citaId) {
        jdbc.sql("UPDATE horario SET cita_id = NULL WHERE cita_id = :cita")
                .param("cita", citaId)
                .update();
    }

    private static Horario mapear(ResultSet rs, int fila) throws SQLException {
        return new Horario(
                rs.getObject("id", UUID.class),
                rs.getObject("profesional_id", UUID.class),
                rs.getObject("sede_id", UUID.class),
                rs.getTimestamp("inicio").toInstant(),
                rs.getTimestamp("fin").toInstant());
    }
}
