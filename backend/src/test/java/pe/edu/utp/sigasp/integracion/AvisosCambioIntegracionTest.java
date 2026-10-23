package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R08 · Aviso de cambio: se genera cuando el cambio ya se confirmó en la BD (evento tras el
 * commit), una sola vez por cita, versión y tipo de cambio; repetir la operación o un rechazo no
 * generan avisos. Desde la v1.1, registrar la cita también genera su aviso («Reserva registrada»).
 */
@DisplayName("S2-R08 · Avisos de cambio")
class AvisosCambioIntegracionTest extends PruebaApi {

    private UUID cita;
    private MockHttpSession sesion;

    @BeforeEach
    void cita() {
        cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        sesion = login(EMAIL_A);
    }

    /** Avisos de cambios posteriores al registro (el de la reserva se cuenta aparte). */
    private long avisos(UUID cita) {
        esperarOyentes();
        return contar("SELECT count(*) FROM notificacion WHERE cita_id = ? AND tipo = 'CAMBIO' "
                + "AND ventana <> 'CREADA'", cita);
    }

    @Test
    @DisplayName("Registrar la cita genera el aviso de reserva; confirmar genera un solo aviso CAMBIO enviado de forma simulada")
    void confirmarGeneraUnAviso() {
        assertThat(avisos(cita)).isZero();
        assertThat(jdbc.sql("SELECT contenido FROM notificacion WHERE cita_id = ? AND ventana = 'CREADA'")
                .params(cita).query(String.class).single())
                .isEqualTo("Tu cita SP-2026-000001 de Medicina general quedó registrada para el miércoles 04/11/2026 "
                        + "a las 09:00 en Sede de prueba, con Profesional P1. Te enviaremos un recordatorio un día antes.");

        assertThat(confirmar(sesion, cita, 1)).hasStatusOk();
        esperarOyentes();

        Map<String, Object> aviso = jdbc.sql("SELECT version_agenda, ventana, estado, canal, contenido "
                + "FROM notificacion WHERE cita_id = ? AND tipo = 'CAMBIO' AND ventana = 'CONFIRMADA'")
                .params(cita).query().singleRow();
        assertThat(aviso).containsEntry("version_agenda", 1).containsEntry("ventana", "CONFIRMADA")
                .containsEntry("estado", "ENVIADA_SIMULADA").containsEntry("canal", "SIMULADO")
                .containsEntry("contenido", "Confirmaste tu asistencia a la cita SP-2026-000001 de Medicina general "
                        + "del miércoles 04/11/2026 a las 09:00 en Sede de prueba. Al llegar, registra tu llegada en "
                        + "la aplicación o en recepción.");
        assertThat(avisos(cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Repetir la confirmación con la misma clave no duplica el aviso")
    void repetirNoDuplica() {
        UUID clave = UUID.randomUUID();
        assertThat(confirmar(sesion, cita, 1, clave)).hasStatusOk();
        assertThat(confirmar(sesion, cita, 1, clave)).hasStatusOk();
        reloj.fijar(AHORA.plus(Duration.ofMinutes(1)));
        assertThat(confirmar(sesion, cita, 1, clave)).hasStatusOk();

        assertThat(avisos(cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Las operaciones rechazadas no generan avisos")
    void rechazosSinAviso() {
        esperarError(confirmar(sesion, cita, 2), HttpStatus.CONFLICT, "VERSION_OBSOLETA");
        esperarError(cancelar(sesion, cita, 1, "REP-OTRO"), HttpStatus.UNPROCESSABLE_CONTENT, "MOTIVO_INVALIDO");
        UUID ocupado = horarioDe(escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofHours(1))));
        esperarError(reprogramar(sesion, cita, 1, ocupado, "REP-OTRO"), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        assertThat(avisos(cita)).isZero();

        assertThat(confirmar(sesion, cita, 1)).hasStatusOk();
        esperarError(confirmar(sesion, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
        assertThat(avisos(cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Reprogramar y cancelar generan su propio aviso con la versión de agenda vigente")
    void reprogramarYCancelar() {
        UUID nuevo = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        assertThat(reprogramar(sesion, cita, 1, nuevo, "REP-OTRO")).hasStatusOk();
        assertThat(cancelar(sesion, cita, 2, "CAN-OTRO")).hasStatusOk();
        esperarOyentes();

        assertThat(jdbc.sql("SELECT ventana || ':' || version_agenda FROM notificacion WHERE cita_id = ? "
                + "AND tipo = 'CAMBIO' ORDER BY creada_en, ventana DESC").params(cita).query(String.class).list())
                .containsExactlyInAnyOrder("CREADA:1", "REPROGRAMADA:2", "CANCELADA:2");
        assertThat(jdbc.sql("SELECT contenido FROM notificacion WHERE cita_id = ? AND ventana = 'REPROGRAMADA'")
                .params(cita).query(String.class).single())
                .isEqualTo("Tu cita SP-2026-000001 de Medicina general se reprogramó para el jueves 05/11/2026 a las "
                        + "09:00 en Sede de prueba, con Profesional P1. Confírmala para asegurar tu atención.");
        assertThat(jdbc.sql("SELECT contenido FROM notificacion WHERE cita_id = ? AND ventana = 'CANCELADA'")
                .params(cita).query(String.class).single())
                .isEqualTo("Tu cita SP-2026-000001 de Medicina general del jueves 05/11/2026 a las 09:00 fue "
                        + "cancelada y el horario quedó libre. Si lo necesitas, puedes reservar una nueva cita.");
    }
}
