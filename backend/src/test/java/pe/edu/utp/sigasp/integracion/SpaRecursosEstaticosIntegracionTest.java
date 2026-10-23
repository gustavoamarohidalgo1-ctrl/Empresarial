package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;

import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import java.util.stream.Collectors;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Jar único: el backend sirve el SPA. Rutas de navegación reenviadas a {@code index.html}, archivos
 * del build públicos con su caché, CSP solo en HTML y caché de la API. Usa el build de prueba de
 * {@code src/test/resources/static} (no se empaqueta). El gzip y el reenvío completo por Tomcat se
 * prueban en {@link ServidorWebIntegracionTest}.
 */
@DisplayName("Jar único · SPA, recursos estáticos, caché y CSP")
class SpaRecursosEstaticosIntegracionTest extends PruebaApi {

    /** Accept que envía un navegador al abrir o recargar una página. */
    static final String NAVEGADOR = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,"
            + "image/webp,*/*;q=0.8";

    /** CSP esperada para el index.html de prueba: la base más el hash de su único script en línea ejecutable. */
    static final String CSP_INDICE = "default-src 'self'; "
            + "script-src 'self' 'sha256-LMY6wYoFV9I4wWzxaq1N/dTpl4iurQktw706UCHK3vM='; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
            + "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

    static final Set<String> INMUTABLE = Set.of("public", "max-age=31536000", "immutable");

    private MvcTestResult navegar(String ruta) {
        return mvc.get().uri(ruta).header("Accept", NAVEGADOR).exchange();
    }

    private MvcTestResult anonimo(String ruta) {
        return mvc.get().uri(ruta).exchange();
    }

    /** Directivas de Cache-Control, sin importar el orden ni las mayúsculas. */
    static Set<String> directivas(String cacheControl) {
        return cacheControl == null ? Set.of()
                : Arrays.stream(cacheControl.split(",")).map(d -> d.trim().toLowerCase(Locale.ROOT))
                        .collect(Collectors.toSet());
    }

    private static Set<String> cache(MvcTestResult resultado) {
        return directivas(resultado.getResponse().getHeader("Cache-Control"));
    }

    @Nested
    @DisplayName("Respaldo del SPA")
    class Respaldo {

        @ParameterizedTest(name = "GET {0} (navegador) → index.html")
        @ValueSource(strings = {"/", "/login", "/inicio", "/acceso-denegado", "/paciente/citas",
            "/paciente/citas/2f6c1c3e-5d0a-4b1e-9a51-3c1f0e2d7b10/reprogramar", "/operador",
            "/una/ruta/que/angular/resuelve"})
        @DisplayName("Una navegación anónima a una ruta del SPA se reenvía a /index.html")
        void navegacionReenviada(String ruta) {
            assertThat(navegar(ruta)).hasStatusOk().hasForwardedUrl("/index.html");
        }

