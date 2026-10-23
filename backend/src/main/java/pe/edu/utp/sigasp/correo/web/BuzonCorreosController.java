package pe.edu.utp.sigasp.correo.web;

import java.util.List;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.correo.interno.BuzonCorreos;
import pe.edu.utp.sigasp.correo.interno.BuzonCorreos.CorreoEnviado;

/**
 * Buzón del correo simulado, para completar la recuperación de contraseña en local. Solo existe con
 * {@code sigasp.dev.buzon-correos=true} (perfil dev): en producción la ruta no tiene controlador y
 * responde 404.
 */
@RestController
@RequestMapping("/api/v1/dev/correos")
@ConditionalOnProperty(name = "sigasp.dev.buzon-correos", havingValue = "true")
class BuzonCorreosController {

    private final BuzonCorreos buzon;

    BuzonCorreosController(BuzonCorreos buzon) {
        this.buzon = buzon;
    }

    /** Contiene enlaces de un solo uso: nunca se guarda en caché. */
    @GetMapping
    ResponseEntity<List<CorreoEnviado>> recientes() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(buzon.recientes());
    }
}
