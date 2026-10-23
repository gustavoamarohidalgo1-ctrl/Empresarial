package pe.edu.utp.sigasp.soporte;

import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.test.web.servlet.request.RequestPostProcessor;

/**
 * Direcciones IP de cliente únicas para las pruebas. Los límites por IP (registro y recuperación) viven en
 * memoria durante todo el contexto de Spring: cada prueba usa IP propias para no compartir el cupo.
 */
public final class Origenes {

    private static final AtomicInteger SIGUIENTE = new AtomicInteger();

    private Origenes() {
    }

    /** Una IP privada distinta en cada llamada (10.77.x.y). */
    public static String nuevaIp() {
        int n = SIGUIENTE.incrementAndGet();
        return "10.77." + (n / 250) + "." + (1 + n % 250);
    }

    /** Hace que la solicitud llegue desde la IP indicada. */
    public static RequestPostProcessor desde(String ip) {
        return solicitud -> {
            solicitud.setRemoteAddr(ip);
            return solicitud;
        };
    }
}
