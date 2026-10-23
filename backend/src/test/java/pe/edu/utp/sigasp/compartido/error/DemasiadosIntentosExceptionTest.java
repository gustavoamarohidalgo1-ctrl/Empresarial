package pe.edu.utp.sigasp.compartido.error;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Duration;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("429 DEMASIADOS_INTENTOS: detalle en minutos y Retry-After en segundos")
class DemasiadosIntentosExceptionTest {

    @Test
    @DisplayName("Límite por origen: nombra la acción y redondea la espera hacia arriba")
    void porAccion() {
        DemasiadosIntentosException ex = new DemasiadosIntentosException("registro", Duration.ofSeconds(2341));

        assertThat(ex.codigo()).isEqualTo(CodigoError.DEMASIADOS_INTENTOS);
        assertThat(ex.getMessage())
                .isEqualTo("Hiciste demasiadas solicitudes de registro. Inténtalo nuevamente en 40 minutos.");
        assertThat(ex.segundosDeEspera()).isEqualTo(2341);
    }

    @Test
    @DisplayName("Motivo propio: la frase se conserva y se añade el tiempo de espera, en singular si es 1 minuto")
    void porMotivo() {
        DemasiadosIntentosException ex = DemasiadosIntentosException.porMotivo(
                "La cuenta está bloqueada temporalmente.", Duration.ofMillis(30_500));

        assertThat(ex.getMessage()).isEqualTo("La cuenta está bloqueada temporalmente. Inténtalo nuevamente en 1 minuto.");
        assertThat(ex.segundosDeEspera()).as("redondeo hacia arriba").isEqualTo(31);
    }

    @Test
    @DisplayName("Una espera negativa o nula se informa como 1 segundo y 1 minuto")
    void esperaMinima() {
        DemasiadosIntentosException ex = new DemasiadosIntentosException("registro", Duration.ofSeconds(-5));

        assertThat(ex.segundosDeEspera()).isEqualTo(1);
        assertThat(ex.getMessage()).endsWith("en 1 minuto.");
    }
}
