package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Pre-check-in (prepara datos, no acredita presencia) y llegada del paciente dentro de la ventana
 * {@code [inicio − 60 min, inicio + 30 min)} del mismo día en Lima.
 */
@DisplayName("Pre-check-in y llegada del paciente")
class PreCheckInLlegadaIntegracionTest extends PruebaApi {

    private UUID cita;
    private MockHttpSession sesion;

    @BeforeEach
    void cita() {
        cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        sesion = login(EMAIL_A);
    }

    @Nested
    @DisplayName("Pre-check-in")
    class PreCheckIn {

        @Test
        @DisplayName("Registra los datos de la versión vigente sin cambiar el estado ni registrar llegada")
        void noCambiaEstado() {
            MvcTestResult resultado = preCheckIn(sesion, cita, 1, true);

            assertThat(resultado).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                    {"estado":"PENDIENTE","preCheckInCompletadoEn":"2026-11-02T13:00:00Z","llegadaRegistradaEn":null,
                     "accionesPermitidas":["CONFIRMAR","CANCELAR","REPROGRAMAR"]}
                    """);
            assertThat(estado(cita)).isEqualTo("PENDIENTE");
            Map<String, Object> fila = jdbc.sql("SELECT version_agenda, email_contacto, telefono_contacto, invalidado_en "
                    + "FROM pre_check_in WHERE cita_id = ?").params(cita).query().singleRow();
            assertThat(fila).containsEntry("version_agenda", 1)
                    .containsEntry("email_contacto", "ana.precheckin@ejemplo.invalid")
                    .containsEntry("telefono_contacto", "+51 900 111 222").containsEntry("invalidado_en", null);
            assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'PRE_CHECK_IN_COMPLETADO' "
                    + "AND estado_anterior = 'PENDIENTE' AND estado_nuevo = 'PENDIENTE'", cita)).isEqualTo(1);
            assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
            // Sigue pudiendo confirmarse.
            assertThat(confirmar(sesion, cita, 1)).hasStatusOk().bodyJson().extractingPath("$.estado")
                    .isEqualTo("CONFIRMADA");
        }

        @Test
        @DisplayName("Sin confirmar los datos (datosCorrectos=false) responde 422 y no guarda nada")
        void datosNoConfirmados() {
            esperarError(preCheckIn(sesion, cita, 1, false), HttpStatus.UNPROCESSABLE_CONTENT,
                    "DATOS_PRE_CHECK_IN_INVALIDOS");

            assertThat(contar("SELECT count(*) FROM pre_check_in")).isZero();
            assertThat(tiposEvento(cita)).containsExactly("CREADA");
        }

        @Test
        @DisplayName("Si falta el campo datosCorrectos el cuerpo es inválido: 400 VALIDACION y no guarda nada")
        void datosCorrectosAusente() {
            MvcTestResult resultado = post(sesion, CITAS + "/" + cita + "/pre-check-in",
                    "{\"versionAgenda\":1,\"email\":\"ana@ejemplo.invalid\",\"telefono\":\"+51 900 111 222\"}");

            esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
            assertThat((List<String>) valor(resultado, "$.errores[*].campo")).containsExactly("datosCorrectos");
            assertThat(contar("SELECT count(*) FROM pre_check_in")).isZero();
        }

        @Test
        @DisplayName("Un segundo pre-check-in de la misma versión responde 422 TRANSICION_NO_PERMITIDA")
        void segundoPreCheckIn() {
            assertThat(preCheckIn(sesion, cita, 1, true)).hasStatusOk();

            esperarError(preCheckIn(sesion, cita, 1, true), HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
            assertThat(contar("SELECT count(*) FROM pre_check_in")).isEqualTo(1);
        }

        @Test
        @DisplayName("Reprogramar invalida el pre-check-in previo y permite uno nuevo para la nueva versión")
        void reprogramarInvalida() {
            UUID nuevo = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
            assertThat(preCheckIn(sesion, cita, 1, true)).hasStatusOk();
            reloj.fijar(AHORA.plus(Duration.ofMinutes(5)));

            MvcTestResult reprogramada = reprogramar(sesion, cita, 1, nuevo, "REP-OTRO");

            assertThat(reprogramada).hasStatusOk().bodyJson().extractingPath("$.preCheckInCompletadoEn").isNull();
            assertThat((List<String>) valor(reprogramada, "$.accionesPermitidas")).contains("PRE_CHECK_IN");
            assertThat(instante("SELECT invalidado_en FROM pre_check_in WHERE cita_id = ? AND version_agenda = 1", cita))
                    .isEqualTo(AHORA.plus(Duration.ofMinutes(5)));

            assertThat(preCheckIn(sesion, cita, 2, true)).hasStatusOk();
            assertThat(contar("SELECT count(*) FROM pre_check_in WHERE cita_id = ?", cita)).isEqualTo(2);
            assertThat(contar("SELECT count(*) FROM pre_check_in WHERE cita_id = ? AND invalidado_en IS NULL "
                    + "AND version_agenda = 2", cita)).isEqualTo(1);
        }
    }

    @Nested
    @DisplayName("Llegada")
    class Llegada {

        private void fueraDePlazo(Instant ahora) {
            reloj.fijar(ahora);
            esperarError(llegada(sesion, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "FUERA_DE_PLAZO");
            assertThat(estado(cita)).isEqualTo("PENDIENTE");
            assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
        }

        @Test
        @DisplayName("Fuera de la ventana responde 422 FUERA_DE_PLAZO (días antes, 61 min antes y desde inicio + 30 min)")
        void fueraDeVentana() {
            fueraDePlazo(AHORA);
            fueraDePlazo(MIERCOLES_9AM.minus(Duration.ofMinutes(61)));
            fueraDePlazo(MIERCOLES_9AM.minus(Duration.ofMinutes(60)).minusSeconds(1));
            fueraDePlazo(MIERCOLES_9AM.plus(Duration.ofMinutes(30)));
            fueraDePlazo(MIERCOLES_9AM.plus(Duration.ofHours(2)));
            assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_REGISTRAR_LLEGADA' "
                    + "AND resultado = 'RECHAZO' AND codigo = 'FUERA_DE_PLAZO'")).isEqualTo(5);
        }

        @Test
        @DisplayName("En la apertura exacta (inicio − 60 min) se registra la llegada y la cita pasa a CHECK_IN")
        void aperturaExacta() {
            Instant apertura = MIERCOLES_9AM.minus(Duration.ofMinutes(60));
            reloj.fijar(apertura);

            MvcTestResult resultado = llegada(sesion, cita, 1);

            assertThat(resultado).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                    {"estado":"CHECK_IN","estadoEtiqueta":"Llegada registrada","llegadaRegistradaEn":"2026-11-04T13:00:00Z",
                     "accionesPermitidas":[],"ventanaLlegada":null}
                    """);
            assertThat(estado(cita)).isEqualTo("CHECK_IN");
            Map<String, Object> llegada = jdbc.sql("SELECT canal, registrado_por, version_agenda FROM registro_llegada "
                    + "WHERE cita_id = ?").params(cita).query().singleRow();
            assertThat(llegada).containsEntry("canal", "PACIENTE").containsEntry("registrado_por", USUARIO_A)
                    .containsEntry("version_agenda", 1);
            assertThat(instante("SELECT registrado_en FROM registro_llegada WHERE cita_id = ?", cita)).isEqualTo(apertura);
            assertThat(tiposEvento(cita)).containsExactly("CREADA", "LLEGADA_REGISTRADA");
        }

