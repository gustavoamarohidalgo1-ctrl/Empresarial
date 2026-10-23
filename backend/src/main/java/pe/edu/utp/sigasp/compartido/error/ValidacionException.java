package pe.edu.utp.sigasp.compartido.error;

import java.util.List;
import java.util.Objects;

import pe.edu.utp.sigasp.compartido.error.Problemas.ErrorCampo;

/**
 * Error de validación detectado en un servicio (no por Bean Validation): responde 400 {@code VALIDACION}
 * con {@code errores[]}, igual que un cuerpo inválido. Sirve para reglas que necesitan datos del servidor,
 * como la política de contraseñas o la especialidad de un horario.
 */
public class ValidacionException extends ApiException {

    private final List<ErrorCampo> errores;

    public ValidacionException(List<ErrorCampo> errores) {
        super(CodigoError.VALIDACION);
        if (errores == null || errores.isEmpty()) {
            throw new IllegalArgumentException("Una validación fallida necesita al menos un error");
        }
        this.errores = List.copyOf(errores);
    }

    public static ValidacionException campo(String campo, String mensaje) {
        return new ValidacionException(List.of(new ErrorCampo(Objects.requireNonNull(campo),
                Objects.requireNonNull(mensaje))));
    }

    public List<ErrorCampo> errores() {
        return errores;
    }
}
