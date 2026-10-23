package pe.edu.utp.sigasp;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.analitica.interno.EstadoAlCorte;
import pe.edu.utp.sigasp.citas.dominio.EstadoCita;

/**
 * La analítica replica los estados de la cita para no depender de un paquete interno del módulo
 * citas. Esta prueba vive en el paquete raíz (fuera de todo módulo) porque compara ambos lados.
 */
class EstadosAnaliticaTest {

    @Test
    @DisplayName("Los 8 estados de la analítica coinciden con los de la cita en nombre, orden y etiqueta")
    void coincidenConEstadoCita() {
        assertThat(Arrays.stream(EstadoAlCorte.values()).map(Enum::name))
                .containsExactlyElementsOf(Arrays.stream(EstadoCita.values()).map(Enum::name).toList());
        for (EstadoCita estado : EstadoCita.values()) {
            EstadoAlCorte replica = EstadoAlCorte.valueOf(estado.name());
            assertThat(replica.etiqueta()).as(estado.name()).isEqualTo(estado.etiqueta());
            assertThat(replica.esPreviaALlegada()).as(estado.name()).isEqualTo(estado.esPreviaALlegada());
        }
    }
}
