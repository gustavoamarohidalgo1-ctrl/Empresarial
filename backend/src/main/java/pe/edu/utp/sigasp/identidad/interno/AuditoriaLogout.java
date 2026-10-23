package pe.edu.utp.sigasp.identidad.interno;

import java.util.Map;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.core.Authentication;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;

/** Audita el cierre de sesión antes de que se invalide. */
@Component
class AuditoriaLogout implements LogoutHandler {

    private final Auditoria auditoria;

    AuditoriaLogout(Auditoria auditoria) {
        this.auditoria = auditoria;
    }

    @Override
    public void logout(HttpServletRequest request, HttpServletResponse response, Authentication autenticacion) {
        if (autenticacion != null && autenticacion.getPrincipal() instanceof UsuarioAutenticado usuario) {
            auditoria.registrarIndependiente(
                    RegistroAuditoria.exito("LOGOUT", "SESION", usuario.id(), null, Map.of()),
                    Optional.of(usuario.comoActor()));
        }
    }
}
