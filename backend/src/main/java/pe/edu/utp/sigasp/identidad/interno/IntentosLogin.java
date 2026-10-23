package pe.edu.utp.sigasp.identidad.interno;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad;

/**
 * Bloqueo temporal por intentos (mitiga fuerza bruta, OWASP ASVS V6).
 * <ul>
 *   <li><b>Atómico</b>: cada intento se reserva antes de verificar la contraseña, así que N solicitudes
 *       en paralelo no pueden superar el máximo (antes de esta reserva, verificar y registrar eran dos pasos).</li>
 *   <li>Un inicio de sesión correcto libera el contador del correo.</li>
 *   <li><b>Memoria acotada</b>: las entradas sin intentos recientes ni bloqueo vigente se purgan.</li>
 *   <li>Usa el <b>reloj de seguridad</b> (hora real): simular la hora de negocio en desarrollo no levanta ni
 *       prolonga un bloqueo.</li>
 * </ul>
 * Vive en memoria porque el MVP corre en una sola instancia; con varias instancias debe pasar a la BD.
 * Riesgo aceptado (documentado): quien conozca un correo puede mantener esa cuenta bloqueada; la
 * respuesta no revela si la cuenta existe ni si está bloqueada.
 */
@Component
public class IntentosLogin {

    private static final int UMBRAL_PURGA = 1_000;

    private final Configuracion config;
    private final Clock reloj;
    private final Map<String, Registro> registros = new ConcurrentHashMap<>();

    IntentosLogin(Configuracion config, @RelojSeguridad Clock reloj) {
        this.config = config;
        this.reloj = reloj;
    }

    /**
     * Reserva un intento para el correo. Devuelve {@code false} si la cuenta está bloqueada: en ese
     * caso no debe verificarse la contraseña. El intento reservado cuenta como fallido salvo que luego
     * se llame a {@link #exito}.
     */
    public boolean reservarIntento(String email) {
        return reservar(email).isEmpty();
    }

    /**
     * Como {@link #reservarIntento}, pero si la cuenta está bloqueada devuelve cuánto falta para que se levante
     * el bloqueo (vacío si el intento quedó reservado). El inicio de sesión no lo usa: su respuesta no revela
     * el bloqueo; sí el cambio de contraseña, cuya persona ya está autenticada.
     */
    public Optional<Duration> reservar(String email) {
        Instant ahora = reloj.instant();
        if (registros.size() > UMBRAL_PURGA) {
            purgar(ahora);
        }
        @SuppressWarnings("unchecked")
        Optional<Duration>[] espera = new Optional[] {Optional.empty()};
        registros.compute(clave(email), (k, actual) -> {
            Registro registro = actual == null ? new Registro() : actual;
            espera[0] = registro.reservar(ahora, config);
            return registro;
        });
        return espera[0];
    }

    /** Un inicio de sesión correcto libera el contador. */
    public void exito(String email) {
        registros.remove(clave(email));
    }

    int registrosEnMemoria() {
        return registros.size();
    }

    private void purgar(Instant ahora) {
        registros.entrySet().removeIf(e -> e.getValue().vencido(ahora, config));
    }

    private static String clave(String email) {
        return email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
    }

    private static final class Registro {
        private final Deque<Instant> intentos = new ArrayDeque<>();
        private Instant bloqueoHasta;

        synchronized Optional<Duration> reservar(Instant ahora, Configuracion config) {
            if (bloqueoHasta != null && ahora.isBefore(bloqueoHasta)) {
                return Optional.of(Duration.between(ahora, bloqueoHasta));
            }
            descartarAntiguos(ahora, config);
            intentos.addLast(ahora);
            if (intentos.size() >= config.maxIntentos()) {
                // Este intento se evalúa; los siguientes quedan bloqueados si no hubo éxito.
                bloqueoHasta = ahora.plus(config.bloqueo());
                intentos.clear();
            }
            return Optional.empty();
        }

        synchronized boolean vencido(Instant ahora, Configuracion config) {
            descartarAntiguos(ahora, config);
            return intentos.isEmpty() && (bloqueoHasta == null || !ahora.isBefore(bloqueoHasta));
        }

        private void descartarAntiguos(Instant ahora, Configuracion config) {
            while (!intentos.isEmpty() && intentos.peekFirst().isBefore(ahora.minus(config.ventana()))) {
                intentos.pollFirst();
            }
        }
    }

    @ConfigurationProperties("sigasp.seguridad.login")
    public record Configuracion(Integer maxIntentos, Duration ventana, Duration bloqueo) {
        public Configuracion {
            maxIntentos = maxIntentos == null ? 5 : maxIntentos;
            ventana = ventana == null ? Duration.ofMinutes(15) : ventana;
            bloqueo = bloqueo == null ? Duration.ofMinutes(15) : bloqueo;
        }
    }
}
