package pe.edu.utp.sigasp.citas.dominio;

import java.util.Objects;
import java.util.UUID;

/** Actor de una acción sobre la cita. El sistema (cierre automático) no tiene usuario. */
public record ActorCita(TipoActor tipo, UUID usuarioId) {

    public static final ActorCita SISTEMA = new ActorCita(TipoActor.SISTEMA, null);

    public ActorCita {
        Objects.requireNonNull(tipo, "tipo");
        if ((tipo == TipoActor.SISTEMA) != (usuarioId == null)) {
            throw new IllegalArgumentException("Solo el actor SISTEMA carece de usuario");
        }
    }
}
