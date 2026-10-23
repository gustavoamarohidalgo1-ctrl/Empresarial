package pe.edu.utp.sigasp.citas.persistencia;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.citas.CitaVigente;
import pe.edu.utp.sigasp.citas.ConsultaCitasVigentes;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.Referencia;
import pe.edu.utp.sigasp.citas.dominio.EstadoCita;

/**
 * Modelo de lectura en SQL. Une la cita con su versión de agenda vigente y los catálogos; en un
 * monolito modular las lecturas pueden cruzar tablas de otros módulos, pero las escrituras no.
 */
@Repository
@Transactional(readOnly = true)
public class ConsultasCitas implements ConsultaCitasVigentes {

    private static final String BASE = """
            SELECT c.id, c.codigo, c.paciente_id, c.estado, c.version_agenda_vigente, c.version,
                   v.inicio, v.fin, v.profesional_id,
                   s.codigo AS sede_codigo, s.nombre AS sede_nombre,
                   e.codigo AS esp_codigo, e.nombre AS esp_nombre,
                   p.codigo AS prof_codigo, p.nombre_visible AS prof_nombre,
                   pa.nombres || ' ' || pa.apellidos AS paciente_nombre
            FROM cita c
            JOIN cita_version_agenda v ON v.cita_id = c.id AND v.vigente_hasta IS NULL
            JOIN sede s ON s.id = v.sede_id
            JOIN especialidad e ON e.id = c.especialidad_id
            JOIN profesional p ON p.id = v.profesional_id
            JOIN paciente pa ON pa.id = c.paciente_id
            """;

    private final JdbcClient jdbc;

    ConsultasCitas(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<FilaCita> dePaciente(UUID pacienteId, Collection<EstadoCita> estados, boolean ascendente) {
        return jdbc.sql(BASE + " WHERE c.paciente_id = :paciente AND c.estado IN (:estados) ORDER BY v.inicio "
                        + (ascendente ? "ASC" : "DESC") + ", c.codigo")
                .param("paciente", pacienteId)
                .param("estados", estados.stream().map(Enum::name).toList())
                .query(ConsultasCitas::fila)
                .list();
    }

    public Optional<FilaCita> fila(UUID citaId) {
        return jdbc.sql(BASE + " WHERE c.id = :cita")
                .param("cita", citaId)
                .query(ConsultasCitas::fila)
                .optional();
    }

    /** Citas del rango para los profesionales asignados al operador. */
    public List<FilaCita> deOperador(UUID operadorId, Instant desde, Instant hasta) {
        return jdbc.sql(BASE + """
                         WHERE v.inicio >= :desde AND v.inicio < :hasta
                           AND v.profesional_id IN (SELECT profesional_id FROM operador_profesional
                                                    WHERE usuario_id = :operador)
                         ORDER BY v.inicio, c.codigo
                        """)
                .param("operador", operadorId)
                .param("desde", Timestamp.from(desde))
                .param("hasta", Timestamp.from(hasta))
                .query(ConsultasCitas::fila)
                .list();
    }

    public boolean operadorAsignado(UUID operadorId, UUID profesionalId) {
        return jdbc.sql("""
                        SELECT count(*) FROM operador_profesional
                        WHERE usuario_id = :operador AND profesional_id = :profesional
                        """)
                .param("operador", operadorId)
                .param("profesional", profesionalId)
                .query(Long.class)
                .single() > 0;
    }

    public Referencia sede(UUID sedeId) {
        return jdbc.sql("SELECT codigo, nombre FROM sede WHERE id = :id")
                .param("id", sedeId)
                .query((rs, i) -> new Referencia(rs.getString("codigo"), rs.getString("nombre")))
                .single();
    }

    public Referencia profesional(UUID profesionalId) {
        return jdbc.sql("SELECT codigo, nombre_visible FROM profesional WHERE id = :id")
                .param("id", profesionalId)
                .query((rs, i) -> new Referencia(rs.getString("codigo"), rs.getString("nombre_visible")))
                .single();
    }

    @Override
    public List<CitaVigente> previasALlegadaConInicioEntre(Instant desde, Instant hasta) {
        return jdbc.sql(BASE + """
                         WHERE c.estado IN ('PENDIENTE', 'CONFIRMADA')
                           AND v.inicio >= :desde AND v.inicio < :hasta
                         ORDER BY v.inicio
                        """)
                .param("desde", Timestamp.from(desde))
                .param("hasta", Timestamp.from(hasta))
                .query(ConsultasCitas::fila)
                .list()
                .stream()
                .map(FilaCita::comoVigente)
                .toList();
    }

    @Override
    public Optional<CitaVigente> buscar(UUID citaId) {
        return fila(citaId).map(FilaCita::comoVigente);
    }

    /** IDs de citas sin llegada cuya ventana ya venció (candidatas a No asistió). */
    public List<UUID> vencidasSinLlegada(Instant limiteInicio, int maximo) {
        return jdbc.sql("""
                        SELECT c.id FROM cita c
                        JOIN cita_version_agenda v ON v.cita_id = c.id AND v.vigente_hasta IS NULL
                        WHERE c.estado IN ('PENDIENTE', 'CONFIRMADA') AND v.inicio <= :limite
                        ORDER BY v.inicio
                        LIMIT :maximo
                        """)
                .param("limite", Timestamp.from(limiteInicio))
                .param("maximo", maximo)
                .query(UUID.class)
                .list();
    }

    private static FilaCita fila(ResultSet rs, int i) throws SQLException {
        return new FilaCita(
                rs.getObject("id", UUID.class),
                rs.getString("codigo"),
                rs.getObject("paciente_id", UUID.class),
                EstadoCita.valueOf(rs.getString("estado")),
                rs.getInt("version_agenda_vigente"),
                rs.getLong("version"),
                rs.getTimestamp("inicio").toInstant(),
                rs.getTimestamp("fin").toInstant(),
                rs.getObject("profesional_id", UUID.class),
                new Referencia(rs.getString("sede_codigo"), rs.getString("sede_nombre")),
                new Referencia(rs.getString("esp_codigo"), rs.getString("esp_nombre")),
                new Referencia(rs.getString("prof_codigo"), rs.getString("prof_nombre")),
                rs.getString("paciente_nombre"));
    }

    /** Fila del modelo de lectura. */
    public record FilaCita(UUID id, String codigo, UUID pacienteId, EstadoCita estado, int versionAgenda,
            long versionCita, Instant inicio, Instant fin, UUID profesionalId, Referencia sede,
            Referencia especialidad, Referencia profesional, String pacienteNombre) {

        CitaVigente comoVigente() {
            return new CitaVigente(id, codigo, pacienteId, estado.name(), versionAgenda, inicio, fin,
                    especialidad.nombre(), profesional.nombre(), sede.nombre());
        }
    }
}
