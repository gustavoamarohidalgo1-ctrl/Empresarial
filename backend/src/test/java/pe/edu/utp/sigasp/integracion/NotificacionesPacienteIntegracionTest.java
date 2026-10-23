package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.notificaciones.Notificaciones;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * v1.1 · Centro de notificaciones del paciente: solo las propias y enviadas, de la más reciente a la más
 * antigua, con títulos profesionales; marcar como leída es idempotente y verifica la propiedad.
 */
@DisplayName("v1.1 · Notificaciones del paciente")
class NotificacionesPacienteIntegracionTest extends PruebaApi {

    private static final String NOTIFICACIONES = "/api/v1/pacientes/me/notificaciones";
    /** Martes 03/11/2026 10:00 en Lima: dentro de las 24 h previas a MIERCOLES_9AM. */
    private static final Instant MARTES_10AM = Instant.parse("2026-11-03T15:00:00Z");

    @Autowired
    private Notificaciones notificaciones;

    private MockHttpSession sesionA;
    private UUID citaA;
    private UUID citaB;

    @BeforeEach
    void escenario() {
        citaA = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        citaB = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        sesionA = login(EMAIL_A);
        reloj.fijar(AHORA.plus(Duration.ofMinutes(10)));
        assertThat(confirmar(sesionA, citaA, 1)).hasStatusOk();
        esperarOyentes();
        // Ni las invalidadas ni las fallidas se muestran al paciente.
        notificacionManual(citaA, "RECORDATORIO", "24H-ANTERIOR", "INVALIDADA");
        notificacionManual(citaA, "CAMBIO", "FALLIDA", "FALLIDA");
    }

    private void notificacionManual(UUID cita, String tipo, String ventana, String estado) {
        jdbc.sql("INSERT INTO notificacion (id, cita_id, version_agenda, tipo, ventana, estado, canal, contenido, "
                        + "programada_para, creada_en) VALUES (?, ?, 1, ?, ?, ?, 'SIMULADO', 'No visible', ?, ?)")
                .params(UUID.randomUUID(), cita, tipo, ventana, estado, Timestamp.from(AHORA),
                        Timestamp.from(AHORA.plus(Duration.ofHours(1))))
                .update();
    }

    private MvcTestResult leer(MockHttpSession sesion, UUID notificacion) {
        return mvc.post().uri(NOTIFICACIONES + "/" + notificacion + "/lectura").session(sesion).with(csrf()).exchange();
    }

    private MvcTestResult leerTodas(MockHttpSession sesion) {
        return mvc.post().uri(NOTIFICACIONES + "/lectura").session(sesion).with(csrf()).exchange();
    }

    private long noLeidas(MockHttpSession sesion) {
        return numero(get(sesion, NOTIFICACIONES + "/no-leidas"), "$.total");
    }

    @Test
    @DisplayName("Lista solo las notificaciones enviadas de las citas propias, de la más reciente a la más antigua")
    void soloLasPropias() {
        MvcTestResult resultado = get(sesionA, NOTIFICACIONES);

        assertThat(resultado).hasStatusOk().bodyJson().isLenientlyEqualTo("""
                [{"tipo":"CAMBIO","titulo":"Asistencia confirmada","citaId":"%1$s","citaCodigo":"SP-2026-000001",
                  "creadaEn":"2026-11-02T13:10:00Z","leida":false},
                 {"tipo":"CAMBIO","titulo":"Reserva registrada","citaId":"%1$s","citaCodigo":"SP-2026-000001",
                  "creadaEn":"2026-11-02T13:00:00Z","leida":false}]""".formatted(citaA));
        assertThat((String) valor(resultado, "$[0].mensaje"))
                .startsWith("Confirmaste tu asistencia a la cita SP-2026-000001 de Medicina general");
        assertThat(cuerpo(resultado)).doesNotContain(citaB.toString(), "SP-2026-000002", "No visible", "Beto");
        assertThat(noLeidas(sesionA)).isEqualTo(2);
        assertThat((List<String>) valor(get(login(EMAIL_B), NOTIFICACIONES), "$[*].citaId"))
                .containsOnly(citaB.toString());
    }