        @Test
        @DisplayName("La API no se reenvía: GET /api/... con Accept text/html sigue respondiendo 401 en JSON")
        void apiNoSeReenvia() {
            MvcTestResult resultado = navegar(CITAS);

            esperarError(resultado, HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
            assertThat(resultado.getResponse().getForwardedUrl()).isNull();
            assertThat(resultado.getResponse().getContentType()).startsWith("application/problem+json");
        }

        @Test
        @DisplayName("El actuator no se reenvía: /actuator/health responde su JSON")
        void actuatorNoSeReenvia() {
            MvcTestResult resultado = mvc.get().uri("/actuator/health").header("Accept", NAVEGADOR).exchange();

            assertThat(resultado).hasStatusOk();
            assertThat(resultado.getResponse().getForwardedUrl()).isNull();
            assertThat(cuerpo(resultado)).contains("\"status\"");
        }

        @Test
        @DisplayName("Sin text/html explícito (fetch, curl, JSON) una ruta del SPA no se reenvía y se deniega")
        void sinTextHtmlNoSeReenvia() {
            for (String accept : new String[] {"application/json", "*/*", "text/html;q=0"}) {
                MvcTestResult resultado = mvc.get().uri("/paciente/citas").header("Accept", accept).exchange();
                assertThat(resultado).as(accept).hasStatus(HttpStatus.UNAUTHORIZED);
                assertThat(resultado.getResponse().getForwardedUrl()).as(accept).isNull();
            }
            assertThat(anonimo("/paciente/citas")).hasStatus(HttpStatus.UNAUTHORIZED);
        }

        @Test
        @DisplayName("Solo GET y HEAD: un POST a una ruta del SPA se deniega sin reenviar")
        void postNoSeReenvia() {
            MvcTestResult resultado = mvc.post().uri("/login").with(csrf()).header("Accept", NAVEGADOR).exchange();

            esperarError(resultado, HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
            assertThat(resultado.getResponse().getForwardedUrl()).isNull();
        }
    }

    @Nested
    @DisplayName("Recursos estáticos")
    class Estaticos {

        @Test
        @DisplayName("Los archivos con hash del build son públicos e inmutables por un año")
        void conHashInmutables() {
            for (String ruta : new String[] {"/main-PRUEBA01.js", "/chunk-PRUEBA02.js", "/polyfills-PRUEBA03.js",
                "/styles-PRUEBA04.css", "/media/fuente-PRUEBA05.woff2"}) {
                MvcTestResult resultado = anonimo(ruta);
                assertThat(resultado).as(ruta).hasStatusOk();
                assertThat(cache(resultado)).as(ruta).isEqualTo(INMUTABLE);
                assertThat(resultado.getResponse().getHeader("Pragma")).as(ruta).isNull();
                assertThat(resultado.getResponse().getHeader("Last-Modified")).as(ruta).isNull();
            }
            MvcTestResult main = anonimo("/main-PRUEBA01.js");
            assertThat(main.getResponse().getContentType()).startsWith("text/javascript");
            assertThat(cuerpo(main)).contains("main-de-prueba");
            assertThat(anonimo("/styles-PRUEBA04.css").getResponse().getContentType()).startsWith("text/css");
        }

        @Test
        @DisplayName("index.html y los archivos sin hash (favicon) se revalidan siempre: no-cache")
        void sinHashNoCache() {
            MvcTestResult indice = anonimo("/index.html");
            assertThat(indice).hasStatusOk();
            assertThat(indice.getResponse().getContentType()).startsWith("text/html");
            assertThat(cuerpo(indice)).contains("index-spa-de-prueba");
            assertThat(cache(indice)).containsExactly("no-cache");

            MvcTestResult favicon = anonimo("/favicon.ico");
            assertThat(favicon).hasStatusOk();
            assertThat(cache(favicon)).containsExactly("no-cache");
        }

        @Test
        @DisplayName("index.html se revalida con un ETag débil del contenido: si no cambió responde 304 sin cuerpo")
        void indiceRevalidable() {
            MvcTestResult primera = anonimo("/index.html");
            String etag = primera.getResponse().getHeader("ETag");
            assertThat(etag).startsWith("W/\"");
            assertThat(anonimo("/favicon.ico").getResponse().getHeader("ETag")).startsWith("W/\"").isNotEqualTo(etag);
            // El jar fija la fecha de todas sus entradas: Last-Modified no sirve para revalidar.
            assertThat(primera.getResponse().getHeader("Last-Modified")).isNull();

            MvcTestResult revalidacion = mvc.get().uri("/index.html").header("If-None-Match", etag).exchange();
            MvcTestResult otraVersion = mvc.get().uri("/index.html").header("If-None-Match", "W/\"otra-version\"")
                    .exchange();

            assertThat(revalidacion).hasStatus(HttpStatus.NOT_MODIFIED);
            assertThat(cuerpo(revalidacion)).isEmpty();
            assertThat(otraVersion).hasStatusOk();
            assertThat(cuerpo(otraVersion)).contains("index-spa-de-prueba");
        }

        @Test
        @DisplayName("Un archivo con hash inexistente responde 404 en JSON y sin caché inmutable")
        void inexistente() {
            MvcTestResult resultado = anonimo("/chunk-NOEXISTE.js");

            esperarError(resultado, HttpStatus.NOT_FOUND, "RECURSO_NO_ENCONTRADO");
            assertThat(cache(resultado)).contains("no-store").doesNotContain("immutable");
        }

        @Test
        @DisplayName("Fuera del build todo sigue denegado: extensiones ajenas, webjars y métodos de escritura")
        void restoDenegado() {
            assertThat(anonimo("/config.php")).hasStatus(HttpStatus.UNAUTHORIZED);
            assertThat(anonimo("/webjars/swagger-ui/index.html")).hasStatus(HttpStatus.UNAUTHORIZED);
            assertThat(mvc.delete().uri("/main-PRUEBA01.js").with(csrf()).exchange())
                    .hasStatus(HttpStatus.UNAUTHORIZED);
        }
    }

    @Nested
    @DisplayName("Cabeceras de seguridad")
    class Cabeceras {

        @Test
        @DisplayName("El HTML lleva la CSP estricta (con el hash del script en línea del build)")
        void cspEnHtml() {
            MvcTestResult indice = anonimo("/index.html");

            assertThat(indice.getResponse().getHeader("Content-Security-Policy")).isEqualTo(CSP_INDICE);
            assertThat(indice.getResponse().getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
            assertThat(indice.getResponse().getHeader("X-Frame-Options")).isEqualTo("DENY");
        }

        @Test
        @DisplayName("JS, CSS y JSON de la API no llevan CSP")
        void sinCspFueraDeHtml() {
            assertThat(anonimo("/main-PRUEBA01.js").getResponse().getHeader("Content-Security-Policy")).isNull();
            assertThat(anonimo("/styles-PRUEBA04.css").getResponse().getHeader("Content-Security-Policy")).isNull();
            MvcTestResult api = anonimo("/api/v1/auth/csrf");
            assertThat(api).hasStatusOk();
            assertThat(api.getResponse().getHeader("Content-Security-Policy")).isNull();
        }

        @Test
        @DisplayName("Permissions-Policy mínima y Cross-Origin-Opener-Policy same-origin en todas las respuestas")
        void permissionsPolicyYCoop() {
            for (MvcTestResult resultado : new MvcTestResult[] {anonimo("/index.html"), anonimo("/main-PRUEBA01.js"),
                anonimo("/api/v1/auth/csrf"), anonimo(CITAS)}) {
                assertThat(resultado.getResponse().getHeader("Cross-Origin-Opener-Policy")).isEqualTo("same-origin");
                assertThat(resultado.getResponse().getHeader("Permissions-Policy"))
                        .contains("camera=()", "microphone=()", "geolocation=()", "payment=()");
            }
        }
    }

    @Nested
    @DisplayName("Caché de la API")
    class CacheApi {

        @Test
        @DisplayName("Las respuestas de la API no se cachean (no-store)")
        void apiNoSeCachea() {
            MockHttpSession sesion = login(EMAIL_A);

            MvcTestResult citas = get(sesion, CITAS);

            assertThat(citas).hasStatusOk();
            assertThat(cache(citas)).contains("no-store", "no-cache");
            assertThat(cache(anonimo(CITAS))).contains("no-store");
        }

        @Test
        @DisplayName("GET /catalogos/motivos se guarda 5 minutos solo en el navegador (private, max-age=300)")
        void motivosCacheables() {
            MockHttpSession sesion = login(EMAIL_A);

            MvcTestResult motivos = get(sesion, "/api/v1/catalogos/motivos?tipo=CANCELACION");

            assertThat(motivos).hasStatusOk().bodyJson().extractingPath("$[0].codigo").isNotNull();
            assertThat(cache(motivos)).isEqualTo(Set.of("private", "max-age=300"));
            assertThat(motivos.getResponse().getHeader("Pragma")).isNull();
            assertThat(motivos.getResponse().getHeader("Content-Security-Policy")).isNull();
        }
    }
}
