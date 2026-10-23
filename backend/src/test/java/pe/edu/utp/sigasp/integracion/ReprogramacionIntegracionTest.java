package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P2;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R03 · Reprogramación a un horario libre: conserva el ID, crea una nueva versión de agenda
 * (una sola vigente), anula la confirmación anterior y mueve la ocupación de la agenda.
 */
@DisplayName("S2-R03 · Reprogramación a un horario libre")
class ReprogramacionIntegracionTest extends PruebaApi {

    private static final Instant JUEVES_10AM = Instant.parse("2026-11-05T15:00:00Z");

    private UUID cita;
    private UUID horarioViejo;
    private UUID horarioNuevo;
    private MockHttpSession sesion;

    @BeforeEach
    void cita() {
        cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        horarioViejo = horarioDe(cita);
        horarioNuevo = escenario.horario(P1, JUEVES_10AM);
        sesion = login(EMAIL_A);
    }

    @Test
    @DisplayName("Conserva el ID, sube versionAgenda a 2, vuelve a Pendiente y anula la confirmación previa")
    void reprogramarConfirmada() {
        assertThat(confirmar(sesion, cita, 1)).hasStatusOk();
        reloj.fijar(AHORA.plus(Duration.ofMinutes(10)));

        MvcTestResult resultado = reprogramar(sesion, cita, 1, horarioNuevo, "REP-DISPONIBILIDAD");

        assertThat(resultado).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"id":"%s","codigo":"SP-2026-000001","estado":"PENDIENTE","versionAgenda":2,
                 "inicio":"2026-11-05T15:00:00Z","fin":"2026-11-05T15:20:00Z","confirmadaEn":null,
                 "ventanaLlegada":{"desde":"2026-11-05T14:00:00Z","hasta":"2026-11-05T15:30:00Z"},
                 "accionesPermitidas":["CONFIRMAR","CANCELAR","REPROGRAMAR","PRE_CHECK_IN"]}
                """.formatted(cita));

        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(versionAgenda(cita)).isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM cita")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ?", cita)).isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ? AND vigente_hasta IS NULL",
                cita)).isEqualTo(1);
        Map<String, Object> anterior = jdbc.sql("SELECT horario_id, vigente_hasta FROM cita_version_agenda "
                + "WHERE cita_id = ? AND numero = 1").params(cita).query().singleRow();
        assertThat(anterior.get("horario_id")).isEqualTo(horarioViejo);
        assertThat(((java.sql.Timestamp) anterior.get("vigente_hasta")).toInstant())
                .isEqualTo(AHORA.plus(Duration.ofMinutes(10)));
        assertThat(horarioVigente(cita)).isEqualTo(horarioNuevo);
        assertThat(ocupanteDe(horarioViejo)).isNull();
        assertThat(ocupanteDe(horarioNuevo)).isEqualTo(cita);

        assertThat(tiposEvento(cita)).containsExactly("CREADA", "CONFIRMADA", "REPROGRAMADA");
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'REPROGRAMADA' "
                + "AND version_agenda = 2 AND estado_anterior = 'CONFIRMADA' AND estado_nuevo = 'PENDIENTE' "
                + "AND motivo_codigo = 'REP-DISPONIBILIDAD' AND datos ->> 'versionAnterior' = '1' "
                + "AND datos ->> 'inicioNuevo' = '2026-11-05T15:00:00Z'", cita)).isEqualTo(1);
        assertThat(auditorias("CITA_REPROGRAMAR", "EXITO", cita)).isEqualTo(1);

        // Se puede volver a confirmar la nueva versión.
        MvcTestResult reconfirmacion = confirmar(sesion, cita, 2);
        assertThat(reconfirmacion).hasStatusOk().bodyJson().extractingPath("$.confirmadaEn")
                .isEqualTo("2026-11-02T13:10:00Z");
    }

    @Test
    @DisplayName("La lista y los horarios disponibles reflejan el cambio; la línea de tiempo explica la reprogramación")
    void vistasTrasReprogramar() {
        assertThat(reprogramar(sesion, cita, 1, horarioNuevo, "REP-LABORAL")).hasStatusOk();

        assertThat(get(sesion, CITAS)).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                [{"id":"%s","versionAgenda":2,"inicio":"2026-11-05T15:00:00Z"}]
                """.formatted(cita));
        List<String> libres = valor(get(sesion, CITAS + "/" + cita
                + "/horarios-disponibles?desde=2026-11-04&hasta=2026-11-05"), "$[*].id");
        assertThat(libres).contains(horarioViejo.toString()).doesNotContain(horarioNuevo.toString());

        MvcTestResult linea = get(sesion, CITAS + "/" + cita + "/linea-tiempo");
        assertThat(linea).hasStatusOk();
        assertThat((String) valor(linea, "$[1].descripcion")).isEqualTo(
                "Tu cita cambió del 04/11/2026 a las 09:00 al 05/11/2026 a las 10:00. "
                        + "Si deseas, confírmala nuevamente. Motivo: Compromiso laboral.");
        assertThat(cuerpo(linea)).doesNotContain("inicioAnterior", "versionNueva");
    }

    @Test
    @DisplayName("Un horario de otro profesional responde 409 HORARIO_NO_DISPONIBLE y nada cambia")
    void horarioDeOtroProfesional() {
        UUID deP2 = escenario.horario(P2, JUEVES_10AM);

        esperarError(reprogramar(sesion, cita, 1, deP2, "REP-OTRO"), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");

        assertThat(ocupanteDe(deP2)).isNull();
        assertThat(ocupanteDe(horarioViejo)).isEqualTo(cita);
        assertThat(versionAgenda(cita)).isEqualTo(1);
        assertThat(tiposEvento(cita)).containsExactly("CREADA");
    }

    @Test
    @DisplayName("Un horario pasado o inexistente responde 409 HORARIO_NO_DISPONIBLE y nada cambia")
    void horarioPasadoOInexistente() {
        UUID pasado = escenario.horario(P1, AHORA.minus(Duration.ofHours(2)));

        esperarError(reprogramar(sesion, cita, 1, pasado, "REP-OTRO"), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        esperarError(reprogramar(sesion, cita, 1, UUID.randomUUID(), "REP-OTRO"), HttpStatus.CONFLICT,
                "HORARIO_NO_DISPONIBLE");

        assertThat(ocupanteDe(pasado)).isNull();
        assertThat(ocupanteDe(horarioViejo)).isEqualTo(cita);
        assertThat(versionAgenda(cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Reprogramar al mismo horario que ya tiene se rechaza con 422 y la ocupación se conserva")
    void mismoHorario() {
        esperarError(reprogramar(sesion, cita, 1, horarioViejo, "REP-OTRO"), HttpStatus.UNPROCESSABLE_CONTENT,
                "TRANSICION_NO_PERMITIDA");
        assertThat(ocupanteDe(horarioViejo)).isEqualTo(cita);
        assertThat(versionAgenda(cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Con un motivo de cancelación responde 422 MOTIVO_INVALIDO sin tocar la agenda")
    void motivoDeCancelacion() {
        esperarError(reprogramar(sesion, cita, 1, horarioNuevo, "CAN-PERSONAL"), HttpStatus.UNPROCESSABLE_CONTENT,
                "MOTIVO_INVALIDO");
        assertThat(ocupanteDe(horarioNuevo)).isNull();
        assertThat(ocupanteDe(horarioViejo)).isEqualTo(cita);
    }
}
