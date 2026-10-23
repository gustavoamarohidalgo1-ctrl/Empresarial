package pe.edu.utp.sigasp.identidad.interno;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Comparator;
import java.util.Deque;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Límite de solicitudes por clave (IP o correo) en una ventana deslizante, en memoria.
 * <ul>
 *   <li><b>Atómico por clave</b>: comprobar y registrar el intento es un solo paso, así que solicitudes en
 *       paralelo no superan el máximo.</li>
 *   <li>Un intento rechazado <b>no</b> se registra: la espera termina cuando sale de la ventana el más antiguo.</li>
 *   <li><b>Memoria acotada</b>: al superar {@link #UMBRAL_PURGA} claves se purgan las que no tienen intentos en la
 *       ventana; si aun así se supera {@link #MAXIMO_CLAVES}, se descartan las de actividad más antigua.</li>
 * </ul>
 * Como el bloqueo de inicio de sesión, vive en memoria porque el sistema corre en una sola instancia; con
 * varias instancias debe pasar a un almacén compartido.
 */
final class LimitadorVentana {

    static final int UMBRAL_PURGA = 1_000;
    static final int MAXIMO_CLAVES = 10_000;

    private final int maximo;
    private final Duration ventana;
    private final Clock reloj;
    private final Map<String, Registro> registros = new ConcurrentHashMap<>();

    LimitadorVentana(int maximo, Duration ventana, Clock reloj) {
        if (maximo < 1 || ventana.isNegative() || ventana.isZero()) {
            throw new IllegalArgumentException("Límite inválido");
        }
        this.maximo = maximo;
        this.ventana = ventana;
        this.reloj = reloj;
    }

    /**
     * Registra un intento para la clave si queda cupo. Devuelve vacío si se permitió, o cuánto falta para
     * que se libere un cupo si la clave ya alcanzó el máximo en la ventana.
     */
    Optional<Duration> intentar(String clave) {
        Instant ahora = reloj.instant();
        if (registros.size() > UMBRAL_PURGA) {
            purgar(ahora);
        }
        @SuppressWarnings("unchecked")
        Optional<Duration>[] resultado = new Optional[] {Optional.empty()};
        registros.compute(clave, (k, actual) -> {
            Registro registro = actual == null ? new Registro() : actual;
            resultado[0] = registro.intentar(ahora, maximo, ventana);
            return registro;
        });
        return resultado[0];
    }

    int clavesEnMemoria() {
        return registros.size();
    }

    private void purgar(Instant ahora) {
        registros.entrySet().removeIf(e -> e.getValue().vencido(ahora, ventana));
        if (registros.size() > MAXIMO_CLAVES) {
            // Muchas claves activas (p. ej., una ráfaga desde muchas IP): se conservan las más recientes.
            registros.entrySet().stream()
                    .sorted(Comparator.comparing(e -> e.getValue().ultimo()))
                    .limit(registros.size() - MAXIMO_CLAVES / 2L)
                    .map(Map.Entry::getKey)
                    .toList()
                    .forEach(registros::remove);
        }
    }

    private static final class Registro {
        private final Deque<Instant> intentos = new ArrayDeque<>();
        private Instant ultimo = Instant.MIN;

        synchronized Optional<Duration> intentar(Instant ahora, int maximo, Duration ventana) {
            descartarAntiguos(ahora, ventana);
            if (intentos.size() >= maximo) {
                return Optional.of(Duration.between(ahora, intentos.peekFirst().plus(ventana)));
            }
            intentos.addLast(ahora);
            ultimo = ahora;
            return Optional.empty();
        }

        synchronized boolean vencido(Instant ahora, Duration ventana) {
            descartarAntiguos(ahora, ventana);
            return intentos.isEmpty();
        }

        synchronized Instant ultimo() {
            return ultimo;
        }

        private void descartarAntiguos(Instant ahora, Duration ventana) {
            while (!intentos.isEmpty() && !intentos.peekFirst().plus(ventana).isAfter(ahora)) {
                intentos.pollFirst();
            }
        }
    }
}
