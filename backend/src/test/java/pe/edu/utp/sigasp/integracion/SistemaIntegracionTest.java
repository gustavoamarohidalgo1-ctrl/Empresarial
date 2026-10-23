package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/** v1.1 · Información pública del sistema. */
@DisplayName("v1.1 · Sistema")
class SistemaIntegracionTest extends PruebaApi {

    @Test
    @DisplayName("GET /sistema/info es pública y fuera del perfil dev informa el entorno de producción")
    void infoPublica() {
        assertThat(mvc.get().uri("/api/v1/sistema/info").exchange()).hasStatusOk().bodyJson()
                .isStrictlyEqualTo("{\"nombre\":\"SIGA-SP\",\"version\":\"1.1.0\",\"entorno\":\"produccion\"}");
    }
}
