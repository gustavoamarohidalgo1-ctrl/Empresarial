package pe.edu.utp.sigasp.compartido.web;

import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Function;

import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Caché HTTP del build de Angular ({@code outputHashing: all}) servido desde classpath:/static.
 * <ul>
 *   <li><b>Archivos con hash</b> en el nombre: {@code public, max-age=31536000, immutable}. Un
 *       cambio de contenido cambia el nombre, así que nunca hace falta revalidarlos.</li>
 *   <li><b>Todo lo demás</b> ({@code index.html}, {@code favicon.ico}, archivos de public/):
 *       {@code no-cache} con un ETag débil calculado del contenido. El navegador revalida en cada
 *       visita y recibe 304 si no cambió.</li>
 * </ul>
 * No se usa {@code Last-Modified}: el jar de Spring Boot fija la fecha de todas sus entradas
 * (1980-02-01, build reproducible), así que tras un despliegue un {@code If-Modified-Since}
 * respondería 304 con un {@code index.html} viejo que apunta a bundles que ya no existen. El ETag
 * es débil ({@code W/}) porque Tomcat no comprime las respuestas con ETag fuerte.
 * <p>
 * Se registra antes que la configuración de Spring Boot, que entonces no agrega su propio
 * manejador {@code /**}. Los patrones con hash son más específicos que {@code /**} y tienen
 * prioridad. Un archivo inexistente responde 404 sin cabeceras de caché.
 */
@Configuration(proxyBeanMethods = false)
@Order(Ordered.HIGHEST_PRECEDENCE)
class RecursosWebConfig implements WebMvcConfigurer {

    static final String UBICACION = "classpath:/static/";

    /** Bundles de la raíz del build ({@code [nombre]-[hash].[ext]}). */
    static final String[] ARCHIVOS_CON_HASH = {"/main-*.js", "/chunk-*.js", "/polyfills-*.js", "/scripts-*.js",
        "/worker-*.js", "/styles-*.css"};
    /** Fuentes e imágenes referenciadas desde el CSS: Angular las copia a media/ con hash. */
    static final String MEDIOS_CON_HASH = "/media/**";

    static final CacheControl INMUTABLE = CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable();
    static final CacheControl REVALIDAR = CacheControl.noCache();

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registro) {
        registro.addResourceHandler(ARCHIVOS_CON_HASH)
                .addResourceLocations(UBICACION)
                .setCacheControl(INMUTABLE)
                .setUseLastModified(false);
        // Con "/**" la ruta relativa es solo la parte comodín: la ubicación es la carpeta media/.
        registro.addResourceHandler(MEDIOS_CON_HASH)
                .addResourceLocations(UBICACION + "media/")
                .setCacheControl(INMUTABLE)
                .setUseLastModified(false);
        registro.addResourceHandler("/**")
                .addResourceLocations(UBICACION)
                .setCacheControl(REVALIDAR)
                .setUseLastModified(false)
                .setEtagGenerator(new EtagPorContenido());
    }

    /**
     * ETag débil a partir del SHA-256 del contenido. Se calcula una vez por archivo (los recursos
     * del jar no cambian mientras corre el proceso; en disco, la clave incluye fecha y tamaño).
     */
    static final class EtagPorContenido implements Function<Resource, String> {

        private final Map<String, String> calculados = new ConcurrentHashMap<>();

        @Override
        public String apply(Resource recurso) {
            try {
                String clave = recurso.getURL().toExternalForm() + '|' + recurso.lastModified() + '|'
                        + recurso.contentLength();
                return calculados.computeIfAbsent(clave, c -> calcular(recurso));
            } catch (IOException | IllegalStateException ex) {
                return null; // sin ETag: el navegador descarga el archivo completo
            }
        }

        private static String calcular(Resource recurso) {
            try (InputStream entrada = recurso.getInputStream()) {
                MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
                byte[] bloque = new byte[8192];
                for (int leidos; (leidos = entrada.read(bloque)) != -1;) {
                    sha256.update(bloque, 0, leidos);
                }
                return "W/\"" + Base64.getUrlEncoder().withoutPadding().encodeToString(sha256.digest()) + "\"";
            } catch (IOException ex) {
                throw new IllegalStateException(ex);
            } catch (NoSuchAlgorithmException ex) {
                throw new IllegalStateException("SHA-256 no disponible", ex);
            }
        }
    }
}
