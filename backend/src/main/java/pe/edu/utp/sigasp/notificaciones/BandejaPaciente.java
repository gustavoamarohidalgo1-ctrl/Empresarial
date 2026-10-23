package pe.edu.utp.sigasp.notificaciones;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Centro de notificaciones del paciente. Solo muestra las notificaciones de <b>sus</b> citas (la propiedad se
 * resuelve uniendo con {@code cita.paciente_id}) y solo las enviadas ({@code ENVIADA_SIMULADA}): nunca las
 * invalidadas ni las fallidas. Marcar como leída es idempotente; una notificación ajena responde igual que
 * una inexistente (404) y queda auditada como acceso denegado.
 */
@Service
public class BandejaPaciente {

    public static final int LIMITE_POR_DEFECTO = 30;
    public static final int LIMITE_MAXIMO = 100;

    private static final String PROPIAS = """
            FROM notificacion n JOIN cita c ON c.id = n.cita_id
            WHERE c.paciente_id = :paciente AND n.estado = 'ENVIADA_SIMULADA'
            """;

    private final JdbcClient jdbc;
    private final Auditoria auditoria;
    private final Clock reloj;

    BandejaPaciente(JdbcClient jdbc, Auditoria auditoria, Clock reloj) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    public record NotificacionPaciente(UUID id, String tipo, String titulo, String mensaje, UUID citaId,
            String citaCodigo, Instant creadaEn, boolean leida) {
    }

    public record NoLeidas(long total) {
    }

    /** Las más recientes primero; {@code limite} entre 1 y 100. */
    @Transactional(readOnly = true)
    public List<NotificacionPaciente> listar(Actor actor, int limite) {
        UUID paciente = pacienteDe(actor);
        if (limite < 1 || limite > LIMITE_MAXIMO) {
            throw new ApiException(CodigoError.VALIDACION, "El límite debe estar entre 1 y " + LIMITE_MAXIMO + ".");
        }
        return jdbc.sql("SELECT n.id, n.tipo, n.ventana, n.contenido, n.cita_id, c.codigo, n.creada_en, n.leida_en "
                        + PROPIAS + " ORDER BY n.creada_en DESC, n.id LIMIT :limite")
                .param("paciente", paciente)
                .param("limite", limite)
                .query((rs, i) -> new NotificacionPaciente(
                        rs.getObject("id", UUID.class),
                        rs.getString("tipo"),
                        Redaccion.titulo(rs.getString("tipo"), rs.getString("ventana")),
                        rs.getString("contenido"),
                        rs.getObject("cita_id", UUID.class),
                        rs.getString("codigo"),
                        rs.getTimestamp("creada_en").toInstant(),
                        rs.getTimestamp("leida_en") != null))
                .list();
    }

    @Transactional(readOnly = true)
    public NoLeidas noLeidas(Actor actor) {
        return new NoLeidas(jdbc.sql("SELECT count(*) " + PROPIAS + " AND n.leida_en IS NULL")
                .param("paciente", pacienteDe(actor))
                .query(Long.class)
                .single());
    }

    /** Marca una notificación propia como leída; repetirlo no cambia la fecha de lectura. */
    public void marcarLeida(Actor actor, UUID notificacionId) {
        UUID paciente = pacienteDe(actor);
        if (!marcar(paciente, notificacionId)) {
            boolean ajena = jdbc.sql("""
                            SELECT count(*) FROM notificacion n JOIN cita c ON c.id = n.cita_id
                            WHERE n.id = :id AND c.paciente_id <> :paciente
                            """)
                    .param("id", notificacionId)
                    .param("paciente", paciente)
                    .query(Long.class)
                    .single() > 0;
            if (ajena) {
                auditoria.registrarIndependiente(RegistroAuditoria.noExitoso("NOTIFICACION_ACCESO", "NOTIFICACION",
                        notificacionId, ResultadoAuditoria.DENEGADO, CodigoError.RECURSO_NO_ENCONTRADO.name(), null),
                        Optional.of(actor));
            }
            throw new ApiException(CodigoError.RECURSO_NO_ENCONTRADO, "No encontramos la notificación solicitada.");
        }
    }

    /** Marca como leídas todas las notificaciones propias pendientes de lectura. */
    @Transactional
    public void marcarTodas(Actor actor) {
        jdbc.sql("""
                        UPDATE notificacion SET leida_en = :ahora
                        WHERE leida_en IS NULL AND estado = 'ENVIADA_SIMULADA'
                          AND cita_id IN (SELECT id FROM cita WHERE paciente_id = :paciente)
                        """)
                .param("ahora", Timestamp.from(reloj.instant()))
                .param("paciente", pacienteDe(actor))
                .update();
    }

    /**
     * Devuelve si la notificación es del paciente (y visible); la marca si aún no estaba leída. Son dos
     * sentencias independientes: el UPDATE es atómico y la lectura posterior solo confirma la propiedad.
     */
    private boolean marcar(UUID paciente, UUID notificacionId) {
        jdbc.sql("""
                        UPDATE notificacion SET leida_en = :ahora
                        WHERE id = :id AND leida_en IS NULL AND estado = 'ENVIADA_SIMULADA'
                          AND cita_id IN (SELECT id FROM cita WHERE paciente_id = :paciente)
                        """)
                .param("ahora", Timestamp.from(reloj.instant()))
                .param("id", notificacionId)
                .param("paciente", paciente)
                .update();
        return jdbc.sql("SELECT count(*) " + PROPIAS + " AND n.id = :id")
                .param("paciente", paciente)
                .param("id", notificacionId)
                .query(Long.class)
                .single() > 0;
    }

    private static UUID pacienteDe(Actor actor) {
        if (!actor.es(Rol.PACIENTE)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
        return actor.pacienteId();
    }
}
