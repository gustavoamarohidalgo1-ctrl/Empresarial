package pe.edu.utp.sigasp.analitica.interno;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reconstruye la población C(P, t) del apartado 13.5 en una sola consulta SQL y la devuelve
 * agregada por día local, especialidad y estado al corte. No carga entidades ni filas por cita:
 * con miles de citas el resultado sigue siendo de, como mucho, días × especialidades × 8 filas.
 * <ol>
 *   <li>{@code poblacion}: la versión de agenda vigente <b>al corte</b>
 *       ({@code vigente_desde ≤ t} y {@code vigente_hasta} nula o {@code > t}) cuya hora prevista cae en
 *       el periodo. Cada cita aparece una vez aunque se haya reprogramado.</li>
 *   <li>{@code eventos}: en una pasada por la línea de tiempo hasta t, el estado del último evento
 *       (por secuencia), si hubo confirmación de la versión vigente al corte, cuántas reprogramaciones
 *       y el primer inicio de atención.</li>
 *   <li>{@code hechos}: une la llegada registrada hasta t y calcula el día local y si la cita ya venció
 *       ({@code inicio + tolerancia ≤ t}).</li>
 * </ol>
 * Las lecturas cruzan tablas de otros módulos (citas, catálogos), como el resto de los modelos de
 * lectura del monolito; nunca escriben en ellas.
 */
@Repository
@Transactional(readOnly = true)
public class PoblacionAlCorte {

    private static final String CONSULTA = """
            WITH poblacion AS (
                SELECT v.cita_id, v.numero, v.inicio, c.especialidad_id
                FROM cita_version_agenda v
                JOIN cita c ON c.id = v.cita_id
                WHERE v.vigente_desde <= :corte
                  AND (v.vigente_hasta IS NULL OR v.vigente_hasta > :corte)
                  AND v.inicio >= :desde AND v.inicio < :hasta
                  %s
            ),
            eventos AS (
                SELECT p.cita_id,
                       (array_agg(e.estado_nuevo ORDER BY e.secuencia DESC))[1] AS estado,
                       bool_or(e.tipo = 'CONFIRMADA' AND e.version_agenda = p.numero) AS confirmada,
                       count(*) FILTER (WHERE e.tipo = 'REPROGRAMADA') AS reprogramaciones,
                       min(e.ocurrido_en) FILTER (WHERE e.tipo = 'EN_ATENCION') AS inicio_atencion
                FROM poblacion p
                JOIN cita_evento e ON e.cita_id = p.cita_id AND e.ocurrido_en <= :corte
                GROUP BY p.cita_id
            ),
            hechos AS (
                SELECT p.especialidad_id,
                       CAST(p.inicio AT TIME ZONE CAST(:zona AS text) AS date) AS fecha,
                       p.inicio <= :limiteVencida AS vencida,
                       COALESCE(ev.estado, 'PENDIENTE') AS estado,
                       COALESCE(ev.confirmada, FALSE) AS confirmada,
                       COALESCE(ev.reprogramaciones, 0) AS reprogramaciones,
                       ev.inicio_atencion,
                       r.registrado_en AS llegada,
                       (r.registrado_en IS NOT NULL AND ev.inicio_atencion IS NOT NULL
                            AND ev.inicio_atencion >= r.registrado_en) AS espera_valida
                FROM poblacion p
                LEFT JOIN eventos ev ON ev.cita_id = p.cita_id
                LEFT JOIN registro_llegada r ON r.cita_id = p.cita_id AND r.registrado_en <= :corte
            )
            SELECT h.fecha, es.codigo AS especialidad_codigo, es.nombre AS especialidad_nombre, h.estado,
                   count(*) AS total,
                   count(*) FILTER (WHERE h.confirmada) AS confirmadas,
                   count(*) FILTER (WHERE h.reprogramaciones > 0) AS reprogramadas,
                   COALESCE(sum(h.reprogramaciones), 0) AS eventos_reprogramacion,
                   count(*) FILTER (WHERE h.vencida AND h.estado <> 'CANCELADA') AS vencidas,
                   count(*) FILTER (WHERE h.espera_valida) AS esperas_validas,
                   COALESCE(sum(EXTRACT(EPOCH FROM (h.inicio_atencion - h.llegada)))
                            FILTER (WHERE h.espera_valida), 0) AS segundos_espera,
                   count(*) FILTER (WHERE NOT h.espera_valida
                                      AND h.estado IN ('EN_ATENCION', 'COMPLETADA')) AS esperas_excluidas
            FROM hechos h
            JOIN especialidad es ON es.id = h.especialidad_id
            GROUP BY h.fecha, es.codigo, es.nombre, h.estado
            """;

