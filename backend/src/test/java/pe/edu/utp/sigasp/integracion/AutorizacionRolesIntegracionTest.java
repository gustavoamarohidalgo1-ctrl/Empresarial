package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_ADMIN;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_OPERADOR;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S1-R03 · Autorización por rol: rutas de operador y de desarrollo cerradas al paciente (403
 * auditado) y toda ruta protegida cerrada sin sesión (401).
 */
@DisplayName("S1-R03 · Autorización por rol")
class AutorizacionRolesIntegracionTest extends PruebaApi {

    private long denegadosRuta(String ruta, UUID actor) {
        return contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA' AND resultado = 'DENEGADO' "
                + "AND codigo = 'ACCESO_DENEGADO' AND detalle ->> 'ruta' = ? AND actor_usuario_id = ?", ruta, actor);
    }

    @Test
    @DisplayName("Un paciente que consulta el panel del operador recibe 403 ACCESO_DENEGADO y queda auditado")
    void pacienteEnPanelOperador() {
        escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult resultado = get(sesion, OPERADOR + "?fecha=2026-11-04");

        esperarError(resultado, HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        assertThat(cuerpo(resultado)).doesNotContain("SP-2026-000001", "pacienteNombre");
        assertThat(denegadosRuta("GET " + OPERADOR, USUARIO_A)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA' AND actor_rol = 'PACIENTE'"))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("Un paciente que intenta una transición de operador recibe 403 y la cita no cambia")
    void pacienteEnTransicionOperador() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_9AM.minusSeconds(600));
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult resultado = transicion(sesion, cita, "REGISTRAR_LLEGADA", versionCita(cita));

        esperarError(resultado, HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(tiposEvento(cita)).containsExactly("CREADA");
        assertThat(contar("SELECT count(*) FROM registro_llegada")).isZero();
        // La ruta (72 caracteres) excede auditoria.entidad_id: se recorta ahí y queda completa en el detalle.
        String ruta = "POST " + OPERADOR + "/" + cita + "/transiciones";
        assertThat(denegadosRuta(ruta, USUARIO_A)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA' AND entidad_id = ?",
                ruta.substring(0, 64))).isEqualTo(1);
    }

    @Test
    @DisplayName("Un paciente que llama a /api/v1/dev/** recibe 403, queda auditado y el reloj no cambia")
    void pacienteEnRutasDev() {
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult consulta = get(sesion, "/api/v1/dev/reloj");
        MvcTestResult cambio = mvc.put().uri("/api/v1/dev/reloj").session(sesion).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"ahora\":\"2030-01-01T00:00:00Z\"}")
                .exchange();

        esperarError(consulta, HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        esperarError(cambio, HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        assertThat(reloj.instant()).isEqualTo(AHORA);
        assertThat(denegadosRuta("GET /api/v1/dev/reloj", USUARIO_A)).isEqualTo(1);
        assertThat(denegadosRuta("PUT /api/v1/dev/reloj", USUARIO_A)).isEqualTo(1);
    }

    @Test
    @DisplayName("Un operador no entra a las rutas del paciente; el administrador sí consulta el reloj de desarrollo")
    void otrosRoles() {
        MockHttpSession operador = login(EMAIL_OPERADOR);
        esperarError(get(operador, CITAS), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        esperarError(get(operador, "/api/v1/dev/reloj"), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        assertThat(denegadosRuta("GET " + CITAS, USUARIO_OPERADOR)).isEqualTo(1);

        MockHttpSession admin = login(EMAIL_ADMIN);
        assertThat(get(admin, "/api/v1/dev/reloj")).hasStatusOk()
                .bodyJson().extractingPath("$.simulado").isEqualTo(true);
        esperarError(get(admin, CITAS), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
    }

    @Test
    @DisplayName("Sin sesión, las rutas protegidas responden 401 NO_AUTENTICADO")
    void sinSesion() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);

        for (String ruta : new String[] {CITAS, CITAS + "/" + cita, OPERADOR, "/api/v1/dev/reloj",
                "/api/v1/pacientes/me/perfil", "/api/v1/catalogos/motivos?tipo=CANCELACION",
                "/api/v1/operaciones/" + UUID.randomUUID(), "/api/v1/auth/sesion"}) {
            MvcTestResult resultado = mvc.get().uri(ruta).exchange();
            esperarError(resultado, HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
            assertThat(cuerpo(resultado)).as(ruta).doesNotContain("SP-2026-000001");
        }
    }
}
