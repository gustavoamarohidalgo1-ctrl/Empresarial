package pe.edu.utp.sigasp.citas.aplicacion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.LocalDate;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/** Parámetros y piezas puras de las reglas de la reserva: anticipación mínima y rango de fechas incluidas. */
@DisplayName("v1.1 · Reglas de la reserva (unidad)")
class ReglasReservaTest {

    @Test
    @DisplayName("sigasp.reglas.anticipacion-reserva vale PT2H por defecto y no admite valores negativos")
    void anticipacionPorDefecto() {
        assertThat(new ReglasCitaProperties(null, null, null, null, null).anticipacionReserva())
                .isEqualTo(Duration.ofHours(2));
        assertThat(new ReglasCitaProperties(null, null, null, null, Duration.ZERO).anticipacionReserva()).isZero();
        assertThatThrownBy(() -> new ReglasCitaProperties(null, null, null, null, Duration.ofMinutes(-1)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("anticipacion-reserva");
    }

    @Test
    @DisplayName("La anticipación se escribe en palabras para el mensaje del 409")
    void anticipacionEnPalabras() {
        assertThat(ServicioReservas.texto(Duration.ofHours(2))).isEqualTo("2 horas");
        assertThat(ServicioReservas.texto(Duration.ofHours(1))).isEqualTo("1 hora");
        assertThat(ServicioReservas.texto(Duration.ofMinutes(90))).isEqualTo("90 minutos");
        assertThat(ServicioReservas.texto(Duration.ofMinutes(1))).isEqualTo("1 minuto");
        assertThat(ServicioReservas.texto(Duration.ZERO)).isEqualTo("0 minutos");
    }

    @Test
    @DisplayName("El rango de fechas incluye ambos extremos: 31 días se aceptan; 32 o un rango invertido, no")
    void rangoDeFechas() {
        LocalDate desde = LocalDate.of(2026, 11, 2);

        assertThat(RangoFechas.hasta(desde, null)).isEqualTo(LocalDate.of(2026, 11, 16));
        RangoFechas.validar(desde, desde);
        RangoFechas.validar(desde, desde.plusDays(30));
        assertThatThrownBy(() -> RangoFechas.validar(desde, desde.plusDays(31)))
                .isInstanceOfSatisfying(ApiException.class,
                        ex -> assertThat(ex.codigo()).isEqualTo(CodigoError.VALIDACION))
                .hasMessage("El rango de fechas puede abarcar como máximo 31 días.");
        assertThatThrownBy(() -> RangoFechas.validar(desde, desde.minusDays(1)))
                .isInstanceOf(ApiException.class)
                .hasMessage("La fecha final no puede ser anterior a la fecha inicial.");
    }
}
