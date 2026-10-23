package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.integracion.SpaRecursosEstaticosIntegracionTest.CSP_INDICE;
import static pe.edu.utp.sigasp.integracion.SpaRecursosEstaticosIntegracionTest.INMUTABLE;
import static pe.edu.utp.sigasp.integracion.SpaRecursosEstaticosIntegracionTest.NAVEGADOR;
import static pe.edu.utp.sigasp.integracion.SpaRecursosEstaticosIntegracionTest.directivas;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.zip.GZIPInputStream;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;

import pe.edu.utp.sigasp.soporte.PruebaIntegracion;

/**
 * El jar único sobre Tomcat real (puerto aleatorio): reenvío completo de una ruta del SPA a
 * {@code index.html}, compresión gzip y cabeceras de caché y CSP que sobreviven a la compresión.
 * MockMvc no comprime ni ejecuta reenvíos, por eso esta clase usa HTTP de verdad.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT)
@DisplayName("Jar único · Tomcat real: reenvío del SPA y compresión gzip")
class ServidorWebIntegracionTest extends PruebaIntegracion {

    private final HttpClient http = HttpClient.newBuilder().followRedirects(HttpClient.Redirect.NEVER).build();

    @LocalServerPort
    private int puerto;

    private HttpResponse<byte[]> pedir(String ruta, String accept, boolean gzip, String... cabeceras) {
        HttpRequest.Builder solicitud = HttpRequest.newBuilder(URI.create("http://localhost:" + puerto + ruta)).GET();
        if (cabeceras.length > 0) {
            solicitud.headers(cabeceras);
        }
        if (accept != null) {
            solicitud.header("Accept", accept);
        }
        if (gzip) {
            solicitud.header("Accept-Encoding", "gzip");
        }
        return enviar(solicitud.build());
    }

    private HttpResponse<byte[]> enviar(HttpRequest solicitud) {
        try {
            return http.send(solicitud, HttpResponse.BodyHandlers.ofByteArray());
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException(ex);
        }
    }

    private static String cabecera(HttpResponse<?> respuesta, String nombre) {
        return respuesta.headers().firstValue(nombre).orElse(null);
    }

    /** Cuerpo de la respuesta, descomprimido si llegó en gzip. */
    private static String texto(HttpResponse<byte[]> respuesta) {
        boolean comprimida = "gzip".equalsIgnoreCase(cabecera(respuesta, "Content-Encoding"));
        try (InputStream entrada = comprimida
                ? new GZIPInputStream(new ByteArrayInputStream(respuesta.body()))
                : new ByteArrayInputStream(respuesta.body())) {
            return new String(entrada.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    private static String archivo(String ruta) {
        try (InputStream entrada = new ClassPathResource("static" + ruta).getInputStream()) {
            return new String(entrada.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException(ex);
        }
    }

    @Test
    @DisplayName("Recargar /paciente/citas/{id} devuelve index.html comprimido, con no-cache, CSP y cabeceras de seguridad")
    void navegacionCompleta() {
        HttpResponse<byte[]> respuesta = pedir("/paciente/citas/2f6c1c3e-5d0a-4b1e-9a51-3c1f0e2d7b10", NAVEGADOR, true);

        assertThat(respuesta.statusCode()).isEqualTo(200);
        assertThat(cabecera(respuesta, "Content-Type")).startsWith("text/html");
        assertThat(cabecera(respuesta, "Content-Encoding")).isEqualTo("gzip");
        assertThat(texto(respuesta)).isEqualTo(archivo("/index.html"));
        assertThat(directivas(cabecera(respuesta, "Cache-Control"))).containsExactly("no-cache");
        assertThat(cabecera(respuesta, "Vary")).containsIgnoringCase("accept-encoding");
        assertThat(cabecera(respuesta, "Content-Security-Policy")).isEqualTo(CSP_INDICE);
        assertThat(cabecera(respuesta, "X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(cabecera(respuesta, "X-Frame-Options")).isEqualTo("DENY");
        assertThat(cabecera(respuesta, "Referrer-Policy")).isEqualTo("no-referrer");
        assertThat(cabecera(respuesta, "Cross-Origin-Opener-Policy")).isEqualTo("same-origin");
        assertThat(cabecera(respuesta, "Permissions-Policy")).contains("camera=()");
        assertThat(cabecera(respuesta, "ETag")).startsWith("W/\"");
    }

    @Test
    @DisplayName("HEAD a una ruta del SPA: mismas cabeceras que el GET (CSP incluida) y sin cuerpo")
    void headConCabeceras() {
        HttpResponse<byte[]> respuesta = enviar(HttpRequest.newBuilder(URI.create("http://localhost:" + puerto
                + "/inicio")).method("HEAD", HttpRequest.BodyPublishers.noBody()).header("Accept", NAVEGADOR).build());

        assertThat(respuesta.statusCode()).isEqualTo(200);
        assertThat(respuesta.body()).isEmpty();
        assertThat(cabecera(respuesta, "Content-Type")).startsWith("text/html");
        assertThat(cabecera(respuesta, "Content-Security-Policy")).isEqualTo(CSP_INDICE);
        assertThat(cabecera(respuesta, "X-Frame-Options")).isEqualTo("DENY");
        assertThat(directivas(cabecera(respuesta, "Cache-Control"))).containsExactly("no-cache");
    }

    @Test
    @DisplayName("Revalidar una ruta del SPA con su ETag responde 304 (el ETag débil no impide el gzip)")
    void revalidacionConEtag() {
        String etag = cabecera(pedir("/operador", NAVEGADOR, true), "ETag");

        HttpResponse<byte[]> respuesta = pedir("/operador", NAVEGADOR, true, "If-None-Match", etag);

        assertThat(respuesta.statusCode()).isEqualTo(304);
        assertThat(respuesta.body()).isEmpty();
        assertThat(cabecera(respuesta, "ETag")).isEqualTo(etag);
    }

    @Test
    @DisplayName("JS y CSS con hash llegan en gzip sin perder Cache-Control inmutable")
    void gzipConservaCacheInmutable() {
        for (String ruta : new String[] {"/main-PRUEBA01.js", "/chunk-PRUEBA02.js", "/styles-PRUEBA04.css"}) {
            HttpResponse<byte[]> respuesta = pedir(ruta, "*/*", true);

            assertThat(respuesta.statusCode()).as(ruta).isEqualTo(200);
            assertThat(cabecera(respuesta, "Content-Encoding")).as(ruta).isEqualTo("gzip");
            assertThat(directivas(cabecera(respuesta, "Cache-Control"))).as(ruta).isEqualTo(INMUTABLE);
            assertThat(cabecera(respuesta, "Vary")).as(ruta).containsIgnoringCase("accept-encoding");
            assertThat(cabecera(respuesta, "Content-Security-Policy")).as(ruta).isNull();
            assertThat(respuesta.body().length).as(ruta).isLessThan(archivo(ruta).length());
            assertThat(texto(respuesta)).as(ruta).isEqualTo(archivo(ruta));
        }
    }

    @Test
    @DisplayName("Sin Accept-Encoding: gzip la respuesta va sin comprimir y con su Content-Length")
    void sinGzipSiElClienteNoLoAcepta() {
        HttpResponse<byte[]> respuesta = pedir("/main-PRUEBA01.js", "*/*", false);

        assertThat(respuesta.statusCode()).isEqualTo(200);
        assertThat(cabecera(respuesta, "Content-Encoding")).isNull();
        assertThat(cabecera(respuesta, "Content-Length")).isEqualTo(String.valueOf(archivo("/main-PRUEBA01.js").length()));
        assertThat(directivas(cabecera(respuesta, "Cache-Control"))).isEqualTo(INMUTABLE);
    }

    @Test
    @DisplayName("Las fuentes woff2 (ya comprimidas) y los archivos menores de 1 KB no se recomprimen")
    void sinRecomprimir() {
        HttpResponse<byte[]> fuente = pedir("/media/fuente-PRUEBA05.woff2", "*/*", true);
        HttpResponse<byte[]> pequeno = pedir("/polyfills-PRUEBA03.js", "*/*", true);

        assertThat(fuente.statusCode()).isEqualTo(200);
        assertThat(cabecera(fuente, "Content-Encoding")).isNull();
        assertThat(directivas(cabecera(fuente, "Cache-Control"))).isEqualTo(INMUTABLE);
        assertThat(pequeno.statusCode()).isEqualTo(200);
        assertThat(cabecera(pequeno, "Content-Encoding")).isNull();
    }

    @Test
    @DisplayName("Un error de la API no se reenvía al SPA aunque el navegador acepte HTML")
    void apiSinReenvio() {
        HttpResponse<byte[]> respuesta = pedir("/api/v1/pacientes/me/citas", NAVEGADOR, true);

        assertThat(respuesta.statusCode()).isEqualTo(401);
        assertThat(cabecera(respuesta, "Content-Type")).startsWith("application/problem+json");
        assertThat(texto(respuesta)).contains("NO_AUTENTICADO").doesNotContain("index-spa-de-prueba");
        assertThat(cabecera(respuesta, "Content-Security-Policy")).isNull();
        assertThat(directivas(cabecera(respuesta, "Cache-Control"))).contains("no-store");
    }
}
