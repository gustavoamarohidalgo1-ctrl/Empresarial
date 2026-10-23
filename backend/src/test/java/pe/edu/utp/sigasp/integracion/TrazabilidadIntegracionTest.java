package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_OPERADOR;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R06 · Trazabilidad: el evento de la línea de tiempo y la entrada de auditoría de un mismo
 * cambio coinciden en actor, operación (clave de idempotencia), cita e instante, y la auditoría
 * guarda el requestId que recibió el cliente.
 */
@DisplayName("S2-R06 · Evento y auditoría del mismo cambio")
class TrazabilidadIntegracionTest extends PruebaApi {

    private Map<String, Object> evento(UUID cita, String tipo) {
        return jdbc.sql("SELECT actor_tipo, actor_usuario_id, operacion_id, ocurrido_en FROM cita_evento "
                + "WHERE cita_id = ? AND tipo = ?").params(cita, tipo).query().singleRow();
    }

    private Map<String, Object> auditoria(String accion, UUID cita) {
        return jdbc.sql("SELECT actor_usuario_id, actor_rol, operacion_id, ocurrido_en, entidad, request_id, "
                + "detalle ->> 'estado' AS estado FROM auditoria WHERE accion = ? AND resultado = 'EXITO' "
                + "AND entidad_id = ?").params(accion, cita.toString()).query().singleRow();
    }

    private void coinciden(MvcTestResult resultado, UUID cita, String tipoEvento, String accion, UUID clave,
            UUID actor, String rol, Instant cuando, String estado) {
        Map<String, Object> evento = evento(cita, tipoEvento);
        Map<String, Object> auditoria = auditoria(accion, cita);

        assertThat(evento.get("operacion_id")).isEqualTo(clave);
        assertThat(auditoria.get("operacion_id")).isEqualTo(clave);
        assertThat(evento.get("actor_usuario_id")).isEqualTo(actor);
        assertThat(auditoria.get("actor_usuario_id")).isEqualTo(actor);
        assertThat(evento.get("actor_tipo")).isEqualTo(rol);
        assertThat(auditoria.get("actor_rol")).isEqualTo(rol);
        assertThat(auditoria.get("entidad")).isEqualTo("CITA");
        assertThat(((Timestamp) evento.get("ocurrido_en")).toInstant()).isEqualTo(cuando);
        assertThat(((Timestamp) auditoria.get("ocurrido_en")).toInstant()).isEqualTo(cuando);
        assertThat(auditoria.get("estado")).isEqualTo(estado);
        assertThat(auditoria.get("request_id")).isNotNull()
                .isEqualTo(resultado.getResponse().getHeader("X-Request-Id"));
    }

    @Test
    @DisplayName("Confirmar: evento CONFIRMADA y auditoría CITA_CONFIRMAR comparten actor, clave, cita e instante")
    void confirmacion() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID clave = UUID.randomUUID();

        MvcTestResult resultado = confirmar(login(EMAIL_A), cita, 1, clave);

        assertThat(resultado).hasStatusOk();
        coinciden(resultado, cita, "CONFIRMADA", "CITA_CONFIRMAR", clave, USUARIO_A, "PACIENTE", AHORA, "CONFIRMADA");
    }

    @Test
    @DisplayName("Cancelar y reprogramar también dejan evento y auditoría enlazados por la misma clave")
    void cancelacionYReprogramacion() {
        UUID aCancelar = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID aReprogramar = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        UUID nuevo = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        MockHttpSession sesion = login(EMAIL_A);
        UUID claveCancelar = UUID.randomUUID();
        UUID claveReprogramar = UUID.randomUUID();

        MvcTestResult cancelacion = cancelar(sesion, aCancelar, 1, "CAN-TRASLADO", claveCancelar);
        reloj.fijar(AHORA.plus(Duration.ofMinutes(3)));
        MvcTestResult reprogramacion = reprogramar(sesion, aReprogramar, 1, nuevo, "REP-TRASLADO", claveReprogramar);

        assertThat(cancelacion).hasStatusOk();
        assertThat(reprogramacion).hasStatusOk();
        coinciden(cancelacion, aCancelar, "CANCELADA", "CITA_CANCELAR", claveCancelar, USUARIO_A, "PACIENTE",
                AHORA, "CANCELADA");
        coinciden(reprogramacion, aReprogramar, "REPROGRAMADA", "CITA_REPROGRAMAR", claveReprogramar, USUARIO_A,
                "PACIENTE", AHORA.plus(Duration.ofMinutes(3)), "PENDIENTE");
        assertThat(contar("SELECT count(*) FROM auditoria WHERE operacion_id = ?", claveCancelar)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una transición del operador queda enlazada con el operador como actor en evento y auditoría")
    void transicionOperador() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        Instant cuando = MIERCOLES_9AM.minus(Duration.ofMinutes(20));
        reloj.fijar(cuando);
        UUID clave = UUID.randomUUID();

        MvcTestResult resultado = transicion(login(EMAIL_OPERADOR), cita, "REGISTRAR_LLEGADA", versionCita(cita), clave);

        assertThat(resultado).hasStatusOk();
        coinciden(resultado, cita, "LLEGADA_REGISTRADA", "CITA_OPERADOR_REGISTRAR_LLEGADA", clave, USUARIO_OPERADOR,
                "OPERADOR", cuando, "CHECK_IN");
    }

    @Test
    @DisplayName("Un rechazo deja auditoría RECHAZO con la clave y ningún evento de línea de tiempo")
    void rechazoSinEvento() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID clave = UUID.randomUUID();

        MvcTestResult resultado = confirmar(login(EMAIL_A), cita, 7, clave);

        assertThat(resultado).hasStatus(409);
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE operacion_id = ?", clave)).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE operacion_id = ? AND resultado = 'RECHAZO' "
                + "AND codigo = 'VERSION_OBSOLETA' AND actor_usuario_id = ? AND entidad_id = ?",
                clave, USUARIO_A, cita.toString())).isEqualTo(1);
        assertThat((String) valor(resultado, "$.requestId"))
                .isEqualTo(resultado.getResponse().getHeader("X-Request-Id"));
    }
}
