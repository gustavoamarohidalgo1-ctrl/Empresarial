package pe.edu.utp.sigasp.identidad.interno;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;

@DisplayName("Límite por ventana deslizante")
class LimitadorVentanaTest {

    private static final Instant T0 = Instant.parse("2026-11-02T13:00:00Z");

    private final RelojAjustable reloj = RelojAjustable.delSistema();
    private final LimitadorVentana limitador = new LimitadorVentana(5, Duration.ofHours(1), reloj);

    @Test
    @DisplayName("Permite 5 intentos; el sexto espera hasta que sale de la ventana el más antiguo")
    void cincoPorHora() {
        for (int i = 0; i < 5; i++) {
            reloj.fijar(T0.plus(Duration.ofMinutes(i)));
            assertThat(limitador.intentar("10.0.0.1")).isEmpty();
        }
        reloj.fijar(T0.plus(Duration.ofMinutes(30)));
        assertThat(limitador.intentar("10.0.0.1")).contains(Duration.ofMinutes(30));
        assertThat(limitador.intentar("10.0.0.2")).as("otra clave tiene su propio cupo").isEmpty();

        reloj.fijar(T0.plus(Duration.ofHours(1)));
        assertThat(limitador.intentar("10.0.0.1")).as("el primero salió de la ventana").isEmpty();
        assertThat(limitador.intentar("10.0.0.1")).as("el segundo aún no").isPresent();
    }

    @Test
    @DisplayName("La memoria es acotada: se purgan las claves sin intentos en la ventana")
    void memoriaAcotada() {
        reloj.fijar(T0);
        for (int i = 0; i <= LimitadorVentana.UMBRAL_PURGA; i++) {
            limitador.intentar("ip-" + i);
        }
        reloj.fijar(T0.plus(Duration.ofHours(2)));
        limitador.intentar("nueva");
        assertThat(limitador.clavesEnMemoria()).isEqualTo(1);
    }
}
