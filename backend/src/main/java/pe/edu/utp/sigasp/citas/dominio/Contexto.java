package pe.edu.utp.sigasp.citas.dominio;

import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

/**
 * Contexto de una acción: instante del servidor, actor, reglas de tiempo y operación lógica
 * (clave de idempotencia) que la originó.
 */
public record Contexto(Instant ahora, ActorCita actor, ReglasTiempo reglas, UUID operacionId) {

    public Contexto {
        Objects.requireNonNull(ahora, "ahora");
        Objects.requireNonNull(actor, "actor");
        Objects.requireNonNull(reglas, "reglas");
    }
}
