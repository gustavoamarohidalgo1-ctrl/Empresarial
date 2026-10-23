package pe.edu.utp.sigasp.citas.web;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.citas.aplicacion.ServicioAtencionOperador;
import pe.edu.utp.sigasp.citas.aplicacion.ServicioAtencionOperador.AccionOperador;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaOperador;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;

/** Panel del operador: citas del día de sus profesionales asignados y avance del recorrido. */
@RestController
@RequestMapping("/api/v1/operador/citas")
class OperadorCitasController {

    private final ServicioAtencionOperador servicio;
    private final ActorActual actorActual;

    OperadorCitasController(ServicioAtencionOperador servicio, ActorActual actorActual) {
        this.servicio = servicio;
        this.actorActual = actorActual;
    }

    @GetMapping
    List<CitaOperador> delDia(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate fecha) {
        return servicio.delDia(actorActual.requerido(), fecha);
    }

    @PostMapping("/{id}/transiciones")
    CitaOperador transicion(@PathVariable UUID id, @RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudTransicion solicitud) {
        return servicio.ejecutar(actorActual.requerido(), id, ClaveIdempotencia.leer(clave), solicitud.accion(),
                solicitud.versionCita());
    }

    record SolicitudTransicion(
            @NotNull(message = "Indica la acción") AccionOperador accion,
            @NotNull(message = "Indica la versión de la cita") @PositiveOrZero Long versionCita) {
    }
}
