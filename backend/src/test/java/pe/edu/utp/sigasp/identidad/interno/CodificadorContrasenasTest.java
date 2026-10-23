package pe.edu.utp.sigasp.identidad.interno;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;

@DisplayName("Codificador de contraseñas")
class CodificadorContrasenasTest {

    private final CodificadorContrasenas codificador = new CodificadorContrasenas();

    @Test
    @DisplayName("Las contraseñas habituales usan {bcrypt}; las de más de 72 bytes, {bcrypt-sha256}")
    void eligeAlgoritmoPorLargo() {
        String habitual = codificador.encode("Mirador-Surco-2026");
        String larga = "frase muy larga para la cuenta de salud " + "ñ".repeat(40);
        String codificadaLarga = codificador.encode(larga);

        assertThat(habitual).startsWith("{bcrypt}");
        assertThat(codificador.matches("Mirador-Surco-2026", habitual)).isTrue();
        assertThat(codificadaLarga).startsWith("{bcrypt-sha256}");
        assertThat(codificador.matches(larga, codificadaLarga)).isTrue();
        assertThat(codificador.matches(larga + "x", codificadaLarga)).isFalse();
    }

    @Test
    @DisplayName("Verifica los hashes existentes y nunca falla con una contraseña larga contra un {bcrypt}")
    void compatibleYSinErrores() {
        String existente = PasswordEncoderFactories.createDelegatingPasswordEncoder().encode("Clave-Prueba-2026");

        assertThat(codificador.matches("Clave-Prueba-2026", existente)).isTrue();
        assertThat(codificador.matches("x".repeat(100), existente)).isFalse();
        assertThat(codificador.matches("cualquiera", "sin-prefijo")).isFalse();
        assertThat(codificador.matches(null, existente)).isFalse();
    }
}
