package pe.edu.utp.sigasp.compartido;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.PropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * Configuración de cada perfil tal como se empaqueta: producción (application.yml) sin rutas ni datos de desarrollo
 * y con los límites de cuenta en 5; desarrollo (application-dev.yml) con los límites altos (ng serve hace que todas
 * las solicitudes compartan la IP 127.0.0.1), el buzón de correos y el enlace hacia ng serve.
 */
@DisplayName("Configuración de los perfiles de producción y desarrollo")
class ConfiguracionPerfilesTest {

    private static PropertySource<?> cargar(String archivo) throws IOException {
        List<PropertySource<?>> fuentes = new YamlPropertySourceLoader().load(archivo, new ClassPathResource(archivo));
        assertThat(fuentes).hasSize(1);
        return fuentes.get(0);
    }

    private static String valor(PropertySource<?> fuente, String clave) {
        Object valor = fuente.getProperty(clave);
        return valor == null ? null : valor.toString();
    }

    @Test
    @DisplayName("Producción: límites en 5, reloj real, sin buzón de correos ni URL fija de enlaces y política 1.0")
    void produccion() throws IOException {
        PropertySource<?> prod = cargar("application.yml");

        assertThat(valor(prod, "sigasp.seguridad.registro.max-por-ip")).isEqualTo("5");
        assertThat(valor(prod, "sigasp.seguridad.recuperacion.max-solicitudes")).isEqualTo("5");
        assertThat(valor(prod, "sigasp.seguridad.login.max-intentos")).isEqualTo("5");
        assertThat(valor(prod, "sigasp.reloj.ajustable")).isEqualTo("false");
        assertThat(valor(prod, "sigasp.dev.buzon-correos")).as("el correo simulado no guarda el token").isNull();
        assertThat(valor(prod, "sigasp.demo.habilitado")).isEqualTo("false");
        assertThat(valor(prod, "sigasp.correo.url-base")).isNull();
        assertThat(valor(prod, "sigasp.privacidad.version")).isEqualTo("1.0");
    }

    @Test
    @DisplayName("Desarrollo: límites de registro y recuperación altos, buzón y reloj simulado, enlaces hacia ng serve")
    void desarrollo() throws IOException {
        PropertySource<?> dev = cargar("application-dev.yml");

        assertThat(Integer.parseInt(valor(dev, "sigasp.seguridad.registro.max-por-ip"))).isGreaterThanOrEqualTo(100);
        assertThat(Integer.parseInt(valor(dev, "sigasp.seguridad.recuperacion.max-solicitudes")))
                .isGreaterThanOrEqualTo(100);
        assertThat(valor(dev, "sigasp.seguridad.login.max-intentos")).as("el bloqueo por cuenta no cambia").isNull();
        assertThat(valor(dev, "sigasp.dev.buzon-correos")).isEqualTo("true");
        assertThat(valor(dev, "sigasp.reloj.ajustable")).isEqualTo("true");
        assertThat(valor(dev, "sigasp.correo.url-base")).isEqualTo("http://localhost:4200");
    }
}
