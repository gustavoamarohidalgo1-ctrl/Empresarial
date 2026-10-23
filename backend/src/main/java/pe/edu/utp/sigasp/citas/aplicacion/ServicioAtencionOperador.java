package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaOperador;
import pe.edu.utp.sigasp.citas.dominio.ActorCita;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.TipoActor;
import pe.edu.utp.sigasp.citas.persistencia.CitaRepository;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas.FilaCita;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Casos de uso del operador sobre las citas de sus profesionales asignados: registrar llegada
 * y avanzar el recorrido (En espera → En atención → Completada). Cada acción envía la versión
 * de la cita que vio el operador; si cambió, se rechaza sin sobrescribir (LF07).
 */
@Service
public class ServicioAtencionOperador {

    /** Acciones que el operador puede solicitar por la API. */
    public enum AccionOperador {
        REGISTRAR_LLEGADA,
        PASAR_A_ESPERA,
        INICIAR_ATENCION,
        COMPLETAR
    }

    private final CitaRepository citas;
    private final ConsultasCitas consultas;
    private final Ensamblador ensamblador;
    private final EjecutorAcciones ejecutor;
    private final Clock reloj;

    ServicioAtencionOperador(CitaRepository citas, ConsultasCitas consultas, Ensamblador ensamblador,
            EjecutorAcciones ejecutor, Clock reloj) {
        this.citas = citas;
        this.consultas = consultas;
        this.ensamblador = ensamblador;
        this.ejecutor = ejecutor;
        this.reloj = reloj;
    }

    @Transactional(readOnly = true)
    public List<CitaOperador> delDia(Actor actor, LocalDate fecha) {
        exigirOperador(actor);
        ZoneId zona = ensamblador.reglas().zona();
        Instant ahora = reloj.instant();
        LocalDate dia = fecha == null ? ahora.atZone(zona).toLocalDate() : fecha;
        List<FilaCita> filas = consultas.deOperador(actor.usuarioId(), dia.atStartOfDay(zona).toInstant(),
                dia.plusDays(1).atStartOfDay(zona).toInstant());
        Map<UUID, Cita> porId = citas.buscarTodas(filas.stream().map(FilaCita::id).toList()).stream()
                .collect(Collectors.toMap(Cita::id, Function.identity()));
        return filas.stream()
                .map(fila -> ensamblador.operador(porId.get(fila.id()), fila, ahora))
                .toList();
    }

    public CitaOperador ejecutar(Actor actor, UUID citaId, UUID clave, AccionOperador accion, long versionCita) {
        exigirOperador(actor);
        return ejecutor.ejecutar(actor, new ActorCita(TipoActor.OPERADOR, actor.usuarioId()), citaId, clave,
                "CITA_OPERADOR_" + accion.name(), Map.of("accion", accion.name(), "versionCita", versionCita),
                id -> citaAsignada(actor, id),
                (cita, contexto) -> {
                    if (cita.version() == null || cita.version() != versionCita) {
                        throw new ApiException(CodigoError.VERSION_OBSOLETA);
                    }
                    switch (accion) {
                        case REGISTRAR_LLEGADA -> cita.registrarLlegada(contexto, null);
                        case PASAR_A_ESPERA -> cita.pasarAEspera(contexto);
                        case INICIAR_ATENCION -> cita.iniciarAtencion(contexto);
                        case COMPLETAR -> cita.completar(contexto);
                    }
                },
                CitaOperador.class,
                (cita, ahora) -> ensamblador.operador(cita, consultas.fila(cita.id()).orElseThrow(), ahora));
    }

    private Cita citaAsignada(Actor actor, UUID citaId) {
        Optional<Cita> cita = citas.bloquear(citaId)
                .filter(c -> consultas.operadorAsignado(actor.usuarioId(), c.versionVigente().profesionalId()));
        // Una cita de otro profesional se audita como acceso denegado tras cerrar la transacción.
        return cita.orElseThrow(() -> citas.existsById(citaId)
                ? new CitaAjenaException(citaId)
                : new ApiException(CodigoError.CITA_NO_ENCONTRADA));
    }

    private static void exigirOperador(Actor actor) {
        if (!actor.es(Rol.OPERADOR)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
    }
}
