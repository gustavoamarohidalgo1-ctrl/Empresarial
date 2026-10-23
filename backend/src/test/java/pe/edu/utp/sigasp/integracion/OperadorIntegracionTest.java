package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P2;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_OPERADOR;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Panel del operador: solo ve las citas del día de sus profesionales asignados (P1) y avanza el
 * recorrido enviando la versión de la cita que vio; una versión vieja no sobrescribe nada.
 */
@DisplayName("Operador · panel del día y transiciones")
class OperadorIntegracionTest extends PruebaApi {

    /** Miércoles 04/11/2026 08:30 en Lima: dentro de la ventana de llegada de MIERCOLES_9AM. */
    private static final Instant MIERCOLES_830 = MIERCOLES_9AM.minus(Duration.ofMinutes(30));

    @Test
    @DisplayName("GET ?fecha= solo muestra las citas de P1 de ese día local, ordenadas por hora")
    void panelSoloProfesionalesAsignados() {
        UUID p1Temprano = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID p1Noche = escenario.cita(PACIENTE_B, P1, Instant.parse("2026-11-05T04:30:00Z")); // 23:30 del miércoles
        UUID p2 = escenario.cita(PACIENTE_A, P2, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        UUID p1Jueves = escenario.cita(PACIENTE_B, P1, Instant.parse("2026-11-05T05:10:00Z")); // 00:10 del jueves
        MockHttpSession operador = login(EMAIL_OPERADOR);

        MvcTestResult panel = get(operador, OPERADOR + "?fecha=2026-11-04");

        assertThat(panel).hasStatusOk();
        assertThat((List<String>) valor(panel, "$[*].id")).containsExactly(p1Temprano.toString(), p1Noche.toString());
        assertThat(cuerpo(panel)).doesNotContain(p2.toString(), p1Jueves.toString(), "Profesional P2");
        assertThat(panel).bodyJson().isLenientlyEqualTo("""
                [{"id":"%s","codigo":"SP-2026-000001","inicio":"2026-11-04T14:00:00Z","estado":"PENDIENTE",
                  "estadoEtiqueta":"Pendiente","pacienteNombre":"Ana Prueba",
                  "profesional":{"codigo":"P1","nombre":"Profesional P1"},
                  "especialidad":{"codigo":"ESP-1","nombre":"Medicina general"},
                  "versionCita":%d,"accionesPermitidas":[],"llegadaRegistradaEn":null},
                 {"id":"%s","pacienteNombre":"Beto Prueba"}]
                """.formatted(p1Temprano, versionCita(p1Temprano), p1Noche));

        assertThat(get(operador, OPERADOR + "?fecha=2026-11-05")).hasStatusOk().bodyJson()
                .extractingPath("$[*].id").asArray().containsExactly(p1Jueves.toString());
        assertThat(get(operador, OPERADOR + "?fecha=2026-11-06")).hasStatusOk().bodyJson().isEqualTo("[]");
    }

    @Test
    @DisplayName("Recorrido completo REGISTRAR_LLEGADA → PASAR_A_ESPERA → INICIAR_ATENCION → COMPLETAR con versionCita")
    void recorridoCompleto() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_830);
        MockHttpSession operador = login(EMAIL_OPERADOR);

        MvcTestResult panel = get(operador, OPERADOR + "?fecha=2026-11-04");
        assertThat((List<String>) valor(panel, "$[0].accionesPermitidas")).containsExactly("REGISTRAR_LLEGADA");
        long version = numero(panel, "$[0].versionCita");

        String[][] pasos = {
                {"REGISTRAR_LLEGADA", "CHECK_IN", "PASAR_A_ESPERA"},
                {"PASAR_A_ESPERA", "EN_ESPERA", "INICIAR_ATENCION"},
                {"INICIAR_ATENCION", "EN_ATENCION", "COMPLETAR"},
                {"COMPLETAR", "COMPLETADA", null}};
        for (int i = 0; i < pasos.length; i++) {
            reloj.fijar(MIERCOLES_830.plus(Duration.ofMinutes(5L * i)));
            MvcTestResult resultado = transicion(operador, cita, pasos[i][0], version);

            assertThat(resultado).as(pasos[i][0]).hasStatusOk().bodyJson().extractingPath("$.estado")
                    .isEqualTo(pasos[i][1]);
            List<String> acciones = valor(resultado, "$.accionesPermitidas");
            if (pasos[i][2] == null) {
                assertThat(acciones).isEmpty();
            } else {
                assertThat(acciones).containsExactly(pasos[i][2]);
            }
            long nueva = numero(resultado, "$.versionCita");
            assertThat(nueva).isGreaterThan(version).isEqualTo(versionCita(cita));
            version = nueva;
            assertThat(estado(cita)).isEqualTo(pasos[i][1]);
        }

