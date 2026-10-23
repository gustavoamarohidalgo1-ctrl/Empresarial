package pe.edu.utp.sigasp.identidad.interno;

import java.util.Optional;

import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;

/** Obtiene el actor del contexto de seguridad de la solicitud en curso. */
@Component
class ActorDeSesion implements ActorActual {

    @Override
    public Optional<Actor> opcional() {
        Authentication autenticacion = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacion != null && autenticacion.getPrincipal() instanceof UsuarioAutenticado usuario) {
            return Optional.of(usuario.comoActor());
        }
        return Optional.empty();
    }
}