        @Test
        @DisplayName("Un instante antes del cierre (inicio + 30 min − 1 s) aún se admite, sin confirmación previa")
        void justoAntesDelCierre() {
            reloj.fijar(MIERCOLES_9AM.plus(Duration.ofMinutes(30)).minusSeconds(1));

            assertThat(llegada(sesion, cita, 1)).hasStatusOk().bodyJson().extractingPath("$.estado")
                    .isEqualTo("CHECK_IN");
            assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'LLEGADA_REGISTRADA' "
                    + "AND estado_anterior = 'PENDIENTE'", cita)).isEqualTo(1);
        }

        @Test
        @DisplayName("Una segunda llegada responde 422 LLEGADA_YA_REGISTRADA y no duplica el registro")
        void segundaLlegada() {
            reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(10)));
            assertThat(llegada(sesion, cita, 1)).hasStatusOk();

            esperarError(llegada(sesion, cita, 1), HttpStatus.UNPROCESSABLE_CONTENT, "LLEGADA_YA_REGISTRADA");
            assertThat(contar("SELECT count(*) FROM registro_llegada WHERE cita_id = ?", cita)).isEqualTo(1);
            assertThat(eventos(cita, "LLEGADA_REGISTRADA")).isEqualTo(1);
        }

        @Test
        @DisplayName("La ventana exige el mismo día local: a las 23:45 del día anterior no se admite una cita de 00:30")
        void mismoDiaLocal() {
            // Martes 03/11/2026 00:30 en Lima = 05:30Z; la ventana teórica abriría el lunes a las 23:30.
            UUID madrugada = escenario.cita(PACIENTE_A, P1, Instant.parse("2026-11-03T05:30:00Z"));
            reloj.fijar(Instant.parse("2026-11-03T04:45:00Z"));
            esperarError(llegada(sesion, madrugada, 1), HttpStatus.UNPROCESSABLE_CONTENT, "FUERA_DE_PLAZO");
            assertThat(estado(madrugada)).isEqualTo("PENDIENTE");

            reloj.fijar(Instant.parse("2026-11-03T05:00:00Z"));
            assertThat(llegada(sesion, madrugada, 1)).hasStatusOk();
            assertThat(estado(madrugada)).isEqualTo("CHECK_IN");
        }

        @Test
        @DisplayName("Una llegada con versionAgenda obsoleta responde 409 VERSION_OBSOLETA")
        void versionObsoleta() {
            reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(10)));
            esperarError(llegada(sesion, cita, 2), HttpStatus.CONFLICT, "VERSION_OBSOLETA");
            assertThat(estado(cita)).isEqualTo("PENDIENTE");
        }
    }
}
