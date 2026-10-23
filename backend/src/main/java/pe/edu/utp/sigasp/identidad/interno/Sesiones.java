package pe.edu.utp.sigasp.identidad.interno;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.stereotype.Component;

/**
 * Inicia (o renueva) la sesión HTTP de un usuario autenticado. Si ya había una sesión, cambia su
 * identificador (protección contra fijación de sesión); luego guarda el contexto de seguridad en ella.
 * Lo usan el inicio de sesión, el registro y el cambio de contraseña.
 */
@Component
class Sesiones {

    private final SecurityContextRepository contextos;

    Sesiones(SecurityContextRepository contextos) {
        this.contextos = contextos;
    }

    void establecer(Authentication autenticacion, HttpServletRequest request, HttpServletResponse response) {
        if (request.getSession(false) != null) {
            request.changeSessionId();
        }
        SecurityContext contexto = SecurityContextHolder.createEmptyContext();
        contexto.setAuthentication(autenticacion);
        SecurityContextHolder.setContext(contexto);
        contextos.saveContext(contexto, request, response);
    }

    void establecer(UsuarioAutenticado usuario, HttpServletRequest request, HttpServletResponse response) {
        establecer(UsernamePasswordAuthenticationToken.authenticated(usuario, null, usuario.getAuthorities()),
                request, response);
    }
}
