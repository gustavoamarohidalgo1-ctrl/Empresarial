package pe.edu.utp.sigasp.identidad.interno;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;
import java.time.Instant;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;

@DisplayName("Bloqueo por intentos: tiempo de espera")
class IntentosLoginTest {

    private static final Instant INICIO = Instant.parse("2026-10-23T15:00:00Z");

    private final RelojAjustable reloj = RelojAjustable.delSistema();
    private final IntentosLogin intentos = new IntentosLogin(
            new IntentosLogin.Configuracion(5, Duration.ofMinutes(15), Duration.ofMinutes(15)), reloj);

    @Test
    @DisplayName("Durante el bloqueo informa cuánto falta; al vencer se puede volver a intentar")
    void esperaDelBloqueo() {
        reloj.fijar(INICIO);
        for (int i = 0; i < 5; i++) {
            assertThat(intentos.reservar("ana@correo.test")).isEmpty();
        }

        assertThat(intentos.reservar("ANA@correo.test ")).contains(Duration.ofMinutes(15));
        reloj.fijar(INICIO.plus(Duration.ofMinutes(10)));
        assertThat(intentos.reservar("ana@correo.test")).contains(Duration.ofMinutes(5));
        assertThat(intentos.reservarIntento("ana@correo.test")).isFalse();
        assertThat(intentos.reservar("otra@correo.test")).as("otra cuenta no está bloqueada").isEmpty();

        reloj.fijar(INICIO.plus(Duration.ofMinutes(15)));
        assertThat(intentos.reservar("ana@correo.test")).isEmpty();
    }

    @Test
    @DisplayName("Un éxito libera el contador y no deja bloqueo")
    void exitoLibera() {
        reloj.fijar(INICIO);
        for (int i = 0; i < 4; i++) {
            intentos.reservar("luis@correo.test");
        }
        intentos.exito("luis@correo.test");
        for (int i = 0; i < 4; i++) {
            assertThat(intentos.reservar("luis@correo.test")).isEmpty();
        }
        assertThat(intentos.registrosEnMemoria()).isEqualTo(1);
    }
}