    private static final String FILTRO_SEDE = "AND v.sede_id IN (SELECT id FROM sede WHERE codigo = :sede)";
    private static final String FILTRO_PROFESIONAL =
            "AND v.profesional_id IN (SELECT id FROM profesional WHERE codigo = :profesional)";
    private static final String FILTRO_ESPECIALIDAD =
            "AND c.especialidad_id IN (SELECT id FROM especialidad WHERE codigo = :especialidad)";

    private final JdbcClient jdbc;

    PoblacionAlCorte(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Parámetros ya validados de la consulta.
     *
     * @param desde         inicio del primer día local (incluido)
     * @param hasta         inicio del día siguiente al último (excluido)
     * @param corte         instante t
     * @param limiteVencida {@code t − tolerancia}: una cita con {@code inicio ≤ limiteVencida} ya venció
     */
    public record Parametros(Instant desde, Instant hasta, Instant corte, Instant limiteVencida, ZoneId zona,
            String sede, String especialidad, String profesional) {
    }

    /** Conteos de un grupo (día local, especialidad, estado al corte). */
    public record Celda(LocalDate fecha, String especialidadCodigo, String especialidadNombre,
            EstadoAlCorte estado, long total, long confirmadas, long reprogramadas, long eventosReprogramacion,
            long vencidas, long esperasValidas, BigDecimal segundosEspera, long esperasExcluidas) {
    }

    public List<Celda> celdas(Parametros p) {
        // Solo se concatenan fragmentos fijos; los valores viajan siempre como parámetros.
        StringBuilder filtros = new StringBuilder();
        if (p.sede() != null) {
            filtros.append(FILTRO_SEDE).append('\n');
        }
        if (p.profesional() != null) {
            filtros.append(FILTRO_PROFESIONAL).append('\n');
        }
        if (p.especialidad() != null) {
            filtros.append(FILTRO_ESPECIALIDAD).append('\n');
        }
        JdbcClient.StatementSpec sentencia = jdbc.sql(CONSULTA.formatted(filtros))
                .param("corte", utc(p.corte()))
                .param("desde", utc(p.desde()))
                .param("hasta", utc(p.hasta()))
                .param("limiteVencida", utc(p.limiteVencida()))
                .param("zona", p.zona().getId());
        if (p.sede() != null) {
            sentencia = sentencia.param("sede", p.sede());
        }
        if (p.profesional() != null) {
            sentencia = sentencia.param("profesional", p.profesional());
        }
        if (p.especialidad() != null) {
            sentencia = sentencia.param("especialidad", p.especialidad());
        }
        return sentencia.query(PoblacionAlCorte::celda).list();
    }

    private static OffsetDateTime utc(Instant instante) {
        return instante.atOffset(ZoneOffset.UTC);
    }

    private static Celda celda(ResultSet rs, int fila) throws SQLException {
        return new Celda(
                rs.getObject("fecha", LocalDate.class),
                rs.getString("especialidad_codigo"),
                rs.getString("especialidad_nombre"),
                EstadoAlCorte.valueOf(rs.getString("estado")),
                rs.getLong("total"),
                rs.getLong("confirmadas"),
                rs.getLong("reprogramadas"),
                rs.getLong("eventos_reprogramacion"),
                rs.getLong("vencidas"),
                rs.getLong("esperas_validas"),
                rs.getBigDecimal("segundos_espera"),
                rs.getLong("esperas_excluidas"));
    }
}
