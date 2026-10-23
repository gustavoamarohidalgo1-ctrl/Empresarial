package pe.edu.utp.sigasp.identidad.interno;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.compartido.error.Problemas.ErrorCampo;

@DisplayName("Política de contraseñas")
class PoliticaContrasenasTest {

    private final PoliticaContrasenas politica = new PoliticaContrasenas();

    private List<String> mensajes(String password, String email) {
        return politica.evaluar("password", password, email).stream().map(ErrorCampo::mensaje).toList();
    }

    @Test
    @DisplayName("Acepta una contraseña de 10 a 128 caracteres con letras y números que no es común")
    void aceptaContrasenaSegura() {
        assertThat(politica.evaluar("password", "Mirador-Surco-2026", "lucia@correo.test")).isEmpty();
        assertThat(politica.evaluar("password", "a1".repeat(5), null)).isEmpty();
        assertThat(politica.evaluar("password", "ñ".repeat(120) + "12345678", null)).as("128 caracteres").isEmpty();
    }

    @Test
    @DisplayName("Rechaza el largo fuera de 10 a 128, la falta de letra o número, el correo y las comunes")
    void rechazaCadaRegla() {
        assertThat(mensajes("abc12345", null)).containsExactly("La contraseña debe tener entre 10 y 128 caracteres.");
        assertThat(mensajes("a1".repeat(65), null)).containsExactly(
                "La contraseña debe tener entre 10 y 128 caracteres.");
        assertThat(mensajes("12345678901", null)).containsExactly(
                "La contraseña debe incluir al menos una letra y un número.");
        assertThat(mensajes("SoloLetrasAqui", null)).containsExactly(
                "La contraseña debe incluir al menos una letra y un número.");
        assertThat(mensajes("Lucia.Paredes7@Correo.test", "lucia.paredes7@correo.test"))
                .containsExactly("La contraseña no puede ser igual a tu correo.");
        assertThat(mensajes("lucia.paredes7", "lucia.paredes7@correo.test")).as("parte antes de la arroba")
                .containsExactly("La contraseña no puede ser igual a tu correo.");
        assertThat(mensajes("Password123", null)).singleElement().asString().contains("muy común");
        assertThat(mensajes("  QWERTY12345 ", null)).singleElement().asString().contains("muy común");
        assertThat(mensajes("", null)).containsExactly("Ingresa una contraseña.");
        assertThat(mensajes(null, null)).containsExactly("Ingresa una contraseña.");
        assertThat(mensajes("abc", null)).hasSize(2);
    }

    @Test
    @DisplayName("Los errores van en el campo indicado y la lista local de contraseñas comunes se carga")
    void campoYLista() {
        assertThat(politica.evaluar("nueva", "corta1", null)).extracting(ErrorCampo::campo).containsOnly("nueva");
        assertThat(politica.totalComunes()).isGreaterThan(150);
        assertThat(politica.esComun("Contraseña123")).isTrue();
    }
}
