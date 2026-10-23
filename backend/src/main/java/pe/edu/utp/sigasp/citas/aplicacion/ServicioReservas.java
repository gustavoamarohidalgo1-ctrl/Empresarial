package pe.edu.utp.sigasp.citas.aplicacion;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.agenda.Agenda;
import pe.edu.utp.sigasp.agenda.Horario;
import pe.edu.utp.sigasp.catalogo.CatalogoAtencion;
import pe.edu.utp.sigasp.catalogo.CatalogoAtencion.Especialidad;
import pe.edu.utp.sigasp.catalogo.CatalogoAtencion.Profesional;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaDetalle;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.HorarioReservable;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.Referencia;
import pe.edu.utp.sigasp.citas.dominio.ActorCita;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.HorarioAsignado;
import pe.edu.utp.sigasp.citas.dominio.TipoActor;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasReserva;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasReserva.CitaEnConflicto;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.error.ValidacionException;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Reserva de una cita nueva por el propio paciente.
 * <ul>
 *   <li><b>Disponibilidad</b>: horarios libres de una especialidad (opcionalmente de un profesional) que empiezan
 *       en {@code ahora + sigasp.reglas.anticipacion-reserva} o después.</li>
 *   <li><b>Reserva</b>: misma plantilla que las demás acciones ({@link EjecutorAcciones}: idempotencia,
 *       evento {@code CREADA}, auditoría y registro de rechazos). Reglas, en este orden:
 *       <ol>
 *         <li>la especialidad existe y coincide con la del profesional del horario (si no, 400);</li>
 *         <li>el horario existe y empieza con la anticipación mínima (si no, 409 {@code HORARIO_NO_DISPONIBLE});</li>
 *         <li>límites (422 {@code LIMITE_CITAS}, con un detalle concreto): como máximo 5 citas no terminales,
 *             ninguna cita no terminal cuyo intervalo [inicio, fin) se cruce con el del horario, y una sola de la
 *             especialidad en el mismo día local. Las reservas del mismo paciente se serializan para que dos
 *             simultáneas no superen juntas los límites;</li>
 *         <li>la ocupación del horario es atómica: si otra persona lo tomó, 409 {@code HORARIO_NO_DISPONIBLE}.</li>
 *       </ol></li>
 * </ul>
 */
@Service
public class ServicioReservas {

    /** Máximo de citas no terminales por paciente. */
    public static final int MAX_CITAS_ACTIVAS = 5;
    static final String OPERACION = "CITA_RESERVAR";

    private final EjecutorAcciones ejecutor;
    private final Ensamblador ensamblador;
    private final Agenda agenda;
    private final CatalogoAtencion catalogo;
    private final ConsultasCitas consultas;
    private final ConsultasReserva reserva;
    private final CodigosCita codigos;
    private final Clock reloj;
    private final Duration anticipacion;
    private final DateTimeFormatter fechaHora;

    ServicioReservas(EjecutorAcciones ejecutor, Ensamblador ensamblador, Agenda agenda, CatalogoAtencion catalogo,
            ConsultasCitas consultas, ConsultasReserva reserva, CodigosCita codigos, Clock reloj,
            ReglasCitaProperties propiedades) {
        this.ejecutor = ejecutor;
        this.ensamblador = ensamblador;
        this.agenda = agenda;
        this.catalogo = catalogo;
        this.consultas = consultas;
        this.reserva = reserva;
        this.codigos = codigos;
        this.reloj = reloj;
        this.anticipacion = propiedades.anticipacionReserva();
        this.fechaHora = DateTimeFormatter.ofPattern("dd/MM/yyyy 'a las' HH:mm", Locale.forLanguageTag("es-PE"))
                .withZone(ensamblador.reglas().zona());
    }

    // ------------------------------------------------------------------
    // Disponibilidad
    // ------------------------------------------------------------------

