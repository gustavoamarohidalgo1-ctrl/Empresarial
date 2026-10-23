package pe.edu.utp.sigasp.identidad.interno;

import java.io.IOException;
import java.util.List;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Las rutas de desarrollo ({@code /api/v1/dev/**}) que no están habilitadas en esta configuración no existen:
 * responden 404 {@code RECURSO_NO_ENCONTRADO} a cualquiera, con o sin sesión, con cualquier método y antes de
 * comprobar el token CSRF o el rol. Así, en producción no se distinguen de cualquier otra ruta inexistente (un 401
 * o un 403 revelaría que existen) y el frontend no confunde la respuesta con una sesión vencida.
 * <p>
 * Solo se habilitan {@code /api/v1/dev/reloj} con {@code sigasp.reloj.ajustable=true} y {@code /api/v1/dev/correos}
 * con {@code sigasp.dev.buzon-correos=true}, las mismas propiedades que crean sus controladores (perfil dev).
 * <p>
 * No es un {@code @Component}: lo registra solo la cadena de seguridad, como {@link RevalidacionSesion}.
 */
final class RutasDesarrolloInexistentes extends OncePerRequestFilter {

    private static final RequestMatcher RUTAS_DESARROLLO = PathPatternRequestMatcher.pathPattern("/api/v1/dev/**");

    private final List<RequestMatcher> habilitadas;
    private final RespuestasSeguridad respuestas;

    RutasDesarrolloInexistentes(boolean relojAjustable, boolean buzonCorreos, RespuestasSeguridad respuestas) {
        List<RequestMatcher> rutas = new java.util.ArrayList<>();
        if (relojAjustable) {
            rutas.add(PathPatternRequestMatcher.pathPattern("/api/v1/dev/reloj"));
        }
        if (buzonCorreos) {
            rutas.add(PathPatternRequestMatcher.pathPattern("/api/v1/dev/correos"));
        }
        this.habilitadas = List.copyOf(rutas);
        this.respuestas = respuestas;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (RUTAS_DESARROLLO.matches(request) && habilitadas.stream().noneMatch(ruta -> ruta.matches(request))) {
            respuestas.noEncontrado(request, response);
            return;
        }
        chain.doFilter(request, response);
    }
}
