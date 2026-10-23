package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;

import pe.edu.utp.sigasp.citas.aplicacion.CierreInasistencias;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Cierre automático por inasistencia: una cita Pendiente o Confirmada sin llegada pasa a
 * No asistió desde {@code inicio + 30 min} (frontera exacta), registrada por el actor SISTEMA.
 */
@DisplayName("Cierre por inasistencia")
class CierreInasistenciasIntegracionTest extends PruebaApi {

    private static final Instant CIERRE = MIERCOLES_9AM.plus(Duration.ofMinutes(30));

    @Autowired
    private CierreInasistencias cierre;

    @Test
    @DisplayName("Antes de inicio + 30 min no cierra; en ese instante exacto sí, una sola vez")
    void fronteraExacta() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);

        reloj.fijar(CIERRE.minusMillis(1));
        assertThat(cierre.ejecutar()).isZero();
        assertThat(estado(cita)).isEqualTo("PENDIENTE");

        reloj.fijar(CIERRE);
        assertThat(cierre.ejecutar()).isEqualTo(1);
        assertThat(estado(cita)).isEqualTo("NO_ASISTIO");
        assertThat(cierre.ejecutar()).isZero();
        assertThat(eventos(cita, "NO_ASISTIO")).isEqualTo(1);
    }

    @Test
    @DisplayName("El evento NO_ASISTIO lo registra el actor SISTEMA, sin usuario ni operación, y se audita")
    void actorSistema() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(CIERRE);
        assertThat(cierre.ejecutar()).isEqualTo(1);

        Map<String, Object> evento = jdbc.sql("SELECT actor_tipo, actor_usuario_id, operacion_id, estado_anterior, "
                + "ocurrido_en, datos ->> 'cierreVentana' AS cierre FROM cita_evento WHERE cita_id = ? "
                + "AND tipo = 'NO_ASISTIO'").params(cita).query().singleRow();
        assertThat(evento).containsEntry("actor_tipo", "SISTEMA").containsEntry("actor_usuario_id", null)
                .containsEntry("operacion_id", null).containsEntry("estado_anterior", "PENDIENTE")
                .containsEntry("cierre", "2026-11-04T14:30:00Z");
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_MARCAR_NO_ASISTIO' AND resultado = 'EXITO' "
                + "AND entidad_id = ? AND actor_usuario_id IS NULL", cita.toString())).isEqualTo(1);

        MockHttpSession sesion = login(EMAIL_A);
        assertThat(get(sesion, CITAS + "/" + cita + "/linea-tiempo")).hasStatusOk().bodyJson()
                .extractingPath("$[1].titulo").isEqualTo("Inasistencia registrada");
        // Tras el cierre ya no se admite la llegada.
        esperarError(llegada(sesion, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
    }

    @Test
    @DisplayName("Una cita confirmada sin llegada también se cierra")
    void confirmadaSeCierra() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        assertThat(confirmar(login(EMAIL_A), cita, 1)).hasStatusOk();
        reloj.fijar(CIERRE.plus(Duration.ofHours(3)));

        assertThat(cierre.ejecutar()).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'NO_ASISTIO' "
                + "AND estado_anterior = 'CONFIRMADA'", cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una cita con llegada registrada no se cierra")
    void conLlegadaNoSeCierra() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(10)));
        assertThat(llegada(login(EMAIL_A), cita, 1)).hasStatusOk();

        reloj.fijar(CIERRE.plus(Duration.ofHours(2)));
        assertThat(cierre.ejecutar()).isZero();
        assertThat(estado(cita)).isEqualTo("CHECK_IN");
        assertThat(eventos(cita, "NO_ASISTIO")).isZero();
    }

    @Test
    @DisplayName("Una cita cancelada no se cierra")
    void canceladaNoSeCierra() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        assertThat(cancelar(login(EMAIL_A), cita, 1, "CAN-PERSONAL")).hasStatusOk();

        reloj.fijar(CIERRE.plus(Duration.ofDays(1)));
        assertThat(cierre.ejecutar()).isZero();
        assertThat(estado(cita)).isEqualTo("CANCELADA");
        assertThat(tiposEvento(cita)).containsExactly("CREADA", "CANCELADA");
    }

    @Test
    @DisplayName("Un ciclo cierra solo las citas vencidas y respeta la hora vigente tras reprogramar")
    void soloVencidas() {
        UUID vencida = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID futura = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM.plus(Duration.ofHours(2)));
        UUID reprogramada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.minus(Duration.ofHours(1)));
        UUID nuevoHorario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        assertThat(reprogramar(login(EMAIL_A), reprogramada, 1, nuevoHorario, "REP-OTRO")).hasStatusOk();

        reloj.fijar(CIERRE);
        assertThat(cierre.ejecutar()).isEqualTo(1);

        assertThat(estado(vencida)).isEqualTo("NO_ASISTIO");
        assertThat(estado(futura)).isEqualTo("PENDIENTE");
        assertThat(estado(reprogramada)).isEqualTo("PENDIENTE");
    }
}