    /**
     * Horarios libres de la especialidad en las fechas locales [desde, hasta] (por defecto, de hoy a hoy + 14;
     * como máximo 31 días incluidos) que empiezan en {@code ahora + anticipación} o después, ordenados por inicio.
     * Consultar no reserva.
     */
    @Transactional(readOnly = true)
    public List<HorarioReservable> disponibilidad(Actor actor, String especialidadCodigo, String profesionalCodigo,
            LocalDate desde, LocalDate hasta) {
        pacienteDe(actor);
        if (especialidadCodigo == null || especialidadCodigo.isBlank()) {
            throw ValidacionException.campo("especialidad", "Selecciona una especialidad.");
        }
        Especialidad especialidad = catalogo.especialidad(especialidadCodigo)
                .orElseThrow(() -> ValidacionException.campo("especialidad", "La especialidad no existe."));
        List<Profesional> profesionales;
        if (profesionalCodigo == null || profesionalCodigo.isBlank()) {
            profesionales = catalogo.profesionales(especialidad.codigo());
        } else {
            Profesional elegido = catalogo.profesional(profesionalCodigo)
                    .filter(p -> p.especialidad().id().equals(especialidad.id()))
                    .orElseThrow(() -> ValidacionException.campo("profesional",
                            "El profesional no atiende la especialidad seleccionada."));
            profesionales = List.of(elegido);
        }

        ZoneId zona = ensamblador.reglas().zona();
        Instant ahora = reloj.instant();
        LocalDate inicio = desde == null ? ahora.atZone(zona).toLocalDate() : desde;
        LocalDate fin = RangoFechas.hasta(inicio, hasta);
        RangoFechas.validar(inicio, fin);

        Map<UUID, Referencia> porProfesional = profesionales.stream()
                .collect(Collectors.toMap(Profesional::id, p -> new Referencia(p.codigo(), p.nombre()),
                        (a, b) -> a, LinkedHashMap::new));
        Map<UUID, Referencia> sedes = new HashMap<>();
        // [desde, hasta) admite el inicio exacto: un horario que empieza justo en ahora + anticipación se ofrece.
        Instant rangoDesde = mayor(inicio.atStartOfDay(zona).toInstant(), primerInicioReservable(ahora));
        return agenda.libres(porProfesional.keySet(), rangoDesde,
                        fin.plusDays(1).atStartOfDay(zona).toInstant(), ahora).stream()
                .map(h -> new HorarioReservable(h.id(), h.inicio(), h.fin(), porProfesional.get(h.profesionalId()),
                        sedes.computeIfAbsent(h.sedeId(), consultas::sede)))
                .toList();
    }

    // ------------------------------------------------------------------
    // Reserva
    // ------------------------------------------------------------------

    public CitaDetalle reservar(Actor actor, UUID clave, UUID horarioId, String especialidadCodigo) {
        UUID paciente = pacienteDe(actor);
        String codigoEspecialidad = especialidadCodigo == null ? "" : especialidadCodigo.trim();
        UUID citaId = citaDe(actor.usuarioId(), clave);
        Map<String, Object> contenido = Map.of("horarioId", String.valueOf(horarioId),
                "especialidad", codigoEspecialidad);
        return ejecutor.registrar(actor, new ActorCita(TipoActor.PACIENTE, actor.usuarioId()), citaId, clave,
                OPERACION, contenido,
                contexto -> {
                    Especialidad especialidad = catalogo.especialidad(codigoEspecialidad)
                            .orElseThrow(() -> ValidacionException.campo("especialidadCodigo",
                                    "Selecciona una especialidad válida."));
                    Horario horario = agenda.buscar(horarioId)
                            .orElseThrow(() -> new ApiException(CodigoError.HORARIO_NO_DISPONIBLE,
                                    "El horario elegido ya no está disponible. Elige otro."));
                    boolean deLaEspecialidad = catalogo.profesional(horario.profesionalId())
                            .map(p -> p.especialidad().id().equals(especialidad.id()))
                            .orElse(false);
                    if (!deLaEspecialidad) {
                        throw ValidacionException.campo("especialidadCodigo",
                                "El horario elegido no corresponde a la especialidad seleccionada.");
                    }
                    if (!horario.inicio().isAfter(contexto.ahora())) {
                        throw new ApiException(CodigoError.HORARIO_NO_DISPONIBLE,
                                "El horario elegido ya pasó. Elige otro.");
                    }
                    Instant primerReservable = primerInicioReservable(contexto.ahora());
                    if (horario.inicio().isBefore(primerReservable)) {
                        throw new ApiException(CodigoError.HORARIO_NO_DISPONIBLE, "Las citas se reservan con al menos "
                                + texto(anticipacion) + " de anticipación. Elige un horario desde el "
                                + fechaHora.format(primerReservable) + ".");
                    }
                    exigirLimites(paciente, especialidad, horario);
                    Horario ocupado = agenda.ocupar(horario.id(), citaId, contexto.ahora())
                            .orElseThrow(() -> new ApiException(CodigoError.HORARIO_NO_DISPONIBLE,
                                    "Otra persona acaba de reservar este horario. Elige otro."));
                    return Cita.registrar(citaId, codigos.siguiente(contexto.ahora()), paciente, especialidad.id(),
                            new HorarioAsignado(ocupado.id(), ocupado.profesionalId(), ocupado.sedeId(),
                                    ocupado.inicio(), ocupado.fin()),
                            contexto);
                },
                CitaDetalle.class,
                (cita, ahora) -> ensamblador.detalle(cita, ahora, TipoActor.PACIENTE));
    }

