package pe.edu.utp.sigasp.compartido.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;

@DisplayName("RutasWeb · clasificación de rutas fuera de la API")
class RutasWebTest {

    private static final String NAVEGADOR = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";

    private static MockHttpServletRequest solicitud(String metodo, String ruta, String accept) {
        MockHttpServletRequest request = new MockHttpServletRequest(metodo, ruta);
        if (accept != null) {
            request.addHeader("Accept", accept);
        }
        return request;
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"/", "/login", "/inicio", "/acceso-denegado", "/paciente/citas",
        "/paciente/citas/2f6c1c3e-5d0a-4b1e-9a51-3c1f0e2d7b10", "/operador", "/cualquier/otra"})
    @DisplayName("Navegaciones del SPA: GET sin extensión que acepta text/html")
    void navegaciones(String ruta) {
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", ruta, NAVEGADOR))).isTrue();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("HEAD", ruta, "text/html"))).isTrue();
        assertThat(RutasWeb.esRecursoEstatico(solicitud("GET", ruta, NAVEGADOR))).isFalse();
    }

    @ParameterizedTest(name = "{0}")
    @ValueSource(strings = {"/api", "/api/v1/pacientes/me/citas", "/actuator/health", "/v3/api-docs",
        "/swagger-ui/index.html", "/swagger-ui.html", "/webjars/x/y.js", "/error"})
    @DisplayName("API, actuator, documentación y /error nunca son del SPA")
    void reservadas(String ruta) {
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", ruta, NAVEGADOR))).isFalse();
        assertThat(RutasWeb.esRecursoEstatico(solicitud("GET", ruta, NAVEGADOR))).isFalse();
    }

    @Test
    @DisplayName("Sin text/html explícito, o con otro método, no es navegación")
    void noNavegaciones() {
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", "/login", null))).isFalse();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", "/login", "*/*"))).isFalse();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", "/login", "application/json, text/plain, */*"))).isFalse();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", "/login", "text/html;q=0"))).isFalse();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", "/login", "no es un accept válido;;"))).isFalse();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("POST", "/login", NAVEGADOR))).isFalse();
        assertThat(RutasWeb.esNavegacionSpa(solicitud("GET", "/main-ABC.js", NAVEGADOR))).isFalse();
    }

    @Test
    @DisplayName("Recursos estáticos: GET o HEAD de un archivo con extensión web conocida")
    void estaticos() {
        for (String ruta : new String[] {"/index.html", "/main-ABC.js", "/chunk-X1.js", "/styles-Q.css",
            "/favicon.ico", "/media/inter-latin-HASH.woff2", "/icons/logo.svg", "/manifest.webmanifest"}) {
            assertThat(RutasWeb.esRecursoEstatico(solicitud("GET", ruta, null))).as(ruta).isTrue();
        }
        assertThat(RutasWeb.esRecursoEstatico(solicitud("HEAD", "/main-ABC.js", null))).isTrue();
        assertThat(RutasWeb.esRecursoEstatico(solicitud("POST", "/main-ABC.js", null))).isFalse();
        assertThat(RutasWeb.esRecursoEstatico(solicitud("GET", "/config.php", null))).isFalse();
        assertThat(RutasWeb.esRecursoEstatico(solicitud("GET", "/.env", null))).isFalse();
        assertThat(RutasWeb.esRecursoEstatico(solicitud("GET", "/api/v1/datos.json", null))).isFalse();
    }

    @Test
    @DisplayName("Respeta el context path del servlet")
    void contextPath() {
        MockHttpServletRequest request = solicitud("GET", "/siga/api/v1/auth/csrf", NAVEGADOR);
        request.setContextPath("/siga");
        assertThat(RutasWeb.esNavegacionSpa(request)).isFalse();

        MockHttpServletRequest navegacion = solicitud("GET", "/siga/paciente/citas", NAVEGADOR);
        navegacion.setContextPath("/siga");
        assertThat(RutasWeb.esNavegacionSpa(navegacion)).isTrue();
    }
}
