package pe.edu.utp.sigasp.citas.web;

import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.citas.aplicacion.ServicioCitasPaciente;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.Alcance;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaDetalle;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaResumen;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.EventoLineaTiempo;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.HorarioDisponible;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;

/** API del paciente sobre sus propias citas. Nunca recibe el ID del paciente: lo toma de la sesión. */
@RestController
@RequestMapping("/api/v1/pacientes/me/citas")
class PacienteCitasController {

    private final ServicioCitasPaciente servicio;
    private final ActorActual actorActual;

    PacienteCitasController(ServicioCitasPaciente servicio, ActorActual actorActual) {
        this.servicio = servicio;
        this.actorActual = actorActual;
    }

    @GetMapping
    List<CitaResumen> listar(@RequestParam(defaultValue = "proximas") String alcance) {
        return servicio.listar(actorActual.requerido(), alcance(alcance));
    }

    @GetMapping("/{id}")
    CitaDetalle detalle(@PathVariable UUID id) {
        return servicio.detalle(actorActual.requerido(), id);
    }

    @GetMapping("/{id}/linea-tiempo")
    List<EventoLineaTiempo> lineaTiempo(@PathVariable UUID id) {
        return servicio.lineaTiempo(actorActual.requerido(), id);
    }

    @GetMapping("/{id}/horarios-disponibles")
    List<HorarioDisponible> horariosDisponibles(@PathVariable UUID id,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta) {
        return servicio.horariosDisponibles(actorActual.requerido(), id, desde, hasta);
    }

    @PostMapping("/{id}/confirmacion")
    CitaDetalle confirmar(@PathVariable UUID id, @RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudVersion solicitud) {
        return servicio.confirmar(actorActual.requerido(), id, ClaveIdempotencia.leer(clave),
                solicitud.versionAgenda());
    }

    @PostMapping("/{id}/cancelacion")
    CitaDetalle cancelar(@PathVariable UUID id, @RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudCancelacion solicitud) {
        return servicio.cancelar(actorActual.requerido(), id, ClaveIdempotencia.leer(clave),
                solicitud.versionAgenda(), solicitud.motivoCodigo());
    }

    @PostMapping("/{id}/reprogramacion")
    CitaDetalle reprogramar(@PathVariable UUID id, @RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudReprogramacion solicitud) {
        return servicio.reprogramar(actorActual.requerido(), id, ClaveIdempotencia.leer(clave),
                solicitud.versionAgenda(), solicitud.horarioId(), solicitud.motivoCodigo());
    }

    @PostMapping("/{id}/pre-check-in")
    CitaDetalle preCheckIn(@PathVariable UUID id, @RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudPreCheckIn solicitud) {
        return servicio.completarPreCheckIn(actorActual.requerido(), id, ClaveIdempotencia.leer(clave),
                solicitud.versionAgenda(), solicitud.email(), solicitud.telefono(), solicitud.datosCorrectos());
    }

    @PostMapping("/{id}/llegada")
    CitaDetalle llegada(@PathVariable UUID id, @RequestHeader(ClaveIdempotencia.CABECERA) String clave,
            @Valid @RequestBody SolicitudVersion solicitud) {
        return servicio.registrarLlegada(actorActual.requerido(), id, ClaveIdempotencia.leer(clave),
                solicitud.versionAgenda());
    }

    private static Alcance alcance(String valor) {
        try {
            return Alcance.valueOf(valor.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new ApiException(CodigoError.VALIDACION, "El alcance debe ser 'proximas' o 'historial'.");
        }
    }

    record SolicitudVersion(@NotNull(message = "Indica la versión de agenda") @Min(1) Integer versionAgenda) {
    }

    record SolicitudCancelacion(
            @NotNull(message = "Indica la versión de agenda") @Min(1) Integer versionAgenda,
            @NotBlank(message = "Selecciona un motivo") @Size(max = 30) String motivoCodigo) {
    }

    record SolicitudReprogramacion(
            @NotNull(message = "Indica la versión de agenda") @Min(1) Integer versionAgenda,
            @NotNull(message = "Selecciona un horario") UUID horarioId,
            @NotBlank(message = "Selecciona un motivo") @Size(max = 30) String motivoCodigo) {
    }

    record SolicitudPreCheckIn(
            @NotNull(message = "Indica la versión de agenda") @Min(1) Integer versionAgenda,
            @NotBlank(message = "Ingresa un correo") @Email(message = "Formato de correo inválido")
            @Size(max = 160) String email,
            @NotBlank(message = "Ingresa un teléfono")
            @Pattern(regexp = "^\\+?[0-9](?: ?[0-9]){6,19}$", message = "Formato de teléfono inválido")
            @Size(max = 30) String telefono,
            @NotNull(message = "Indica si tus datos son correctos") Boolean datosCorrectos) {
    }
}
