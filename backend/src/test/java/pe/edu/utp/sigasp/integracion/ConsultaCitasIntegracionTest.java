package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P2;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_OPERADOR;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.citas.aplicacion.CierreInasistencias;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S1-R04 · Consulta de citas: próximas, historial, detalle y línea de tiempo coinciden con el
 * escenario y con la BD; la línea de tiempo solo trae textos aptos para el paciente.
 */
@DisplayName("S1-R04 · Lista, detalle y línea de tiempo")
class ConsultaCitasIntegracionTest extends PruebaApi {

    @Autowired
    private CierreInasistencias cierre;

    @Test
    @DisplayName("Próximas e historial traen las citas del paciente en el orden documentado y con sus datos")
    void proximasEHistorial() {
        UUID noAsistio = escenario.cita(PACIENTE_A, P1, AHORA.plus(Duration.ofHours(1)));        // SP-2026-000001
        UUID miercoles = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);                         // SP-2026-000002
        UUID jueves = escenario.cita(PACIENTE_A, P2, MIERCOLES_9AM.plus(Duration.ofDays(1)));    // SP-2026-000003
        UUID cancelada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofHours(2))); // SP-2026-000004
        UUID deB = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));      // SP-2026-000005
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(cancelar(sesion, cancelada, 1, "CAN-PERSONAL")).hasStatusOk();
        reloj.fijar(AHORA.plus(Duration.ofMinutes(90)));
        assertThat(cierre.ejecutar()).isEqualTo(1);

        MvcTestResult proximas = get(sesion, CITAS + "?alcance=proximas");
        assertThat(proximas).hasStatusOk();
        assertThat((List<String>) valor(proximas, "$[*].id"))
                .containsExactly(miercoles.toString(), jueves.toString());
        assertThat(proximas).bodyJson().isLenientlyEqualTo("""
                [{"id":"%s","codigo":"SP-2026-000002","estado":"PENDIENTE","estadoEtiqueta":"Pendiente",
                  "inicio":"2026-11-04T14:00:00Z","fin":"2026-11-04T14:20:00Z","versionAgenda":1,
                  "sede":{"codigo":"SEDE-T","nombre":"Sede de prueba"},
                  "especialidad":{"codigo":"ESP-1","nombre":"Medicina general"},
                  "profesional":{"codigo":"P1","nombre":"Profesional P1"}},
                 {"id":"%s","codigo":"SP-2026-000003","estado":"PENDIENTE","inicio":"2026-11-05T14:00:00Z",
                  "especialidad":{"codigo":"ESP-2","nombre":"Cardiología"},
                  "profesional":{"codigo":"P2","nombre":"Profesional P2"}}]
                """.formatted(miercoles, jueves));
        // Sin parámetro, el alcance por defecto es "proximas".
        assertThat(cuerpo(get(sesion, CITAS))).isEqualTo(cuerpo(proximas));

        MvcTestResult historial = get(sesion, CITAS + "?alcance=historial");
        assertThat(historial).hasStatusOk();
        assertThat((List<String>) valor(historial, "$[*].id"))
                .containsExactly(cancelada.toString(), noAsistio.toString());
        assertThat((List<String>) valor(historial, "$[*].estado")).containsExactly("CANCELADA", "NO_ASISTIO");
        assertThat((List<String>) valor(historial, "$[*].estadoEtiqueta"))
                .containsExactly("Cancelada", "No asistió");
        assertThat(cuerpo(historial) + cuerpo(proximas)).doesNotContain(deB.toString(), "SP-2026-000005");

        // La BD respalda lo que muestra la API.
        assertThat(estado(miercoles)).isEqualTo("PENDIENTE");
        assertThat(estado(jueves)).isEqualTo("PENDIENTE");
        assertThat(estado(cancelada)).isEqualTo("CANCELADA");
        assertThat(estado(noAsistio)).isEqualTo("NO_ASISTIO");
    }

    @Test
    @DisplayName("El detalle trae zona, acciones permitidas, ventana de llegada y motivo según el estado")
    void detalle() {
        UUID pendiente = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID cancelada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofHours(2)));
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(cancelar(sesion, cancelada, 1, "CAN-PERSONAL")).hasStatusOk();

        assertThat(detalle(sesion, pendiente)).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"id":"%s","codigo":"SP-2026-000001","estado":"PENDIENTE","estadoEtiqueta":"Pendiente",
                 "inicio":"2026-11-04T14:00:00Z","fin":"2026-11-04T14:20:00Z","versionAgenda":1,
                 "sede":{"codigo":"SEDE-T"},"profesional":{"codigo":"P1"},"especialidad":{"codigo":"ESP-1"},
                 "zonaHoraria":"America/Lima",
                 "accionesPermitidas":["CONFIRMAR","CANCELAR","REPROGRAMAR","PRE_CHECK_IN"],
                 "ventanaLlegada":{"desde":"2026-11-04T13:00:00Z","hasta":"2026-11-04T14:30:00Z"},
                 "confirmadaEn":null,"preCheckInCompletadoEn":null,"llegadaRegistradaEn":null,
                 "motivoCancelacion":null}
                """.formatted(pendiente));
        assertThat((List<String>) valor(detalle(sesion, pendiente), "$.accionesPermitidas"))
                .doesNotContain("REGISTRAR_LLEGADA");

        MvcTestResult detalleCancelada = detalle(sesion, cancelada);
        assertThat(detalleCancelada).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                {"estado":"CANCELADA","estadoEtiqueta":"Cancelada","accionesPermitidas":[],"ventanaLlegada":null,
                 "motivoCancelacion":{"codigo":"CAN-PERSONAL","descripcion":"Compromiso personal"}}
                """);
        assertThat(jdbc.sql("SELECT motivo_cancelacion FROM cita WHERE id = ?").params(cancelada)
                .query(String.class).single()).isEqualTo("CAN-PERSONAL");
    }

    @Test
    @DisplayName("La línea de tiempo viene ordenada por secuencia y solo con textos para el paciente")
    void lineaTiempo() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);
        UUID claveConfirmacion = UUID.randomUUID();
        assertThat(confirmar(sesion, cita, 1, claveConfirmacion)).hasStatusOk();
        reloj.fijar(AHORA.plus(Duration.ofHours(1)));
        assertThat(preCheckIn(sesion, cita, 1, true)).hasStatusOk();
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(30)));
        MockHttpSession operador = login(EMAIL_OPERADOR);
        UUID claveLlegada = UUID.randomUUID();
        assertThat(transicion(operador, cita, "REGISTRAR_LLEGADA", versionCita(cita), claveLlegada)).hasStatusOk();

        MvcTestResult linea = get(sesion, CITAS + "/" + cita + "/linea-tiempo");

        assertThat(linea).hasStatusOk().bodyJson().isStrictlyEqualTo("""
                [{"secuencia":1,"tipo":"CREADA","ocurridoEn":"2026-11-02T13:00:00Z","titulo":"Cita registrada",
                  "descripcion":"Tu cita fue registrada para el 04/11/2026 a las 09:00."},
                 {"secuencia":2,"tipo":"CONFIRMADA","ocurridoEn":"2026-11-02T13:00:00Z",
                  "titulo":"Asistencia confirmada",
                  "descripcion":"Confirmaste que asistirás. Esto no registra tu llegada."},
                 {"secuencia":3,"tipo":"PRE_CHECK_IN_COMPLETADO","ocurridoEn":"2026-11-02T14:00:00Z",
                  "titulo":"Pre-check-in completado",
                  "descripcion":"Confirmaste tus datos previos. Esto no registra tu llegada."},
                 {"secuencia":4,"tipo":"LLEGADA_REGISTRADA","ocurridoEn":"2026-11-04T13:30:00Z",
                  "titulo":"Llegada registrada","descripcion":"Se registró tu llegada a la sede."}]
                """);
        for (int i = 0; i < 4; i++) {
            Map<String, Object> evento = valor(linea, "$[" + i + "]");
            assertThat(evento).containsOnlyKeys("secuencia", "tipo", "ocurridoEn", "titulo", "descripcion");
        }
        assertThat(cuerpo(linea)).doesNotContain(USUARIO_A.toString(), USUARIO_OPERADOR.toString(),
                claveConfirmacion.toString(), claveLlegada.toString(), "OPERADOR", "SISTEMA", "actor",
                "operacion", "\"datos\"", "{\\\"", "visible", "versionAgenda");

        // La BD sí guarda los datos internos (actor y operación) que la API no expone.
        assertThat(tiposEvento(cita)).containsExactly("CREADA", "CONFIRMADA", "PRE_CHECK_IN_COMPLETADO",
                "LLEGADA_REGISTRADA");
        assertThat(contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = 'LLEGADA_REGISTRADA' "
                + "AND actor_usuario_id = ? AND operacion_id = ?", cita, USUARIO_OPERADOR, claveLlegada))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("Un alcance desconocido responde 400 VALIDACION")
    void alcanceInvalido() {
        MockHttpSession sesion = login(EMAIL_A);
        esperarError(get(sesion, CITAS + "?alcance=todas"), org.springframework.http.HttpStatus.BAD_REQUEST,
                "VALIDACION");
    }
}
