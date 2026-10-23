package pe.edu.utp.sigasp.operaciones;

import java.util.Objects;
import java.util.UUID;

/**
 * Identidad de una operación lógica.
 *
 * @param clave     clave generada por el cliente (cabecera Idempotency-Key)
 * @param usuarioId usuario que la ejecuta; una clave no puede reutilizarse entre usuarios
 * @param tipo      tipo de operación, por ejemplo CONFIRMAR_CITA
 * @param recursoId recurso afectado
 * @param contenido datos de la solicitud; su huella detecta reutilizaciones con otro contenido
 */
public record SolicitudIdempotente(UUID clave, UUID usuarioId, String tipo, UUID recursoId, Object contenido) {

    public SolicitudIdempotente {
        Objects.requireNonNull(clave, "clave");
        Objects.requireNonNull(usuarioId, "usuarioId");
        Objects.requireNonNull(tipo, "tipo");
        Objects.requireNonNull(recursoId, "recursoId");
    }
}
