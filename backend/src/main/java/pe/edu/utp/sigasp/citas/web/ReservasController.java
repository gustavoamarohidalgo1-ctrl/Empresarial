package pe.edu.utp.sigasp.citas.web;

import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.citas.aplicacion.ServicioReservas;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaDetalle;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.HorarioReservable;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;

/** Reserva de citas nuevas por el paciente: disponibilidad por especialidad y alta idempotente. */
@RestController
@RequestMapping("/api/v1/pacientes/me")
class ReservasController {

    private final ServicioReservas reservas;
    private final ActorActual actorActual;

    ReservasController(ServicioReservas reservas, ActorActual actorActual) {
        this.reservas = reservas;
        this.actorActual = actorActual;
    }

    @GetMapping("/disponibilidad")
    List<HorarioReservable> disponibilidad(
            @RequestParam(required = false) String especialidad,
            @RequestParam(required = false) String profesional,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return reservas.disponibilidad(actorActual.requerido(), especialidad, profesional, desde, hasta);
    }

    /** 201 con el detalle de la cita creada (Pendiente, versión 1) y su ubicación. */
    @PostMapping("/citas")
    ResponseEntity<CitaDetalle> reservar(@RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudReserva solicitud) {
        CitaDetalle cita = reservas.reservar(actorActual.requerido(), ClaveIdempotencia.leer(clave),
                solicitud.horarioId(), solicitud.especialidadCodigo());
        return ResponseEntity.created(URI.create("/api/v1/pacientes/me/citas/" + cita.id())).body(cita);
    }

    record SolicitudReserva(
            @NotNull(message = "Selecciona un horario") UUID horarioId,
            @NotBlank(message = "Selecciona una especialidad") @Size(max = 20) String especialidadCodigo) {
    }
}
