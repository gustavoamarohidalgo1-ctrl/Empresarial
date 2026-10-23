package pe.edu.utp.sigasp.analitica;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class IndicadoresTest {

    @Test
    @DisplayName("Tasa: un decimal con redondeo mitad hacia arriba; null con denominador 0")
    void tasa() {
        assertThat(Indicadores.tasa(1, 4)).isEqualByComparingTo("25.0").hasToString("25.0");
        assertThat(Indicadores.tasa(1, 3)).hasToString("33.3");
        assertThat(Indicadores.tasa(2, 3)).hasToString("66.7");
        assertThat(Indicadores.tasa(1, 8)).hasToString("12.5");
        assertThat(Indicadores.tasa(1, 16)).hasToString("6.3"); // 6.25 → 6.3
        assertThat(Indicadores.tasa(0, 5)).isEqualTo(new BigDecimal("0.0"));
        assertThat(Indicadores.tasa(7, 7)).hasToString("100.0");
        assertThat(Indicadores.tasa(0, 0)).isNull();
    }
}
