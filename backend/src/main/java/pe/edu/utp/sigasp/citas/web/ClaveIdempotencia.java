package pe.edu.utp.sigasp.citas.web;

import java.util.UUID;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/** Valida la cabecera Idempotency-Key: debe ser un UUID generado por el cliente. */
final class ClaveIdempotencia {

    static final String CABECERA = "Idempotency-Key";

    private ClaveIdempotencia() {
    }

    static UUID leer(String valor) {
        try {
            return UUID.fromString(valor.trim());
        } catch (IllegalArgumentException | NullPointerException ex) {
            throw new ApiException(CodigoError.IDEMPOTENCY_KEY_REQUERIDA);
        }
    }
}
