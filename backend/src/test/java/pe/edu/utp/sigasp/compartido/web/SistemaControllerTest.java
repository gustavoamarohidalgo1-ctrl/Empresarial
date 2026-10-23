package pe.edu.utp.sigasp.compartido.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

@DisplayName("Sistema · entorno deducido del perfil activo")
class SistemaControllerTest {

    @Test
    @DisplayName("Con el perfil dev el entorno es «desarrollo»; con cualquier otro, «produccion»")
    void entornoPorPerfil() {
        MockEnvironment dev = new MockEnvironment();
        dev.setActiveProfiles("dev");
        MockEnvironment prod = new MockEnvironment();
        prod.setActiveProfiles("prod");

        assertThat(new SistemaController(dev, "1.1.0").info())
                .isEqualTo(new SistemaController.InfoSistema("SIGA-SP", "1.1.0", "desarrollo"));
        assertThat(new SistemaController(prod, "1.1.0").info().entorno()).isEqualTo("produccion");
        assertThat(new SistemaController(new MockEnvironment(), "1.1.0").info().entorno()).isEqualTo("produccion");
    }
}
