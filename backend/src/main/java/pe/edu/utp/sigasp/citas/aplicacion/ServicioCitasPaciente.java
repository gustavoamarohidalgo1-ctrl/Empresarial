package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.agenda.Agenda;
import pe.edu.utp.sigasp.agenda.Horario;
import pe.edu.utp.sigasp.catalogo.Motivos;
import pe.edu.utp.sigasp.catalogo.TipoMotivo;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.Alcance;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaDetalle;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaResumen;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.EventoLineaTiempo;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.HorarioDisponible;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.Referencia;
import pe.edu.utp.sigasp.citas.dominio.AccionCita;
import pe.edu.utp.sigasp.citas.dominio.ActorCita;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.EstadoCita;
import pe.edu.utp.sigasp.citas.dominio.HorarioAsignado;
import pe.edu.utp.sigasp.citas.dominio.TipoActor;
import pe.edu.utp.sigasp.citas.dominio.VersionAgenda;
import pe.edu.utp.sigasp.citas.persistencia.CitaRepository;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Casos de uso del paciente sobre sus propias citas. La identidad llega siempre de la sesión;
 * una cita ajena responde igual que una inexistente y queda auditada como acceso denegado.
 */
@Service
public class ServicioCitasPaciente {

    private static final EnumSet<EstadoCita> NO_TERMINALES = EnumSet.of(EstadoCita.PENDIENTE,
            EstadoCita.CONFIRMADA, EstadoCita.CHECK_IN, EstadoCita.EN_ESPERA, EstadoCita.EN_ATENCION);
    private static final EnumSet<EstadoCita> TERMINALES = EnumSet.of(EstadoCita.COMPLETADA, EstadoCita.CANCELADA,
            EstadoCita.NO_ASISTIO);

    private final CitaRepository citas;
    private final ConsultasCitas consultas;
    private final Ensamblador ensamblador;
    private final EjecutorAcciones ejecutor;
    private final Agenda agenda;
    private final Motivos motivos;
    private final Transacciones transacciones;
    private final Clock reloj;

    ServicioCitasPaciente(CitaRepository citas, ConsultasCitas consultas, Ensamblador ensamblador,
            EjecutorAcciones ejecutor, Agenda agenda, Motivos motivos, Transacciones transacciones, Clock reloj) {
        this.citas = citas;
        this.consultas = consultas;
        this.ensamblador = ensamblador;
        this.ejecutor = ejecutor;
        this.agenda = agenda;
        this.motivos = motivos;
        this.transacciones = transacciones;
        this.reloj = reloj;
    }

