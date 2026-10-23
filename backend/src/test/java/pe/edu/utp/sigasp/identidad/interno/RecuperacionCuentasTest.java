package pe.edu.utp.sigasp.identidad.interno;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

@DisplayName("Recuperación de contraseña: base del enlace del correo")
class RecuperacionCuentasTest {

    @Test
    @DisplayName("Usa sigasp.correo.url-base si está definida, sin barra final")
    void urlConfigurada() {
        assertThat(RecuperacionCuentas.baseDeEnlaces("http://localhost:4200", "http://localhost:8080"))
                .isEqualTo("http://localhost:4200");
        assertThat(RecuperacionCuentas.baseDeEnlaces(" https://citas.siga-sp.pe/ ", "http://10.0.0.5:8080"))
                .isEqualTo("https://citas.siga-sp.pe");
    }

    @Test
    @DisplayName("Si no está definida, deduce la base del origen de la solicitud")
    void origenDeLaSolicitud() {
        assertThat(RecuperacionCuentas.baseDeEnlaces("", "http://localhost:8080")).isEqualTo("http://localhost:8080");
        assertThat(RecuperacionCuentas.baseDeEnlaces("  ", "https://citas.siga-sp.pe/"))
                .isEqualTo("https://citas.siga-sp.pe");
        assertThat(RecuperacionCuentas.baseDeEnlaces(null, "https://citas.siga-sp.pe"))
                .isEqualTo("https://citas.siga-sp.pe");
        assertThat(RecuperacionCuentas.baseDeEnlaces(null, null)).as("sin ninguna, el enlace queda relativo")
                .isEmpty();
    }
}
