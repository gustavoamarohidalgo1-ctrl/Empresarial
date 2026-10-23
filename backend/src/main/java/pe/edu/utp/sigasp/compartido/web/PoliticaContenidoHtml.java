package pe.edu.utp.sigasp.compartido.web;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.security.web.header.HeaderWriter;
import org.springframework.stereotype.Component;

/**
 * Content-Security-Policy estricta para las respuestas HTML (el {@code index.html} del SPA). Las
 * respuestas JSON de la API no la necesitan y no la llevan.
 * <p>
 * Compatible con Angular: los estilos de los componentes se inyectan en etiquetas {@code <style>}
 * ({@code 'unsafe-inline'} solo en {@code style-src}); los scripts son archivos propios
 * ({@code 'self'}). Si el {@code index.html} empaquetado trae scripts en línea (el build de
 * producción agrega uno para activar la hoja de estilos diferida por la inserción de CSS crítico),
 * se permiten <b>solo</b> esos, por su hash SHA-256 calculado al arrancar: la política sigue sin
 * {@code 'unsafe-inline'} para scripts y no hay que mantener hashes a mano en cada build.
 */
@Component
public class PoliticaContenidoHtml implements HeaderWriter {

    public static final String CABECERA = "Content-Security-Policy";

    private static final String PLANTILLA = "default-src 'self'; script-src 'self'%s; "
            + "style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; "
            + "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'";

    /** Elemento script completo: atributos (grupo 1) y contenido (grupo 2). */
    private static final Pattern SCRIPT = Pattern.compile("<script\\b([^>]*)>(.*?)</script\\s*>",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern ATRIBUTO_SRC = Pattern.compile("\\bsrc\\s*=", Pattern.CASE_INSENSITIVE);
    private static final Pattern ATRIBUTO_TYPE = Pattern.compile("\\btype\\s*=\\s*[\"']?([^\"'\\s>]+)",
            Pattern.CASE_INSENSITIVE);
    /** Tipos que el navegador ejecuta (los bloques de datos, como application/ld+json, no). */
    private static final Set<String> TIPOS_EJECUTABLES = Set.of("", "module", "text/javascript",
            "application/javascript", "importmap");

    private static final Logger log = LoggerFactory.getLogger(PoliticaContenidoHtml.class);

    private final String politica;

    PoliticaContenidoHtml(ResourceLoader recursos) {
        Resource indice = recursos.getResource(RutasWeb.UBICACION_INDICE);
        this.politica = indice.exists() ? politica(leer(indice)) : politica("");
        log.debug("CSP de las respuestas HTML: {}", politica);
    }

    /** Política para un documento HTML: la base estricta más el hash de cada script en línea. */
    public static String politica(String html) {
        Set<String> hashes = new LinkedHashSet<>();
        Matcher script = SCRIPT.matcher(html);
        while (script.find()) {
            String atributos = script.group(1);
            String contenido = script.group(2);
            if (!ATRIBUTO_SRC.matcher(atributos).find() && !contenido.isBlank() && esEjecutable(atributos)) {
                hashes.add("'sha256-" + sha256(contenido) + "'");
            }
        }
        return PLANTILLA.formatted(hashes.isEmpty() ? "" : " " + String.join(" ", hashes));
    }

    public String politica() {
        return politica;
    }

    @Override
    public void writeHeaders(HttpServletRequest request, HttpServletResponse response) {
        if (esHtml(response.getContentType()) && !response.containsHeader(CABECERA)) {
            response.setHeader(CABECERA, politica);
        }
    }

    static boolean esHtml(String tipoContenido) {
        return tipoContenido != null && tipoContenido.toLowerCase(Locale.ROOT).startsWith("text/html");
    }

    private static boolean esEjecutable(String atributos) {
        Matcher tipo = ATRIBUTO_TYPE.matcher(atributos);
        return TIPOS_EJECUTABLES.contains(tipo.find() ? tipo.group(1).toLowerCase(Locale.ROOT) : "");
    }

    private static String sha256(String texto) {
        try {
            byte[] resumen = MessageDigest.getInstance("SHA-256").digest(texto.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(resumen);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible", ex);
        }
    }

    private static String leer(Resource recurso) {
        try (InputStream entrada = recurso.getInputStream()) {
            return new String(entrada.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new UncheckedIOException("No se pudo leer " + RutasWeb.UBICACION_INDICE, ex);
        }
    }
}
