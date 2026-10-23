package pe.edu.utp.sigasp.compartido.error;

/**
 * Error controlado de la aplicación. Se traduce a Problem Details con el {@link CodigoError}.
 * El mensaje nunca debe contener datos personales ni detalles técnicos.
 */
public class ApiException extends RuntimeException {

    private final CodigoError codigo;

    public ApiException(CodigoError codigo) {
        this(codigo, codigo.detallePorDefecto());
    }

    public ApiException(CodigoError codigo, String detalle) {
        super(detalle);
        this.codigo = codigo;
    }

    public CodigoError codigo() {
        return codigo;
    }
}
