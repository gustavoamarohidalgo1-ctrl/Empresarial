package pe.edu.utp.sigasp.notificaciones.web;

import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import pe.edu.utp.sigasp.notificaciones.BandejaPaciente;
import pe.edu.utp.sigasp.notificaciones.BandejaPaciente.NoLeidas;
import pe.edu.utp.sigasp.notificaciones.BandejaPaciente.NotificacionPaciente;

/** Centro de notificaciones del paciente en sesión (recordatorios y avisos de sus citas). */
@RestController
@RequestMapping("/api/v1/pacientes/me/notificaciones")
class NotificacionesPacienteController {

    private final BandejaPaciente bandeja;
    private final ActorActual actorActual;

    NotificacionesPacienteController(BandejaPaciente bandeja, ActorActual actorActual) {
        this.bandeja = bandeja;
        this.actorActual = actorActual;
    }

    @GetMapping
    List<NotificacionPaciente> listar(
            @RequestParam(defaultValue = "" + BandejaPaciente.LIMITE_POR_DEFECTO) int limite) {
        return bandeja.listar(actorActual.requerido(), limite);
    }

    @GetMapping("/no-leidas")
    NoLeidas noLeidas() {
        return bandeja.noLeidas(actorActual.requerido());
    }

    /** Idempotente: no requiere Idempotency-Key. */
    @PostMapping("/{id}/lectura")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void marcarLeida(@PathVariable UUID id) {
        bandeja.marcarLeida(actorActual.requerido(), id);
    }

    /** Marca todas como leídas. Idempotente. */
    @PostMapping("/lectura")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void marcarTodas() {
        bandeja.marcarTodas(actorActual.requerido());
    }
}
