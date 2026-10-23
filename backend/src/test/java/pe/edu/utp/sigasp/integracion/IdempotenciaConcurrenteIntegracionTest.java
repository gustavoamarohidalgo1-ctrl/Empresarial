package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Idempotencia bajo concurrencia real (dos hilos liberados a la vez con un CountDownLatch).
 * <p>
 * Comportamiento observado y documentado: con la <b>misma clave</b>, {@code Idempotencia} toma
 * {@code pg_advisory_xact_lock} por clave antes de leer la cita, así que la segunda solicitud
 * espera a que la primera confirme y luego devuelve el resultado guardado: <b>ambas responden
 * 200 con el mismo cuerpo</b> (nunca 409 CONFLICTO_CONCURRENTE) y queda un solo evento.
 * <p>
 * Con <b>claves distintas</b> sobre la misma cita, la carga bloquea la fila de la cita: la segunda
 * solicitud espera y evalúa las reglas con el estado ya confirmado (422 o 409 VERSION_OBSOLETA).
 * Antes de esa corrección, la perdedora respondía 500 por la clave única de la secuencia del evento.
 */
@DisplayName("Idempotencia concurrente")
class IdempotenciaConcurrenteIntegracionTest extends PruebaApi {

    @RepeatedTest(5)
    @DisplayName("Misma clave y mismo contenido a la vez: ambas 200 con el mismo cuerpo y un solo evento CONFIRMADA")
    void mismaClaveSimultanea() throws Exception {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession pestana1 = login(EMAIL_A);
        MockHttpSession pestana2 = login(EMAIL_A);
        UUID clave = UUID.randomUUID();

        List<MvcTestResult> resultados = simultaneas(
                () -> confirmar(pestana1, cita, 1, clave),
                () -> confirmar(pestana2, cita, 1, clave));

        assertThat(resultados.get(0)).hasStatusOk();
        assertThat(resultados.get(1)).hasStatusOk();
        assertThat(cuerpo(resultados.get(1))).isEqualTo(cuerpo(resultados.get(0)));
        assertThat(estado(cita)).isEqualTo("CONFIRMADA");
        assertThat(eventos(cita, "CONFIRMADA")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM operacion WHERE clave = ?", clave)).isEqualTo(1);
        assertThat(auditorias("CITA_CONFIRMAR", "EXITO", cita)).isEqualTo(1);
        esperarOyentes();
        assertThat(contar("SELECT count(*) FROM notificacion WHERE cita_id = ? AND tipo = 'CAMBIO' "
                + "AND ventana = 'CONFIRMADA'", cita)).isEqualTo(1);
    }

    @RepeatedTest(3)
    @DisplayName("Misma clave con dos acciones distintas a la vez: una 200 y la otra 409 IDEMPOTENCIA_CONFLICTO")
    void mismaClaveAccionesDistintas() throws Exception {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession pestana1 = login(EMAIL_A);
        MockHttpSession pestana2 = login(EMAIL_A);
        UUID clave = UUID.randomUUID();

        List<MvcTestResult> resultados = simultaneas(
                () -> confirmar(pestana1, cita, 1, clave),
                () -> cancelar(pestana2, cita, 1, "CAN-PERSONAL", clave));

        List<Integer> estados = resultados.stream().map(r -> r.getResponse().getStatus()).toList();
        assertThat(estados).containsExactlyInAnyOrder(200, 409);
        MvcTestResult perdedora = resultados.get(estados.get(0) == 200 ? 1 : 0);
        esperarError(perdedora, HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");
        assertThat(tiposEvento(cita)).hasSize(2);
        assertThat(contar("SELECT count(*) FROM operacion WHERE clave = ?", clave)).isEqualTo(1);
    }

    @RepeatedTest(5)
    @DisplayName("Claves distintas sobre la misma cita a la vez: una confirma y la otra se rechaza con 409 o 422, nunca 500")
    void clavesDistintasSimultaneas() throws Exception {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession pestana1 = login(EMAIL_A);
        MockHttpSession pestana2 = login(EMAIL_A);

        List<MvcTestResult> resultados = simultaneas(
                () -> confirmar(pestana1, cita, 1),
                () -> confirmar(pestana2, cita, 1));

        List<Integer> estados = resultados.stream().map(r -> r.getResponse().getStatus()).toList();
        assertThat(estados).containsOnlyOnce(200);
        MvcTestResult perdedora = resultados.get(estados.get(0) == 200 ? 1 : 0);
        String codigo = valor(perdedora, "$.codigo");
        assertThat(codigo).isIn("CONFLICTO_CONCURRENTE", "TRANSICION_NO_PERMITIDA");
        assertThat(perdedora.getResponse().getStatus()).isIn(409, 422);
        assertThat(eventos(cita, "CONFIRMADA")).isEqualTo(1);
        assertThat(estado(cita)).isEqualTo("CONFIRMADA");
    }

    @RepeatedTest(3)
    @DisplayName("Doble clic del operador (claves distintas, misma versionCita): una llegada y la otra 409 VERSION_OBSOLETA")
    void dobleClicOperador() throws Exception {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(20)));
        MockHttpSession operador1 = login(EMAIL_OPERADOR);
        MockHttpSession operador2 = login(EMAIL_OPERADOR);
        long vista = versionCita(cita);

        List<MvcTestResult> resultados = simultaneas(
                () -> transicion(operador1, cita, "REGISTRAR_LLEGADA", vista),
                () -> transicion(operador2, cita, "REGISTRAR_LLEGADA", vista));

        List<Integer> estados = resultados.stream().map(r -> r.getResponse().getStatus()).toList();
        assertThat(estados).containsExactlyInAnyOrder(200, 409);
        esperarError(resultados.get(estados.get(0) == 200 ? 1 : 0), HttpStatus.CONFLICT, "VERSION_OBSOLETA");
        assertThat(contar("SELECT count(*) FROM registro_llegada WHERE cita_id = ?", cita)).isEqualTo(1);
        assertThat(eventos(cita, "LLEGADA_REGISTRADA")).isEqualTo(1);
    }

    @RepeatedTest(3)
    @DisplayName("Llegada del paciente y del operador a la vez: queda un solo registro y la otra se rechaza (409/422)")
    void llegadaPacienteYOperador() throws Exception {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(20)));
        MockHttpSession paciente = login(EMAIL_A);
        MockHttpSession operador = login(EMAIL_OPERADOR);
        long vista = versionCita(cita);

        List<MvcTestResult> resultados = simultaneas(
                () -> llegada(paciente, cita, 1),
                () -> transicion(operador, cita, "REGISTRAR_LLEGADA", vista));

        List<Integer> estados = resultados.stream().map(r -> r.getResponse().getStatus()).toList();
        assertThat(estados).containsOnlyOnce(200);
        MvcTestResult perdedora = resultados.get(estados.get(0) == 200 ? 1 : 0);
        assertThat((String) valor(perdedora, "$.codigo")).isIn("LLEGADA_YA_REGISTRADA", "VERSION_OBSOLETA");
        assertThat(contar("SELECT count(*) FROM registro_llegada WHERE cita_id = ?", cita)).isEqualTo(1);
        assertThat(eventos(cita, "LLEGADA_REGISTRADA")).isEqualTo(1);
        assertThat(estado(cita)).isEqualTo("CHECK_IN");
    }
}