    @Test
    @DisplayName("Los recordatorios aparecen con su título y el límite acota la lista (1 a 100)")
    void recordatoriosYLimite() {
        reloj.fijar(MARTES_10AM);
        // Solo la cita de A (09:00) entra en las 24 h; la de B (10:00) queda justo en el límite exclusivo.
        assertThat(notificaciones.generarRecordatorios()).isEqualTo(1);

        MvcTestResult uno = get(sesionA, NOTIFICACIONES + "?limite=1");

        assertThat(uno).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(1);
        assertThat((String) valor(uno, "$[0].titulo")).isEqualTo("Recordatorio de tu cita");
        assertThat((String) valor(uno, "$[0].mensaje"))
                .isEqualTo("Tienes la cita SP-2026-000001 de Medicina general mañana, miércoles 04/11/2026, a las "
                        + "09:00 en Sede de prueba, con Profesional P1. Te recomendamos llegar con anticipación y "
                        + "registrar tu llegada al ingresar.");
        assertThat(get(sesionA, NOTIFICACIONES)).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(3);
        esperarError(get(sesionA, NOTIFICACIONES + "?limite=0"), HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(get(sesionA, NOTIFICACIONES + "?limite=101"), HttpStatus.BAD_REQUEST, "VALIDACION");
    }

    @Test
    @DisplayName("Marcar una como leída responde 204, es idempotente y no cambia la fecha de lectura")
    void marcarUna() {
        UUID notificacion = UUID.fromString(valor(get(sesionA, NOTIFICACIONES), "$[0].id"));

        assertThat(leer(sesionA, notificacion)).hasStatus(HttpStatus.NO_CONTENT);
        Instant leidaEn = instante("SELECT leida_en FROM notificacion WHERE id = ?", notificacion);
        reloj.fijar(AHORA.plus(Duration.ofHours(2)));
        assertThat(leer(sesionA, notificacion)).hasStatus(HttpStatus.NO_CONTENT);

        assertThat(instante("SELECT leida_en FROM notificacion WHERE id = ?", notificacion))
                .isEqualTo(leidaEn).isEqualTo(AHORA.plus(Duration.ofMinutes(10)));
        assertThat(noLeidas(sesionA)).isEqualTo(1);
        assertThat(get(sesionA, NOTIFICACIONES)).bodyJson().extractingPath("$[0].leida").isEqualTo(true);
    }

    @Test
    @DisplayName("Una notificación ajena o inexistente responde 404 y la ajena queda auditada como acceso denegado")
    void ajenaOInexistente() {
        UUID deB = jdbc.sql("SELECT id FROM notificacion WHERE cita_id = ?").params(citaB).query(UUID.class).single();
        UUID invalidada = jdbc.sql("SELECT id FROM notificacion WHERE estado = 'INVALIDADA'").query(UUID.class)
                .single();

        esperarError(leer(sesionA, deB), HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
        esperarError(leer(sesionA, UUID.randomUUID()), HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
        esperarError(leer(sesionA, invalidada), HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");

        assertThat(instante("SELECT leida_en FROM notificacion WHERE id = ?", deB)).isNull();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'NOTIFICACION_ACCESO' "
                + "AND resultado = 'DENEGADO' AND actor_usuario_id = ? AND entidad_id = ?", USUARIO_A,
                deB.toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("Marcar todas responde 204, solo afecta a las propias y repetirlo no cambia nada")
    void marcarTodas() {
        MockHttpSession sesionB = login(EMAIL_B);

        assertThat(leerTodas(sesionA)).hasStatus(HttpStatus.NO_CONTENT);
        assertThat(leerTodas(sesionA)).hasStatus(HttpStatus.NO_CONTENT);

        assertThat(noLeidas(sesionA)).isZero();
        assertThat(noLeidas(sesionB)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM notificacion WHERE estado <> 'ENVIADA_SIMULADA' "
                + "AND leida_en IS NOT NULL")).as("las no visibles no se tocan").isZero();
    }

    @Test
    @DisplayName("Solo el rol paciente accede; marcar exige CSRF")
    void proteccion() {
        esperarError(get(login(EMAIL_OPERADOR), NOTIFICACIONES), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        esperarError(mvc.get().uri(NOTIFICACIONES).exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        esperarError(mvc.post().uri(NOTIFICACIONES + "/lectura").session(sesionA).exchange(), HttpStatus.FORBIDDEN,
                "CSRF_INVALIDO");
        assertThat(noLeidas(sesionA)).isEqualTo(2);
    }
}
