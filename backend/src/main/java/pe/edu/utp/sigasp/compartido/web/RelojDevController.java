package pe.edu.utp.sigasp.compartido.web;

import java.time.Instant;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;

/**
 * Reloj de negocio simulado (solo con {@code sigasp.reloj.ajustable=true}, es decir, perfil dev, y para el rol
 * ADMINISTRADOR). Permite probar ventanas de llegada, recordatorios e inasistencias sin esperar horas reales.
 * <p>
 * No mueve el reloj de seguridad ({@link pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad}): bloqueos por intentos,
 * límites y vigencia de los enlaces de recuperación siguen la hora real. En producción el controlador no existe y
 * {@code /api/v1/dev/**} responde 404 a todos.
 */
@RestController
@RequestMapping("/api/v1/dev/reloj")
@ConditionalOnProperty(name = "sigasp.reloj.ajustable", havingValue = "true")
class RelojDevController {

    private final RelojAjustable reloj;

    RelojDevController(RelojAjustable reloj) {
        this.reloj = reloj;
    }

    @GetMapping
    EstadoReloj consultar() {
        return new EstadoReloj(reloj.instant(), reloj.esSimulado());
    }

    @PutMapping
    EstadoReloj fijar(@RequestBody CambioReloj cambio) {
        reloj.fijar(cambio.ahora());
        return consultar();
    }

    record CambioReloj(Instant ahora) {
    }

    record EstadoReloj(Instant ahora, boolean simulado) {
    }
}
