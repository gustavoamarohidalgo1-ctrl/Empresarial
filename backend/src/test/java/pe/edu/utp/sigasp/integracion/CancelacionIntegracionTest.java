package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R02 · Cancelación: exige un motivo válido del catálogo de cancelación, libera el horario y
 * deja la cita en un estado terminal que rechaza las demás acciones.
 */
@DisplayName("S2-R02 · Cancelación")
class CancelacionIntegracionTest extends PruebaApi {

    private UUID cita;
    private UUID horario;
    private MockHttpSession sesion;

    @BeforeEach
    void cita() {
        cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        horario = horarioDe(cita);
        sesion = login(EMAIL_A);
    }

    private void citaIntacta() {
        esperarOyentes();
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(ocupanteDe(horario)).isEqualTo(cita);
        assertThat(eventos(cita, "CANCELADA")).isZero();
        assertThat(jdbc.sql("SELECT motivo_cancelacion FROM cita WHERE id = ?").params(cita).query(String.class)
                .optional()).isEmpty();
        // Solo el aviso de la reserva: ningún aviso de cancelación.
        assertThat(contar("SELECT count(*) FROM notificacion WHERE cita_id = ? AND ventana <> 'CREADA'", cita))
                .isZero();
    }

    @Test
    @DisplayName("Sin motivo responde 400 VALIDACION con el campo motivoCodigo y la cita queda intacta")
    void sinMotivo() {
        MvcTestResult resultado = post(sesion, CITAS + "/" + cita + "/cancelacion", "{\"versionAgenda\":1}");

        esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(resultado, "$.errores[*].campo")).containsExactly("motivoCodigo");
        citaIntacta();
    }

    @Test
    @DisplayName("Con un motivo de reprogramación o inexistente responde 422 MOTIVO_INVALIDO y la cita queda intacta")
    void motivoInvalido() {
        esperarError(cancelar(sesion, cita, 1, "REP-DISPONIBILIDAD"), HttpStatus.UNPROCESSABLE_CONTENT,
                "MOTIVO_INVALIDO");
        esperarError(cancelar(sesion, cita, 1, "NO-EXISTE"), HttpStatus.UNPROCESSABLE_CONTENT, "MOTIVO_INVALIDO");

        citaIntacta();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_CANCELAR' AND resultado = 'RECHAZO' "
                + "AND codigo = 'MOTIVO_INVALIDO'")).isEqualTo(2);
    }

    @Test
    @DisplayName("Un motivo inactivo del catálogo también se rechaza con 422 MOTIVO_INVALIDO")
    void motivoInactivo() {
        jdbc.sql("UPDATE motivo SET activo = FALSE WHERE codigo = 'CAN-OTRO'").update();
        try {
            esperarError(cancelar(sesion, cita, 1, "CAN-OTRO"), HttpStatus.UNPROCESSABLE_CONTENT, "MOTIVO_INVALIDO");
            citaIntacta();
        } finally {
            jdbc.sql("UPDATE motivo SET activo = TRUE WHERE codigo = 'CAN-OTRO'").update();
        }
    }

    @Test
    @DisplayName("Con un motivo válido queda Cancelada, libera el horario y registra evento, auditoría y aviso")
    void cancelacionValida() {
        MvcTestResult resultado = cancelar(sesion, cita, 1, "CAN-PERSONAL");

        assertThat(resultado).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"id":"%s","estado":"CANCELADA","accionesPermitidas":[],
                 "motivoCancelacion":{"codigo":"CAN-PERSONAL","descripcion":"Compromiso personal"}}
                """.formatted(cita));
        assertThat(estado(cita)).isEqualTo("CANCELADA");
        assertThat(ocupanteDe(horario)).isNull();
        assertThat(horarioDe(cita)).isNull();
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'CANCELADA' "
                + "AND motivo_codigo = 'CAN-PERSONAL' AND estado_anterior = 'PENDIENTE'", cita)).isEqualTo(1);
        assertThat(auditorias("CITA_CANCELAR", "EXITO", cita)).isEqualTo(1);
        // La versión de agenda se conserva como historia (sigue registrada con su horario).
        assertThat(versionAgenda(cita)).isEqualTo(1);
        assertThat(horarioVigente(cita)).isEqualTo(horario);
    }

    @Test
    @DisplayName("Una cita confirmada también se cancela y su horario queda disponible para otra cita")
    void cancelarConfirmadaLiberaParaOtros() {
        UUID otra = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        assertThat(confirmar(sesion, cita, 1)).hasStatusOk();
        assertThat(cancelar(sesion, cita, 1, "CAN-LABORAL")).hasStatusOk();

        List<String> libres = valor(get(sesion, CITAS + "/" + otra
                + "/horarios-disponibles?desde=2026-11-04&hasta=2026-11-04"), "$[*].id");
        assertThat(libres).contains(horario.toString());
        assertThat(reprogramar(sesion, otra, 1, horario, "REP-LABORAL")).hasStatusOk();
        assertThat(ocupanteDe(horario)).isEqualTo(otra);
        assertThat(estado(cita)).isEqualTo("CANCELADA");
    }

    @Test
    @DisplayName("Tras cancelar se rechazan confirmar, reprogramar, pre-check-in y llegada sin cambiar nada")
    void canceladaRechazaAcciones() {
        UUID libre = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(2)));
        assertThat(cancelar(sesion, cita, 1, "CAN-PERSONAL")).hasStatusOk();

        esperarError(confirmar(sesion, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
        esperarError(reprogramar(sesion, cita, 1, libre, "REP-OTRO"), HttpStatus.UNPROCESSABLE_CONTENT,
                "TRANSICION_NO_PERMITIDA");
        esperarError(cancelar(sesion, cita, 1, "CAN-OTRO"), HttpStatus.UNPROCESSABLE_CONTENT,
                "TRANSICION_NO_PERMITIDA");
        esperarError(preCheckIn(sesion, cita, 1, true), HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(10)));
        esperarError(llegada(sesion, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");

        assertThat(estado(cita)).isEqualTo("CANCELADA");
        assertThat(tiposEvento(cita)).containsExactly("CREADA", "CANCELADA");
        assertThat(ocupanteDe(libre)).isNull();
        assertThat(ocupanteDe(horario)).isNull();
        assertThat(versionAgenda(cita)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
        assertThat(contar("SELECT count(*) FROM pre_check_in")).isZero();
        assertThat(jdbc.sql("SELECT motivo_cancelacion FROM cita WHERE id = ?").params(cita).query(String.class)
                .single()).isEqualTo("CAN-PERSONAL");
    }

    @Test
    @DisplayName("Cancelar a la hora prevista o después responde 422 FUERA_DE_PLAZO")
    void cancelarFueraDePlazo() {
        reloj.fijar(MIERCOLES_9AM.plusSeconds(1));
        esperarError(cancelar(sesion, cita, 1, "CAN-PERSONAL"), HttpStatus.UNPROCESSABLE_CONTENT, "FUERA_DE_PLAZO");
        citaIntacta();
    }
}