    /**
     * Límites de la reserva, evaluados con el candado del paciente tomado. Cada rechazo dice qué cita lo causa
     * (especialidad, fecha y hora de Lima), para que el paciente sepa qué hacer.
     */
    private void exigirLimites(UUID paciente, Especialidad especialidad, Horario horario) {
        reserva.bloquearPaciente(paciente);
        if (reserva.activas(paciente) >= MAX_CITAS_ACTIVAS) {
            throw new ApiException(CodigoError.LIMITE_CITAS, "Ya tienes " + MAX_CITAS_ACTIVAS
                    + " citas activas (pendientes, confirmadas o en curso), que es el máximo permitido. Para reservar "
                    + "otra, cancela alguna de tus próximas citas o espera a que se complete una.");
        }
        Optional<CitaEnConflicto> cruce = reserva.activaQueSeCruza(paciente, horario.inicio(), horario.fin());
        if (cruce.isPresent()) {
            throw new ApiException(CodigoError.LIMITE_CITAS, "Ya tienes una cita de " + cruce.get().especialidad()
                    + " el " + fechaHora.format(cruce.get().inicio()) + " que se cruza con este horario.");
        }
        ZoneId zona = ensamblador.reglas().zona();
        LocalDate diaLocal = horario.inicio().atZone(zona).toLocalDate();
        Optional<CitaEnConflicto> mismoDia = reserva.activaDeEspecialidadEntre(paciente, especialidad.id(),
                diaLocal.atStartOfDay(zona).toInstant(), diaLocal.plusDays(1).atStartOfDay(zona).toInstant());
        if (mismoDia.isPresent()) {
            throw new ApiException(CodigoError.LIMITE_CITAS, "Ya tienes una cita de " + mismoDia.get().especialidad()
                    + " el " + fechaHora.format(mismoDia.get().inicio())
                    + ". Solo se permite una cita por especialidad al día.");
        }
    }

    /** Primer instante en que puede empezar un horario reservable. */
    private Instant primerInicioReservable(Instant ahora) {
        return ahora.plus(anticipacion);
    }

    private static Instant mayor(Instant a, Instant b) {
        return a.isAfter(b) ? a : b;
    }

    /** «2 horas», «1 hora», «90 minutos»: la anticipación configurada, en palabras. */
    static String texto(Duration duracion) {
        long minutos = duracion.toMinutes();
        if (minutos > 0 && minutos % 60 == 0) {
            long horas = minutos / 60;
            return horas + (horas == 1 ? " hora" : " horas");
        }
        return minutos + (minutos == 1 ? " minuto" : " minutos");
    }

    /**
     * La cita nueva se identifica por el usuario y la clave de idempotencia: repetir la misma solicitud apunta
     * a la misma cita (y {@code GET /operaciones/{clave}} devuelve su ID como recurso).
     */
    static UUID citaDe(UUID usuarioId, UUID clave) {
        return UUID.nameUUIDFromBytes(("siga-sp:reserva:" + usuarioId + ":" + clave)
                .getBytes(StandardCharsets.UTF_8));
    }

    private static UUID pacienteDe(Actor actor) {
        if (!actor.es(Rol.PACIENTE)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
        return actor.pacienteId();
    }
}
