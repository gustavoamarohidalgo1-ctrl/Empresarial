package pe.edu.utp.sigasp.identidad.interno;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Revalida la sesión en cada solicitud: si la contraseña cambió (o se restableció) después de que la sesión
 * se autenticó, es decir, si la versión de credenciales del principal es anterior a la vigente del usuario, la
 * sesión se invalida en el servidor y la solicitud continúa como anónima (las rutas protegidas responden 401
 * {@code NO_AUTENTICADO}). La comparación no usa relojes: la hora simulada de desarrollo no la afecta.
 * <p>
 * No es un {@code @Component}: lo registra solo la cadena de seguridad, justo después de cargar el contexto
 * de la sesión (si fuera un bean, Spring Boot también lo añadiría como filtro del servlet).
 */
class RevalidacionSesion extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RevalidacionSesion.class);

    private final RegistroCredenciales credenciales;

    RevalidacionSesion(RegistroCredenciales credenciales) {
        this.credenciales = credenciales;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication autenticacion = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacion != null && autenticacion.getPrincipal() instanceof UsuarioAutenticado usuario
                && !credenciales.sesionVigente(usuario.id(), usuario.versionCredenciales())) {
            HttpSession sesion = request.getSession(false);
            if (sesion != null) {
                sesion.invalidate();
            }
            SecurityContextHolder.clearContext();
            log.info("Sesión revocada: las credenciales del usuario {} cambiaron después de iniciarla", usuario.id());
        }
        chain.doFilter(request, response);
    }
}
