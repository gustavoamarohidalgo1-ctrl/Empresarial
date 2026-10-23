package pe.edu.utp.sigasp.compartido;

import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.modulith.events.IncompleteEventPublications;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Reintenta los eventos entre módulos que no se completaron (por ejemplo, si el oyente de
 * notificaciones falló). Los oyentes son idempotentes, así que reentregar es seguro. Al reiniciar,
 * Spring Modulith también republica los pendientes ({@code republish-outstanding-events-on-restart}).
 */
@Component
@ConditionalOnProperty(name = "sigasp.tareas.habilitadas", havingValue = "true", matchIfMissing = true)
class ReintentoEventos {

    private final IncompleteEventPublications pendientes;
    private final Duration antiguedad;

    ReintentoEventos(IncompleteEventPublications pendientes,
            @Value("${sigasp.eventos.reintentar-despues-de:PT5M}") Duration antiguedad) {
        this.pendientes = pendientes;
        this.antiguedad = antiguedad;
    }

    @Scheduled(fixedDelayString = "${sigasp.eventos.intervalo-reintento:PT5M}",
            initialDelayString = "${sigasp.eventos.intervalo-reintento:PT5M}")
    void reintentar() {
        pendientes.resubmitIncompletePublicationsOlderThan(antiguedad);
    }
}
