package pe.edu.utp.sigasp.compartido.web;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Respaldo del SPA: una navegación del navegador a una ruta de Angular ({@code /login},
 * {@code /paciente/citas/...}, {@code /operador}...) se reenvía internamente a {@code /index.html}
 * para que una recarga o un enlace directo no terminen en 404.
 * <p>
 * Corre después de Spring Security (orden -100), así la solicitud original ya pasó la
 * autorización y recibe las cabeceras de seguridad; el reenvío llega al manejador de recursos,
 * que responde {@code index.html} con {@code Cache-Control: no-cache}. Si el jar no incluye el
 * frontend (perfil {@code con-frontend}), no se reenvía nada.
 * <p>
 * Un HEAD se reenvía como GET: Spring Security escribe sus cabeceras (CSP, X-Frame-Options...)
 * cuando la respuesta se confirma al escribir el cuerpo, y tras un reenvío sin cuerpo Tomcat cierra
 * la respuesta sin avisar a ese envoltorio. Tomcat descarta igualmente el cuerpo de un HEAD.
 */
@Component
@Order(0)
public class ReenvioSpaFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(ReenvioSpaFilter.class);

    private final boolean spaEmpaquetado;

    ReenvioSpaFilter(ResourceLoader recursos) {
        this.spaEmpaquetado = recursos.getResource(RutasWeb.UBICACION_INDICE).exists();
        if (spaEmpaquetado) {
            log.info("SPA empaquetado: las rutas de navegación se responden con {}", RutasWeb.INDICE);
        } else {
            log.info("Sin SPA en classpath:/static: solo se sirve la API (frontend aparte, p. ej. ng serve)");
        }
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !spaEmpaquetado || !RutasWeb.esNavegacionSpa(request);
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        HttpServletRequest reenviada = "HEAD".equals(request.getMethod()) ? new ComoGet(request) : request;
        reenviada.getRequestDispatcher(RutasWeb.INDICE).forward(reenviada, response);
    }

    /** Presenta un HEAD como GET al manejador de recursos (ver la documentación de la clase). */
    private static final class ComoGet extends HttpServletRequestWrapper {

        ComoGet(HttpServletRequest request) {
            super(request);
        }

        @Override
        public String getMethod() {
            return "GET";
        }
    }
}