    // ------------------------------------------------------------------
    // Consultas
    // ------------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<CitaResumen> listar(Actor actor, Alcance alcance) {
        UUID paciente = pacienteDe(actor);
        boolean proximas = alcance == Alcance.PROXIMAS;
        return consultas.dePaciente(paciente, proximas ? NO_TERMINALES : TERMINALES, proximas).stream()
                .map(ensamblador::resumen)
                .toList();
    }

    public CitaDetalle detalle(Actor actor, UUID citaId) {
        return transacciones.leer(actor, () ->
                ensamblador.detalle(citaPropia(actor, citaId), reloj.instant(), TipoActor.PACIENTE));
    }

    public List<EventoLineaTiempo> lineaTiempo(Actor actor, UUID citaId) {
        return transacciones.leer(actor, () -> ensamblador.lineaTiempo(citaPropia(actor, citaId)));
    }

    /** Horarios libres del mismo profesional en el rango de fechas locales [desde, hasta]. */
    public List<HorarioDisponible> horariosDisponibles(Actor actor, UUID citaId, LocalDate desde, LocalDate hasta) {
        return transacciones.leer(actor, () -> horariosDe(citaPropia(actor, citaId), desde, hasta));
    }

    private List<HorarioDisponible> horariosDe(Cita cita, LocalDate desde, LocalDate hasta) {
        Instant ahora = reloj.instant();
        LocalDate hoy = ahora.atZone(ensamblador.reglas().zona()).toLocalDate();
        LocalDate inicio = desde == null ? hoy : desde;
        LocalDate fin = RangoFechas.hasta(inicio, hasta);
        RangoFechas.validar(inicio, fin);
        VersionAgenda vigente = cita.versionVigente();
        Instant rangoDesde = inicio.atStartOfDay(ensamblador.reglas().zona()).toInstant();
        Instant rangoHasta = fin.plusDays(1).atStartOfDay(ensamblador.reglas().zona()).toInstant();
        // Pocas sedes y un solo profesional: se resuelven una vez, no por cada franja.
        Map<UUID, Referencia> sedes = new HashMap<>();
        Map<UUID, Referencia> profesionales = new HashMap<>();
        return agenda.libres(vigente.profesionalId(), rangoDesde, rangoHasta, ahora).stream()
                .map(h -> new HorarioDisponible(h.id(), h.inicio(), h.fin(),
                        sedes.computeIfAbsent(h.sedeId(), consultas::sede),
                        profesionales.computeIfAbsent(h.profesionalId(), consultas::profesional)))
                .toList();
    }

    // ------------------------------------------------------------------
    // Acciones
    // ------------------------------------------------------------------

    public CitaDetalle confirmar(Actor actor, UUID citaId, UUID clave, int versionAgenda) {
        return ejecutar(actor, citaId, clave, "CITA_CONFIRMAR", Map.of("versionAgenda", versionAgenda),
                (cita, contexto) -> cita.confirmar(contexto, versionAgenda));
    }

    public CitaDetalle cancelar(Actor actor, UUID citaId, UUID clave, int versionAgenda, String motivoCodigo) {
        return ejecutar(actor, citaId, clave, "CITA_CANCELAR",
                Map.of("versionAgenda", versionAgenda, "motivo", String.valueOf(motivoCodigo)),
                (cita, contexto) -> {
                    exigirVersion(cita, versionAgenda);
                    exigirMotivo(motivoCodigo, TipoMotivo.CANCELACION);
                    cita.cancelar(contexto, versionAgenda, motivoCodigo);
                    agenda.liberar(cita.id());
                });
    }

    /**
     * Libera el horario actual y ocupa el nuevo en la misma transacción. Si el nuevo ya fue
     * tomado, la transacción se revierte y la cita conserva íntegro su horario original.
     */
    public CitaDetalle reprogramar(Actor actor, UUID citaId, UUID clave, int versionAgenda, UUID horarioId,
            String motivoCodigo) {
        return ejecutar(actor, citaId, clave, "CITA_REPROGRAMAR",
                Map.of("versionAgenda", versionAgenda, "horarioId", String.valueOf(horarioId),
                        "motivo", String.valueOf(motivoCodigo)),
                (cita, contexto) -> {
                    exigirVersion(cita, versionAgenda);
                    exigirMotivo(motivoCodigo, TipoMotivo.REPROGRAMACION);
                    cita.impedimento(AccionCita.REPROGRAMAR, TipoActor.PACIENTE, contexto.ahora(), contexto.reglas())
                            .ifPresent(codigo -> {
                                throw new ApiException(codigo);
                            });
                    UUID profesional = cita.versionVigente().profesionalId();
                    agenda.liberar(cita.id());
                    Horario nuevo = agenda.ocupar(horarioId, cita.id(), contexto.ahora())
                            .orElseThrow(() -> new ApiException(CodigoError.HORARIO_NO_DISPONIBLE));
                    if (!nuevo.profesionalId().equals(profesional)) {
                        throw new ApiException(CodigoError.HORARIO_NO_DISPONIBLE,
                                "El horario elegido no corresponde al profesional de la cita.");
                    }
                    cita.reprogramar(contexto, versionAgenda, new HorarioAsignado(nuevo.id(), nuevo.profesionalId(),
                            nuevo.sedeId(), nuevo.inicio(), nuevo.fin()), motivoCodigo);
                });
    }

    public CitaDetalle completarPreCheckIn(Actor actor, UUID citaId, UUID clave, int versionAgenda, String email,
            String telefono, boolean datosCorrectos) {
        return ejecutar(actor, citaId, clave, "CITA_PRE_CHECK_IN",
                Map.of("versionAgenda", versionAgenda, "email", email, "telefono", telefono,
                        "datosCorrectos", datosCorrectos),
                (cita, contexto) -> cita.completarPreCheckIn(contexto, versionAgenda, email.trim(), telefono.trim(),
                        datosCorrectos));
    }

    public CitaDetalle registrarLlegada(Actor actor, UUID citaId, UUID clave, int versionAgenda) {
        return ejecutar(actor, citaId, clave, "CITA_REGISTRAR_LLEGADA", Map.of("versionAgenda", versionAgenda),
                (cita, contexto) -> cita.registrarLlegada(contexto, versionAgenda));
    }

    // ------------------------------------------------------------------
    // Apoyo
    // ------------------------------------------------------------------

    private CitaDetalle ejecutar(Actor actor, UUID citaId, UUID clave, String tipo, Object contenido,
            EjecutorAcciones.AccionSobreCita accion) {
        pacienteDe(actor);
        return ejecutor.ejecutar(actor, new ActorCita(TipoActor.PACIENTE, actor.usuarioId()), citaId, clave, tipo,
                contenido, id -> citaPropia(actor, id, true), accion, CitaDetalle.class,
                (cita, ahora) -> ensamblador.detalle(cita, ahora, TipoActor.PACIENTE));
    }

    private Cita citaPropia(Actor actor, UUID citaId) {
        return citaPropia(actor, citaId, false);
    }

    /** @param paraModificar bloquea la fila de la cita hasta el fin de la transacción */
    private Cita citaPropia(Actor actor, UUID citaId, boolean paraModificar) {
        UUID paciente = pacienteDe(actor);
        Optional<Cita> propia = paraModificar
                ? citas.bloquearDePaciente(citaId, paciente)
                : citas.buscarDePaciente(citaId, paciente);
        return propia.orElseThrow(() -> citas.existsById(citaId)
                ? new CitaAjenaException(citaId)
                : new ApiException(CodigoError.CITA_NO_ENCONTRADA));
    }

    /** La versión se valida antes que el motivo y la regla (orden documentado en docs/reglas-dominio.md). */
    private static void exigirVersion(Cita cita, int versionAgenda) {
        if (cita.versionAgendaVigente() != versionAgenda) {
            throw new ApiException(CodigoError.VERSION_OBSOLETA);
        }
    }

    private void exigirMotivo(String codigo, TipoMotivo tipo) {
        if (motivos.activo(codigo, tipo).isEmpty()) {
            throw new ApiException(CodigoError.MOTIVO_INVALIDO);
        }
    }

    private static UUID pacienteDe(Actor actor) {
        if (!actor.es(Rol.PACIENTE)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
        return actor.pacienteId();
    }
}
