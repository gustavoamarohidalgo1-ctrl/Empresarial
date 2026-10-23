package pe.edu.utp.sigasp.compartido.web;

import java.util.List;
import java.util.Locale;
import java.util.Set;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.http.InvalidMediaTypeException;
import org.springframework.http.MediaType;

/**
 * Clasifica las solicitudes que no son de la API cuando Spring Boot sirve el SPA (jar único).
 * <ul>
 *   <li><b>Recurso estático</b>: GET/HEAD de un archivo del build (con extensión web conocida).</li>
 *   <li><b>Navegación del SPA</b>: GET/HEAD sin extensión que acepta {@code text/html} de forma
 *       explícita (lo que envía el navegador al abrir o recargar {@code /paciente/citas/...}).
 *       Se responde con {@code index.html} y el enrutador de Angular resuelve la vista.</li>
 * </ul>
 * La API, el actuator y la documentación nunca entran en estas categorías: conservan sus reglas.
 */
public final class RutasWeb {

    /** Documento de entrada del SPA dentro de classpath:/static. */
    public static final String INDICE = "/index.html";
    public static final String UBICACION_INDICE = "classpath:/static/index.html";

    private static final List<String> PREFIJOS_RESERVADOS = List.of("/api", "/actuator", "/v3/api-docs",
            "/swagger-ui", "/webjars", "/error");

    /** Extensiones que puede producir el build de Angular (incluida la carpeta public/). */
    private static final Set<String> EXTENSIONES_ESTATICAS = Set.of("html", "js", "mjs", "css", "ico", "png",
            "jpg", "jpeg", "gif", "svg", "webp", "avif", "woff", "woff2", "ttf", "otf", "json", "webmanifest",
            "txt", "xml");

    private RutasWeb() {
    }

    public static boolean esRecursoEstatico(HttpServletRequest request) {
        if (!esLectura(request)) {
            return false;
        }
        String ruta = ruta(request);
        String extension = extension(ruta);
        return extension != null && !reservada(ruta)
                && EXTENSIONES_ESTATICAS.contains(extension.toLowerCase(Locale.ROOT));
    }

    public static boolean esNavegacionSpa(HttpServletRequest request) {
        if (!esLectura(request)) {
            return false;
        }
        String ruta = ruta(request);
        return extension(ruta) == null && !reservada(ruta) && aceptaHtml(request.getHeader("Accept"));
    }

    /** {@code text/html} debe figurar de forma explícita: un comodín (fetch, curl) no basta. */
    static boolean aceptaHtml(String accept) {
        if (accept == null || accept.isBlank()) {
            return false;
        }
        try {
            return MediaType.parseMediaTypes(accept).stream()
                    .anyMatch(tipo -> "text".equalsIgnoreCase(tipo.getType())
                            && "html".equalsIgnoreCase(tipo.getSubtype())
                            && tipo.getQualityValue() > 0);
        } catch (InvalidMediaTypeException ex) {
            return false;
        }
    }

    private static boolean esLectura(HttpServletRequest request) {
        return "GET".equals(request.getMethod()) || "HEAD".equals(request.getMethod());
    }

    private static String ruta(HttpServletRequest request) {
        String uri = request.getRequestURI();
        String contexto = request.getContextPath();
        return contexto != null && !contexto.isEmpty() && uri.startsWith(contexto)
                ? uri.substring(contexto.length())
                : uri;
    }

    private static boolean reservada(String ruta) {
        for (String prefijo : PREFIJOS_RESERVADOS) {
            if (ruta.equals(prefijo) || ruta.startsWith(prefijo + "/") || ruta.startsWith(prefijo + ".")) {
                return true;
            }
        }
        return false;
    }

    /** Extensión del último segmento, o {@code null} si no tiene (los segmentos con punto inicial no cuentan). */
    private static String extension(String ruta) {
        String segmento = ruta.substring(ruta.lastIndexOf('/') + 1);
        int punto = segmento.lastIndexOf('.');
        return punto > 0 && punto < segmento.length() - 1 ? segmento.substring(punto + 1) : null;
    }
}
