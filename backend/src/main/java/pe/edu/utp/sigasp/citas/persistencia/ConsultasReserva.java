package pe.edu.utp.sigasp.citas.persistencia;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Apoyo en SQL para dar de alta citas: el número correlativo del código y las reglas de límite de la
 * reserva. Todo se ejecuta dentro de la transacción del caso de uso. Las reglas miran solo la versión de
 * agenda <b>vigente</b> de cada cita y solo las citas no terminales.
 */
@Repository
@Transactional(propagation = Propagation.MANDATORY)
public class ConsultasReserva {

    /** Espacio de los candados consultivos de dos claves usados por las citas ("CITA" en ASCII). */
    private static final int ESPACIO_CANDADO_PACIENTE = 0x43495441;
    private static final String NO_TERMINALES = "('PENDIENTE', 'CONFIRMADA', 'CHECK_IN', 'EN_ESPERA', 'EN_ATENCION')";

    /** Citas no terminales del paciente con su versión vigente y el nombre de la especialidad. */
    private static final String ACTIVAS_DEL_PACIENTE = """
            SELECT e.nombre AS especialidad, v.inicio
            FROM cita c
            JOIN cita_version_agenda v ON v.cita_id = c.id AND v.vigente_hasta IS NULL
            JOIN especialidad e ON e.id = c.especialidad_id
            WHERE c.paciente_id = :paciente AND c.estado IN """ + NO_TERMINALES;

    private final JdbcClient jdbc;

    ConsultasReserva(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Cita activa que impide una reserva: su especialidad y su hora prevista (versión vigente). */
    public record CitaEnConflicto(String especialidad, Instant inicio) {
    }

    /** Siguiente valor de {@code cita_codigo_seq}. Puede dejar huecos si la transacción se revierte. */
    public long siguienteNumeroCodigo() {
        return jdbc.sql("SELECT nextval('cita_codigo_seq')").query(Long.class).single();
    }

    /**
     * Serializa las reservas de un mismo paciente hasta el fin de la transacción: dos reservas simultáneas
     * no pueden superar juntas los límites (la segunda los evalúa con la primera ya confirmada).
     */
    public void bloquearPaciente(UUID pacienteId) {
        jdbc.sql("SELECT pg_advisory_xact_lock(:espacio, :clave)")
                .param("espacio", ESPACIO_CANDADO_PACIENTE)
                .param("clave", pacienteId.hashCode())
                .query((rs, i) -> Boolean.TRUE)
                .list();
    }

    /** Citas del paciente en un estado no terminal (pendientes, confirmadas o en curso). */
    public long activas(UUID pacienteId) {
        return jdbc.sql("SELECT count(*) FROM cita WHERE paciente_id = :paciente AND estado IN " + NO_TERMINALES)
                .param("paciente", pacienteId)
                .query(Long.class)
                .single();
    }

    /**
     * Primera cita no terminal del paciente cuyo intervalo vigente {@code [inicio, fin)} se cruza con
     * {@code [inicio, fin)} del horario pedido. Los intervalos son semiabiertos: una cita que termina justo
     * cuando empieza la otra no se cruza.
     */
    public Optional<CitaEnConflicto> activaQueSeCruza(UUID pacienteId, Instant inicio, Instant fin) {
        return jdbc.sql(ACTIVAS_DEL_PACIENTE + " AND v.inicio < :fin AND v.fin > :inicio ORDER BY v.inicio LIMIT 1")
                .param("paciente", pacienteId)
                .param("inicio", Timestamp.from(inicio))
                .param("fin", Timestamp.from(fin))
                .query((rs, i) -> new CitaEnConflicto(rs.getString("especialidad"),
                        rs.getTimestamp("inicio").toInstant()))
                .optional();
    }

    /** Primera cita no terminal del paciente de la especialidad con hora prevista vigente en [desde, hasta). */
    public Optional<CitaEnConflicto> activaDeEspecialidadEntre(UUID pacienteId, UUID especialidadId, Instant desde,
            Instant hasta) {
        return jdbc.sql(ACTIVAS_DEL_PACIENTE + """
                         AND c.especialidad_id = :especialidadId AND v.inicio >= :desde AND v.inicio < :hasta
                        ORDER BY v.inicio LIMIT 1""")
                .param("paciente", pacienteId)
                .param("especialidadId", especialidadId)
                .param("desde", Timestamp.from(desde))
                .param("hasta", Timestamp.from(hasta))
                .query((rs, i) -> new CitaEnConflicto(rs.getString("especialidad"),
                        rs.getTimestamp("inicio").toInstant()))
                .optional();
    }
}
