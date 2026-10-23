package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/** S1-R05 · Cerrar sesión invalida la sesión en el servidor. */
@DisplayName("S1-R05 · Cierre de sesión")
class CierreSesionIntegracionTest extends PruebaApi {

    @Test
    @DisplayName("Tras POST /auth/logout la misma sesión recibe 401 en las rutas protegidas y el cierre queda auditado")
    void logoutInvalidaLaSesion() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(get(sesion, CITAS)).hasStatusOk();

        MvcTestResult salida = mvc.post().uri("/api/v1/auth/logout").session(sesion).with(csrf()).exchange();

        assertThat(salida).hasStatus(HttpStatus.NO_CONTENT);
        assertThat(sesion.isInvalid()).isTrue();
        esperarError(get(sesion, CITAS), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        esperarError(get(sesion, CITAS + "/" + cita), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        esperarError(get(sesion, "/api/v1/auth/sesion"), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'LOGOUT' AND resultado = 'EXITO' "
                + "AND actor_usuario_id = ?", USUARIO_A)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una acción con la sesión cerrada no cambia la cita")
    void accionTrasLogout() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(mvc.post().uri("/api/v1/auth/logout").session(sesion).with(csrf()).exchange())
                .hasStatus(HttpStatus.NO_CONTENT);

        esperarError(confirmar(sesion, cita, 1), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(tiposEvento(cita)).containsExactly("CREADA");
        // Otra sesión del mismo usuario se abre sin problema.
        assertThat(get(login(EMAIL_A), CITAS)).hasStatusOk();
    }
}
