package pe.edu.utp.sigasp.compartido.web;

import java.io.IOException;
import java.util.HexFormat;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Pattern;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Asigna un identificador a cada solicitud, lo publica en el MDC (logs) y lo devuelve en
 * {@code X-Request-Id}. Permite correlacionar una respuesta de error con su entrada de log.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class RequestIdFilter extends OncePerRequestFilter {

    public static final String CABECERA = "X-Request-Id";
    public static final String MDC_CLAVE = "requestId";
    private static final Pattern FORMATO_VALIDO = Pattern.compile("[A-Za-z0-9-]{8,40}");

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String entrante = request.getHeader(CABECERA);
        String requestId = entrante != null && FORMATO_VALIDO.matcher(entrante).matches() ? entrante : generar();
        MDC.put(MDC_CLAVE, requestId);
        response.setHeader(CABECERA, requestId);
        try {
            chain.doFilter(request, response);
        } finally {
            MDC.remove(MDC_CLAVE);
        }
    }

    private static String generar() {
        byte[] bytes = new byte[6];
        ThreadLocalRandom.current().nextBytes(bytes);
        return HexFormat.of().formatHex(bytes);
    }
}
