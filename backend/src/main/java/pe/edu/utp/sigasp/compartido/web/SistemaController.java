package pe.edu.utp.sigasp.compartido.web;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Información pública del sistema. El frontend la usa para mostrar la franja de entorno en desarrollo
 * («Entorno de pruebas · datos ficticios»). No expone configuración ni datos internos.
 */
@RestController
@RequestMapping("/api/v1/sistema")
class SistemaController {

    static final String NOMBRE = "SIGA-SP";

    private final InfoSistema info;

    SistemaController(Environment entorno, @Value("${sigasp.version:1.1.0}") String version) {
        // El entorno se fija al arrancar: el perfil "dev" es el único de desarrollo; cualquier otro es producción.
        String nombreEntorno = entorno.acceptsProfiles(Profiles.of("dev")) ? "desarrollo" : "produccion";
        this.info = new InfoSistema(NOMBRE, version, nombreEntorno);
    }

    @GetMapping("/info")
    InfoSistema info() {
        return info;
    }

    record InfoSistema(String nombre, String version, String entorno) {
    }
}
