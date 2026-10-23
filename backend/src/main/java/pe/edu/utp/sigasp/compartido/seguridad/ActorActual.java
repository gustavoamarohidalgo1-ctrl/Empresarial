package pe.edu.utp.sigasp.compartido.seguridad;

import java.util.Optional;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/** Acceso al actor autenticado de la solicitud en curso (lo implementa el módulo de identidad). */
public interface ActorActual {

    Optional<Actor> opcional();

    default Actor requerido() {
        return opcional().orElseThrow(() -> new ApiException(CodigoError.NO_AUTENTICADO));
    }
}
