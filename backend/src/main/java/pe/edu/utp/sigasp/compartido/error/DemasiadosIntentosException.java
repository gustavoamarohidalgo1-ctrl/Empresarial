package pe.edu.utp.sigasp.compartido.error;

import java.time.Duration;

/**
 * 429 {@code DEMASIADOS_INTENTOS} con el tiempo de espera: el detalle lo dice en minutos y la respuesta
 * lleva la cabecera {@code Retry-After} (en segundos).
 */
public class DemasiadosIntentosException extends ApiException {

    private final Duration espera;

    /** Límite de solicitudes por origen: «Hiciste demasiadas solicitudes de {accion}. Inténtalo nuevamente en…». */
    public DemasiadosIntentosException(String accion, Duration espera) {
        this(espera, "Hiciste demasiadas solicitudes de " + accion + ".");
    }

    private DemasiadosIntentosException(Duration espera, String motivo) {
        super(CodigoError.DEMASIADOS_INTENTOS, motivo + " Inténtalo nuevamente en " + minutos(espera)
                + (minutos(espera) == 1 ? " minuto." : " minutos."));
        this.espera = espera.isNegative() ? Duration.ZERO : espera;
    }

    /**
     * Con un motivo propio (una frase completa), al que se añade «Inténtalo nuevamente en N minutos.». Sirve cuando
     * la causa no son las solicitudes de quien recibe el 429, por ejemplo un bloqueo de la cuenta por intentos
     * fallidos de contraseña.
     */
    public static DemasiadosIntentosException porMotivo(String motivo, Duration espera) {
        return new DemasiadosIntentosException(espera, motivo);
    }

    /** Segundos para {@code Retry-After}, redondeados hacia arriba y como mínimo 1. */
    public long segundosDeEspera() {
        long segundos = espera.toSeconds() + (espera.toNanosPart() > 0 ? 1 : 0);
        return Math.max(1, segundos);
    }

    private static long minutos(Duration espera) {
        return Math.max(1, (espera.toSeconds() + 59) / 60);
    }
}
