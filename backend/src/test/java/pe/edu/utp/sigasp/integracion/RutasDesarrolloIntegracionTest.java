package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_ADMIN;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Rutas {@code /api/v1/dev/**}: las que no están habilitadas no existen (404 a todos, como cualquier ruta
 * inexistente), antes de CSRF y de la autorización. En las pruebas el reloj es ajustable
 * ({@code sigasp.reloj.ajustable=true}), pero el buzón de correos está apagado, como en producción.
 */
@DisplayName("v1.1 · Rutas de desarrollo no habilitadas")
class RutasDesarrolloIntegracionTest extends PruebaApi {

    @Test
    @DisplayName("Sin el buzón de desarrollo, /dev/correos y cualquier otra ruta /dev responden 404 a anónimos y a todos los roles")
    void rutasNoHabilitadas() {
        List<MockHttpSession> sesiones = List.of(new MockHttpSession(), login(EMAIL_A), login(EMAIL_ADMIN));
        for (MockHttpSession sesion : sesiones) {
            for (String ruta : List.of("/api/v1/dev/correos", "/api/v1/dev/otra", "/api/v1/dev", "/api/v1/dev/")) {
                MvcTestResult consulta = mvc.get().uri(ruta).session(sesion).exchange();
                esperarError(consulta, HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
                assertThat(cuerpo(consulta)).as(ruta).doesNotContain("Inicia sesión");
            }
            // Cualquier método, con o sin token CSRF: no se distinguen de una ruta inexistente.
            esperarError(mvc.post().uri("/api/v1/dev/correos").session(sesion).contentType(MediaType.APPLICATION_JSON)
                    .content("{}").exchange(), HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
            esperarError(mvc.delete().uri("/api/v1/dev/correos").session(sesion).with(csrf()).exchange(),
                    HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
        }
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA'"))
                .as("una ruta inexistente no es un acceso denegado").isZero();
    }

    @Test
    @DisplayName("Con el reloj ajustable, /dev/reloj sigue existiendo: 401 sin sesión y 200 para el administrador")
    void relojHabilitado() {
        esperarError(mvc.get().uri("/api/v1/dev/reloj").exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        assertThat(get(login(EMAIL_ADMIN), "/api/v1/dev/reloj")).hasStatusOk()
                .bodyJson().extractingPath("$.simulado").isEqualTo(true);
        esperarError(get(login(EMAIL_ADMIN), "/api/v1/dev/reloj/extra"), HttpStatus.NOT_FOUND,
                "RECURSO_NO_ENCONTRADO");
    }
}
