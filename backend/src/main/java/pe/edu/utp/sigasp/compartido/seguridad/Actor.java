package pe.edu.utp.sigasp.compartido.seguridad;

import java.util.Objects;
import java.util.UUID;

/**
 * Quién ejecuta una acción. Los módulos de negocio solo conocen este registro, no el modelo
 * de seguridad. {@code pacienteId} solo existe para el rol PACIENTE.
 */
public record Actor(UUID usuarioId, Rol rol, UUID pacienteId, String nombre) {

    public Actor {
        Objects.requireNonNull(usuarioId, "usuarioId");
        Objects.requireNonNull(rol, "rol");
        if ((rol == Rol.PACIENTE) != (pacienteId != null)) {
            throw new IllegalArgumentException("Solo un actor PACIENTE tiene pacienteId");
        }
    }

    public boolean es(Rol otro) {
        return rol == otro;
    }
}
