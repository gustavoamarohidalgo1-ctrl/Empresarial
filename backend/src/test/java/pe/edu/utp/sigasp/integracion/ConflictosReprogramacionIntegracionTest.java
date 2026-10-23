package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R04 · Conflictos al reprogramar: horario ocupado, versión de agenda obsoleta y dos
 * reprogramaciones simultáneas hacia el mismo horario libre. En todos los casos la cita perdedora
 * conserva íntegro su horario, su versión y su estado.
 */
@DisplayName("S2-R04 · Conflictos de reprogramación")
class ConflictosReprogramacionIntegracionTest extends PruebaApi {

    private static final Instant JUEVES_10AM = Instant.parse("2026-11-05T15:00:00Z");

    @Test
    @DisplayName("Un horario ocupado por otra cita responde 409 HORARIO_NO_DISPONIBLE y la cita original no cambia")
    void horarioOcupado() {
        UUID citaA = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID citaB = escenario.cita(PACIENTE_B, P1, JUEVES_10AM);
        UUID horarioA = horarioDe(citaA);
        UUID horarioB = horarioDe(citaB);
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(confirmar(sesion, citaA, 1)).hasStatusOk();
        UUID clave = UUID.randomUUID();

        MvcTestResult resultado = reprogramar(sesion, citaA, 1, horarioB, "REP-DISPONIBILIDAD", clave);

        esperarError(resultado, HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        assertThat(estado(citaA)).isEqualTo("CONFIRMADA");
        assertThat(versionAgenda(citaA)).isEqualTo(1);
        assertThat(horarioVigente(citaA)).isEqualTo(horarioA);
        assertThat(ocupanteDe(horarioA)).isEqualTo(citaA);
        assertThat(ocupanteDe(horarioB)).isEqualTo(citaB);
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ?", citaA)).isEqualTo(1);
        assertThat(tiposEvento(citaA)).containsExactly("CREADA", "CONFIRMADA");
        assertThat(detalle(sesion, citaA)).bodyJson().extractingPath("$.confirmadaEn").isNotNull();
        assertThat(contar("SELECT count(*) FROM operacion WHERE clave = ? AND estado = 'RECHAZADA' "
                + "AND codigo_error = 'HORARIO_NO_DISPONIBLE'", clave)).isEqualTo(1);
        assertThat(auditorias("CITA_REPROGRAMAR", "RECHAZO", citaA)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una versionAgenda obsoleta responde 409 VERSION_OBSOLETA en reprogramar, confirmar y cancelar")
    void versionObsoleta() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID primerCambio = escenario.horario(P1, JUEVES_10AM);
        UUID segundoCambio = escenario.horario(P1, JUEVES_10AM.plus(Duration.ofHours(1)));
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(reprogramar(sesion, cita, 1, primerCambio, "REP-OTRO")).hasStatusOk();

        esperarError(reprogramar(sesion, cita, 1, segundoCambio, "REP-OTRO"), HttpStatus.CONFLICT,
                "VERSION_OBSOLETA");
        esperarError(confirmar(sesion, cita, 1), HttpStatus.CONFLICT, "VERSION_OBSOLETA");
        esperarError(cancelar(sesion, cita, 1, "CAN-PERSONAL"), HttpStatus.CONFLICT, "VERSION_OBSOLETA");

        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(versionAgenda(cita)).isEqualTo(2);
        assertThat(horarioVigente(cita)).isEqualTo(primerCambio);
        assertThat(ocupanteDe(primerCambio)).isEqualTo(cita);
        assertThat(ocupanteDe(segundoCambio)).isNull();
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ?", cita)).isEqualTo(2);
        assertThat(tiposEvento(cita)).containsExactly("CREADA", "REPROGRAMADA");
    }

    @RepeatedTest(3)
    @DisplayName("Dos reprogramaciones simultáneas al mismo horario libre: gana una y la otra conserva su horario")
    void reprogramacionesSimultaneas() throws Exception {
        UUID citaA = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID citaB = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        UUID horarioA = horarioDe(citaA);
        UUID horarioB = horarioDe(citaB);
        UUID disputado = escenario.horario(P1, JUEVES_10AM);
        MockHttpSession sesionA = login(EMAIL_A);
        MockHttpSession sesionB = login(EMAIL_B);

        List<MvcTestResult> resultados = simultaneas(
                () -> reprogramar(sesionA, citaA, 1, disputado, "REP-DISPONIBILIDAD"),
                () -> reprogramar(sesionB, citaB, 1, disputado, "REP-DISPONIBILIDAD"));

        List<Integer> estados = resultados.stream().map(r -> r.getResponse().getStatus()).toList();
        assertThat(estados).containsExactlyInAnyOrder(200, 409);
        boolean ganoA = estados.get(0) == 200;
        UUID ganadora = ganoA ? citaA : citaB;
        UUID perdedora = ganoA ? citaB : citaA;
        UUID horarioGanadora = ganoA ? horarioA : horarioB;
        UUID horarioPerdedora = ganoA ? horarioB : horarioA;
        esperarError(resultados.get(ganoA ? 1 : 0), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");

        assertThat(ocupanteDe(disputado)).isEqualTo(ganadora);
        assertThat(contar("SELECT count(*) FROM horario WHERE id = ? AND cita_id IS NOT NULL", disputado)).isEqualTo(1);
        assertThat(versionAgenda(ganadora)).isEqualTo(2);
        assertThat(ocupanteDe(horarioGanadora)).isNull();

        assertThat(versionAgenda(perdedora)).isEqualTo(1);
        assertThat(estado(perdedora)).isEqualTo("PENDIENTE");
        assertThat(horarioVigente(perdedora)).isEqualTo(horarioPerdedora);
        assertThat(ocupanteDe(horarioPerdedora)).isEqualTo(perdedora);
        assertThat(tiposEvento(perdedora)).containsExactly("CREADA");
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ?", perdedora)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE tipo = 'REPROGRAMADA'")).isEqualTo(1);
    }
}
