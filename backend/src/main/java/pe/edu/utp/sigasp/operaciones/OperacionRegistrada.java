package pe.edu.utp.sigasp.operaciones;

import java.time.Instant;
import java.util.UUID;

/** Operación ya procesada, con su resultado. */
public record OperacionRegistrada(
        UUID clave,
        UUID usuarioId,
        String tipo,
        UUID recursoId,
        String huella,
        EstadoOperacion estado,
        int httpStatus,
        String codigoError,
        String respuesta,
        Instant registradaEn,
        String detalleError) {

    OperacionRegistrada(UUID clave, UUID usuarioId, String tipo, UUID recursoId, String huella,
            EstadoOperacion estado, int httpStatus, String codigoError, String respuesta, Instant registradaEn) {
        this(clave, usuarioId, tipo, recursoId, huella, estado, httpStatus, codigoError, respuesta, registradaEn,
                null);
    }

    OperacionRegistrada conDetalleError(String detalle) {
        return new OperacionRegistrada(clave, usuarioId, tipo, recursoId, huella, estado, httpStatus, codigoError,
                respuesta, registradaEn, detalle);
    }
}
