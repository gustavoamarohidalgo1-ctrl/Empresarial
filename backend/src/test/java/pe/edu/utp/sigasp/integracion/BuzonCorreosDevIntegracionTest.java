package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.Origenes.desde;
import static pe.edu.utp.sigasp.soporte.Origenes.nuevaIp;

import java.time.Duration;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.CuentasPrueba;
import pe.edu.utp.sigasp.soporte.CuentasPrueba.Cuenta;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * v1.1 · Buzón del correo simulado: solo con {@code sigasp.dev.buzon-correos=true} (perfil dev), sin sesión. Solo en
 * esta configuración {@code correo_simulado} guarda el mensaje completo (destinatario, cuerpo y enlace).
 */
@TestPropertySource(properties = "sigasp.dev.buzon-correos=true")
@DisplayName("v1.1 · Buzón de correos de desarrollo")
class BuzonCorreosDevIntegracionTest extends PruebaApi {

    @Autowired
    private CuentasPrueba cuentas;

    private void solicitar(String email) {
        assertThat(mvc.post().uri("/api/v1/auth/recuperacion").with(csrf()).with(desde(nuevaIp()))
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}").exchange())
                .hasStatus(HttpStatus.ACCEPTED);
    }

    @Test
    @DisplayName("GET /dev/correos es público en dev: lista los correos simulados del más reciente al más antiguo")
    void buzonPublicoEnDesarrollo() {
        Cuenta primera = cuentas.paciente("Rosa");
        Cuenta segunda = cuentas.paciente("Diego");
        solicitar(primera.email());
        reloj.fijar(AHORA.plus(Duration.ofMinutes(1)));
        solicitar(segunda.email());

        MvcTestResult buzon = mvc.get().uri("/api/v1/dev/correos").exchange();

        assertThat(buzon).hasStatusOk();
        assertThat(buzon.getResponse().getHeader("Cache-Control")).contains("no-store");
        assertThat((List<String>) valor(buzon, "$[*].destinatario"))
                .containsExactly(segunda.email(), primera.email());
        assertThat((String) valor(buzon, "$[0].asunto")).isEqualTo("Restablece tu contraseña de SIGA-SP");
        assertThat((String) valor(buzon, "$[0].enlace")).startsWith("/restablecer?token=");
        assertThat((String) valor(buzon, "$[0].cuerpo")).startsWith("Hola, Diego:");
        assertThat((String) valor(buzon, "$[0].enviadoEn")).isEqualTo("2026-11-02T13:01:00Z");
        // Las demás rutas /dev no habilitadas tampoco existen en desarrollo.
        esperarError(mvc.get().uri("/api/v1/dev/otra").exchange(), HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
    }
}
