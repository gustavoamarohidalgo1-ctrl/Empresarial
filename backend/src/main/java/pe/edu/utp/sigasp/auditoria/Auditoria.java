package pe.edu.utp.sigasp.auditoria;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.Optional;

import org.slf4j.MDC;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import pe.edu.utp.sigasp.compartido.web.RequestIdFilter;
import tools.jackson.databind.ObjectMapper;

/**
 * Registra entradas en la bitácora de solo inserción.
 * <ul>
 *   <li>{@link #registrar} participa de la transacción en curso: la auditoría acompaña al cambio y
 *       desaparece con él si la transacción se revierte.</li>
 *   <li>{@link #registrarIndependiente} usa una transacción propia: sirve para rechazos y accesos
 *       denegados, que deben quedar registrados aunque la operación principal se revierta.</li>
 * </ul>
 */
@Service
public class Auditoria {

    private static final String INSERT = """
            INSERT INTO auditoria (ocurrido_en, actor_usuario_id, actor_rol, accion, entidad, entidad_id,
                                   resultado, codigo, operacion_id, request_id, detalle)
            VALUES (:ocurridoEn, :actorId, :actorRol, :accion, :entidad, :entidadId,
                    :resultado, :codigo, :operacionId, :requestId, CAST(:detalle AS jsonb))
            """;

    private final JdbcClient jdbc;
    private final Clock reloj;
    private final ActorActual actorActual;
    private final ObjectMapper json;
    private final TransactionTemplate transaccionPropia;

    Auditoria(JdbcClient jdbc, Clock reloj, ActorActual actorActual, ObjectMapper json,
            PlatformTransactionManager transacciones) {
        this.jdbc = jdbc;
        this.reloj = reloj;
        this.actorActual = actorActual;
        this.json = json;
        this.transaccionPropia = new TransactionTemplate(transacciones);
        this.transaccionPropia.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Registra dentro de la transacción en curso, con el actor de la sesión. */
    public void registrar(RegistroAuditoria registro) {
        insertar(registro, actorActual.opcional());
    }

    /** Registra con un actor explícito (por ejemplo, durante el login o en procesos del sistema). */
    public void registrar(RegistroAuditoria registro, Optional<Actor> actor) {
        insertar(registro, actor);
    }

    /** Registra en una transacción independiente que se confirma aunque la actual se revierta. */
    public void registrarIndependiente(RegistroAuditoria registro) {
        Optional<Actor> actor = actorActual.opcional();
        transaccionPropia.executeWithoutResult(estado -> insertar(registro, actor));
    }

    public void registrarIndependiente(RegistroAuditoria registro, Optional<Actor> actor) {
        transaccionPropia.executeWithoutResult(estado -> insertar(registro, actor));
    }

    private void insertar(RegistroAuditoria registro, Optional<Actor> actor) {
        jdbc.sql(INSERT)
                .param("ocurridoEn", Timestamp.from(registro.ocurridoEn() != null ? registro.ocurridoEn() : reloj.instant()))
                .param("actorId", actor.map(Actor::usuarioId).orElse(null))
                .param("actorRol", actor.map(a -> a.rol().name()).orElse(null))
                .param("accion", registro.accion())
                .param("entidad", registro.entidad())
                .param("entidadId", registro.entidadId())
                .param("resultado", registro.resultado().name())
                .param("codigo", registro.codigo())
                .param("operacionId", registro.operacionId())
                .param("requestId", MDC.get(RequestIdFilter.MDC_CLAVE))
                .param("detalle", json.writeValueAsString(registro.detalle()))
                .update();
    }
}
