package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.time.Duration;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R01 · Confirmar una cita Pendiente futura, con idempotencia: repetir la misma clave
 * devuelve el mismo resultado sin duplicar eventos, y la operación puede consultarse por su clave.
 */
@DisplayName("S2-R01 · Confirmación e idempotencia")
class ConfirmacionIdempotenciaIntegracionTest extends PruebaApi {

    private UUID cita;
    private MockHttpSession sesionA;

    @BeforeEach
    void cita() {
        cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        sesionA = login(EMAIL_A);
    }

    @Test
    @DisplayName("Una cita Pendiente futura pasa a Confirmada con un evento CONFIRMADA, auditoría y operación")
    void confirmar() {
        UUID clave = UUID.randomUUID();

        MvcTestResult resultado = confirmar(sesionA, cita, 1, clave);

        assertThat(resultado).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"id":"%s","estado":"CONFIRMADA","estadoEtiqueta":"Confirmada","versionAgenda":1,
                 "confirmadaEn":"2026-11-02T13:00:00Z","accionesPermitidas":["CANCELAR","REPROGRAMAR","PRE_CHECK_IN"]}
                """.formatted(cita));
        assertThat(estado(cita)).isEqualTo("CONFIRMADA");
        assertThat(tiposEvento(cita)).containsExactly("CREADA", "CONFIRMADA");
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'CONFIRMADA' "
                + "AND estado_anterior = 'PENDIENTE' AND estado_nuevo = 'CONFIRMADA' AND operacion_id = ?",
                cita, clave)).isEqualTo(1);
        assertThat(auditorias("CITA_CONFIRMAR", "EXITO", cita)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM operacion WHERE clave = ? AND estado = 'COMPLETADA' "
                + "AND tipo = 'CITA_CONFIRMAR' AND usuario_id = ? AND recurso_id = ?", clave, USUARIO_A, cita))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("Repetir la misma clave devuelve el mismo cuerpo y deja un solo evento CONFIRMADA")
    void repetirMismaClave() {
        UUID clave = UUID.randomUUID();
        MvcTestResult primera = confirmar(sesionA, cita, 1, clave);
        // Aunque el reloj avance, la repetición devuelve el resultado guardado.
        reloj.fijar(AHORA.plus(Duration.ofMinutes(5)));
        MvcTestResult segunda = confirmar(sesionA, cita, 1, clave);

        assertThat(primera).hasStatusOk();
        assertThat(segunda).hasStatusOk().bodyJson().isStrictlyEqualTo(cuerpo(primera));
        assertThat(eventos(cita, "CONFIRMADA")).isEqualTo(1);
        assertThat(auditorias("CITA_CONFIRMAR", "EXITO", cita)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM operacion WHERE clave = ?", clave)).isEqualTo(1);
    }

    @Test
    @DisplayName("La misma clave con otro contenido, otra cita u otro usuario responde 409 IDEMPOTENCIA_CONFLICTO")
    void mismaClaveOtroContenido() {
        UUID otraCita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        UUID citaB = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM.plus(Duration.ofHours(2)));
        UUID clave = UUID.randomUUID();
        assertThat(confirmar(sesionA, cita, 1, clave)).hasStatusOk();

        esperarError(confirmar(sesionA, cita, 2, clave), HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");
        esperarError(cancelar(sesionA, cita, 1, "CAN-PERSONAL", clave), HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");
        esperarError(confirmar(sesionA, otraCita, 1, clave), HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");
        esperarError(confirmar(login(EMAIL_B), citaB, 1, clave), HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");

        assertThat(estado(cita)).isEqualTo("CONFIRMADA");
        assertThat(estado(otraCita)).isEqualTo("PENDIENTE");
        assertThat(estado(citaB)).isEqualTo("PENDIENTE");
        assertThat(eventos(cita, "CONFIRMADA")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE tipo <> 'CREADA'")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM operacion")).isEqualTo(1);
    }

    @Test
    @DisplayName("GET /operaciones/{clave}: 200 COMPLETADA para su autor, 404 si es desconocida o la consulta otro")
    void consultarOperacion() {
        UUID clave = UUID.randomUUID();
        assertThat(confirmar(sesionA, cita, 1, clave)).hasStatusOk();

        assertThat(get(sesionA, "/api/v1/operaciones/" + clave)).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"clave":"%s","tipo":"CITA_CONFIRMAR","recursoId":"%s","estado":"COMPLETADA","httpStatus":200,
                 "codigoError":null,"registradaEn":"2026-11-02T13:00:00Z"}
                """.formatted(clave, cita));
        esperarError(get(sesionA, "/api/v1/operaciones/" + UUID.randomUUID()), HttpStatus.NOT_FOUND,
                "RECURSO_NO_ENCONTRADO");
        MvcTestResult ajena = get(login(EMAIL_B), "/api/v1/operaciones/" + clave);
        esperarError(ajena, HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
        assertThat(cuerpo(ajena)).doesNotContain(cita.toString(), "CITA_CONFIRMAR");
    }

    @Test
    @DisplayName("Una operación rechazada queda registrada como RECHAZADA y repetirla devuelve el mismo rechazo")
    void operacionRechazada() {
        assertThat(confirmar(sesionA, cita, 1)).hasStatusOk();
        UUID clave = UUID.randomUUID();

        MvcTestResult rechazo = confirmar(sesionA, cita, 1, clave);
        MvcTestResult repeticion = confirmar(sesionA, cita, 1, clave);

        esperarError(rechazo, HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
        esperarError(repeticion, HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
        assertThat((String) valor(repeticion, "$.detail")).isEqualTo(valor(rechazo, "$.detail"));
        assertThat(get(sesionA, "/api/v1/operaciones/" + clave)).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"estado":"RECHAZADA","httpStatus":422,"codigoError":"TRANSICION_NO_PERMITIDA"}
                """);
        assertThat(eventos(cita, "CONFIRMADA")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_CONFIRMAR' AND resultado = 'RECHAZO' "
                + "AND codigo = 'TRANSICION_NO_PERMITIDA' AND operacion_id = ?", clave)).isEqualTo(2);
    }

    @Test
    @DisplayName("Sin Idempotency-Key o con una clave que no es UUID responde 400 IDEMPOTENCY_KEY_REQUERIDA")
    void claveRequerida() {
        MvcTestResult sinClave = mvc.post().uri(CITAS + "/" + cita + "/confirmacion").session(sesionA).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"versionAgenda\":1}").exchange();
        MvcTestResult claveInvalida = mvc.post().uri(CITAS + "/" + cita + "/confirmacion").session(sesionA)
                .with(csrf()).header("Idempotency-Key", "no-es-uuid")
                .contentType(MediaType.APPLICATION_JSON).content("{\"versionAgenda\":1}").exchange();

        esperarError(sinClave, HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUERIDA");
        esperarError(claveInvalida, HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUERIDA");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(contar("SELECT count(*) FROM operacion")).isZero();
    }

    @Test
    @DisplayName("Confirmar a la hora prevista o después responde 422 FUERA_DE_PLAZO sin cambios")
    void confirmarFueraDePlazo() {
        reloj.fijar(MIERCOLES_9AM);

        esperarError(confirmar(sesionA, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "FUERA_DE_PLAZO");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(eventos(cita, "CONFIRMADA")).isZero();
    }
}