        assertThat(tiposEvento(cita)).containsExactly("CREADA", "LLEGADA_REGISTRADA", "EN_ESPERA", "EN_ATENCION",
                "COMPLETADA");
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo <> 'CREADA' "
                + "AND actor_tipo = 'OPERADOR' AND actor_usuario_id = ?", cita, USUARIO_OPERADOR)).isEqualTo(4);
        assertThat(contar("SELECT count(*) FROM registro_llegada WHERE cita_id = ? AND canal = 'OPERADOR' "
                + "AND registrado_por = ?", cita, USUARIO_OPERADOR)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion LIKE 'CITA_OPERADOR_%' AND resultado = 'EXITO' "
                + "AND actor_usuario_id = ?", USUARIO_OPERADOR)).isEqualTo(4);
        assertThat(get(login(EMAIL_A), CITAS + "?alcance=historial")).bodyJson()
                .extractingPath("$[0].estado").isEqualTo("COMPLETADA");
    }

    @Test
    @DisplayName("Una versionCita vieja responde 409 VERSION_OBSOLETA y no sobrescribe el estado")
    void versionCitaVieja() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_830);
        MockHttpSession operador = login(EMAIL_OPERADOR);
        long vista = versionCita(cita);
        assertThat(transicion(operador, cita, "REGISTRAR_LLEGADA", vista)).hasStatusOk();

        esperarError(transicion(operador, cita, "PASAR_A_ESPERA", vista), HttpStatus.CONFLICT, "VERSION_OBSOLETA");

        assertThat(estado(cita)).isEqualTo("CHECK_IN");
        assertThat(eventos(cita, "EN_ESPERA")).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_OPERADOR_PASAR_A_ESPERA' "
                + "AND resultado = 'RECHAZO' AND codigo = 'VERSION_OBSOLETA'")).isEqualTo(1);
    }

    @Test
    @DisplayName("Un cambio del paciente entre la vista y la acción del operador también da 409 VERSION_OBSOLETA")
    void cambioDelPacienteEnMedio() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        long vista = versionCita(cita);
        assertThat(confirmar(login(EMAIL_A), cita, 1)).hasStatusOk();
        reloj.fijar(MIERCOLES_830);

        esperarError(transicion(login(EMAIL_OPERADOR), cita, "REGISTRAR_LLEGADA", vista), HttpStatus.CONFLICT,
                "VERSION_OBSOLETA");
        assertThat(estado(cita)).isEqualTo("CONFIRMADA");
        assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
    }

    @Test
    @DisplayName("Una cita de P2 (no asignado) responde 404 CITA_NO_ENCONTRADA, auditado, sin cambios")
    void citaDeOtroProfesional() {
        UUID cita = escenario.cita(PACIENTE_A, P2, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_830);

        MvcTestResult resultado = transicion(login(EMAIL_OPERADOR), cita, "REGISTRAR_LLEGADA", versionCita(cita));

        esperarError(resultado, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA");
        assertThat(cuerpo(resultado)).doesNotContain("Ana", "SP-2026-000001", "Profesional P2");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(tiposEvento(cita)).containsExactly("CREADA");
        assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_ACCESO' AND resultado = 'DENEGADO' "
                + "AND entidad_id = ? AND actor_usuario_id = ?", cita.toString(), USUARIO_OPERADOR)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una acción inválida desde el estado actual responde 422 sin cambios")
    void accionInvalida() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_830);
        MockHttpSession operador = login(EMAIL_OPERADOR);

        esperarError(transicion(operador, cita, "COMPLETAR", versionCita(cita)), HttpStatus.UNPROCESSABLE_CONTENT,
                "TRANSICION_NO_PERMITIDA");
        esperarError(transicion(operador, cita, "PASAR_A_ESPERA", versionCita(cita)), HttpStatus.UNPROCESSABLE_CONTENT,
                "TRANSICION_NO_PERMITIDA");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");

        assertThat(transicion(operador, cita, "REGISTRAR_LLEGADA", versionCita(cita))).hasStatusOk();
        esperarError(transicion(operador, cita, "INICIAR_ATENCION", versionCita(cita)),
                HttpStatus.UNPROCESSABLE_CONTENT, "TRANSICION_NO_PERMITIDA");
        esperarError(transicion(operador, cita, "REGISTRAR_LLEGADA", versionCita(cita)),
                HttpStatus.UNPROCESSABLE_CONTENT, "LLEGADA_YA_REGISTRADA");
        assertThat(estado(cita)).isEqualTo("CHECK_IN");
        assertThat(tiposEvento(cita)).containsExactly("CREADA", "LLEGADA_REGISTRADA");
    }

    @Test
    @DisplayName("Registrar la llegada fuera de la ventana responde 422 FUERA_DE_PLAZO; una acción desconocida, 400")
    void llegadaFueraDeVentanaYAccionDesconocida() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession operador = login(EMAIL_OPERADOR);

        esperarError(transicion(operador, cita, "REGISTRAR_LLEGADA", versionCita(cita)),
                HttpStatus.UNPROCESSABLE_CONTENT, "FUERA_DE_PLAZO");
        esperarError(transicion(operador, cita, "CANCELAR", versionCita(cita)), HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
    }
}
