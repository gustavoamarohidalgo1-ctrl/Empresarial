package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R05 · Un paciente no puede cambiar citas de otro: cada intento responde 404 (como si no
 * existiera), queda auditado como DENEGADO y no deja eventos, operaciones ni cambios de agenda.
 */
@DisplayName("S2-R05 · Acciones sobre una cita ajena")
class AccionesCitaAjenaIntegracionTest extends PruebaApi {

    private UUID citaB;
    private UUID horarioB;
    private UUID libre;
    private MockHttpSession sesionA;

    @BeforeEach
    void cita() {
        citaB = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM);
        horarioB = horarioDe(citaB);
        libre = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        sesionA = login(EMAIL_A);
    }

    private void sinCambios() {
        esperarOyentes();
        assertThat(estado(citaB)).isEqualTo("PENDIENTE");
        assertThat(versionAgenda(citaB)).isEqualTo(1);
        assertThat(tiposEvento(citaB)).containsExactly("CREADA");
        assertThat(ocupanteDe(horarioB)).isEqualTo(citaB);
        assertThat(ocupanteDe(libre)).isNull();
        assertThat(contar("SELECT count(*) FROM operacion")).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE resultado = 'EXITO' AND accion LIKE 'CITA_%' "
                + "AND accion <> 'CITA_REGISTRAR'")).isZero();
        assertThat(contar("SELECT count(*) FROM notificacion WHERE ventana <> 'CREADA'")).isZero();
        assertThat(contar("SELECT count(*) FROM pre_check_in")).isZero();
        assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
    }

    private void esperar404(MvcTestResult resultado) {
        esperarError(resultado, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA");
        assertThat(cuerpo(resultado)).doesNotContain("Beto", "SP-2026-000001", "PENDIENTE");
    }

    @Test
    @DisplayName("A no puede confirmar, cancelar ni reprogramar la cita de B: 404, auditado y sin cambios")
    void confirmarCancelarReprogramar() {
        esperar404(confirmar(sesionA, citaB, 1));
        esperar404(cancelar(sesionA, citaB, 1, "CAN-PERSONAL"));
        esperar404(reprogramar(sesionA, citaB, 1, libre, "REP-DISPONIBILIDAD"));

        sinCambios();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_ACCESO' AND resultado = 'DENEGADO' "
                + "AND entidad_id = ? AND actor_usuario_id = ?", citaB.toString(), USUARIO_A)).isEqualTo(3);
    }

    @Test
    @DisplayName("A tampoco puede hacer el pre-check-in ni registrar la llegada de la cita de B")
    void preCheckInYLlegada() {
        esperar404(preCheckIn(sesionA, citaB, 1, true));
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(15)));
        esperar404(llegada(sesionA, citaB, 1));

        sinCambios();
        assertThat(auditorias("CITA_ACCESO", "DENEGADO", citaB)).isEqualTo(2);
    }

    @Test
    @DisplayName("Un 404 por propiedad no registra la operación y la cita de B sigue operable por su dueño")
    void operacionNoRegistrada() {
        UUID clave = UUID.randomUUID();
        esperar404(confirmar(sesionA, citaB, 1, clave));
        esperarError(get(sesionA, "/api/v1/operaciones/" + clave), HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");

        assertThat(confirmar(login(EMAIL_B), citaB, 1)).hasStatusOk();
        assertThat(estado(citaB)).isEqualTo("CONFIRMADA");
    }
}
