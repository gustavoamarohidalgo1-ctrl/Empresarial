package pe.edu.utp.sigasp.citas.aplicacion;

import java.util.UUID;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * La cita existe pero no pertenece al actor. Hacia fuera se responde igual que una cita inexistente
 * (404), pero se audita como acceso denegado una vez terminada la transacción.
 */
class CitaAjenaException extends ApiException {

    private final UUID citaId;

    CitaAjenaException(UUID citaId) {
        super(CodigoError.CITA_NO_ENCONTRADA);
        this.citaId = citaId;
    }

    UUID citaId() {
        return citaId;
    }
}
