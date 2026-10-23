package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Clock;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.agenda.Agenda;
import pe.edu.utp.sigasp.agenda.Horario;
import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.citas.dominio.ActorCita;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.Contexto;
import pe.edu.utp.sigasp.citas.dominio.HorarioAsignado;
import pe.edu.utp.sigasp.citas.persistencia.CitaRepository;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Alta de citas a partir de un horario de la agenda, sin actor de paciente (la registra el sistema). La usan
 * los datos de demostración; la sincronización con la agenda externa simulada (PB28) la reutilizará. La
 * reserva del propio paciente está en {@link ServicioReservas}. En ambos casos el código sigue el formato
 * {@code SP-AAAA-NNNNNN}.
 */
@Service
public class RegistroCitas {

    private final CitaRepository citas;
    private final Agenda agenda;
    private final Ensamblador ensamblador;
    private final Auditoria auditoria;
    private final ApplicationEventPublisher eventos;
    private final CodigosCita codigos;
    private final Clock reloj;

    RegistroCitas(CitaRepository citas, Agenda agenda, Ensamblador ensamblador, Auditoria auditoria,
            ApplicationEventPublisher eventos, CodigosCita codigos, Clock reloj) {
        this.citas = citas;
        this.codigos = codigos;
        this.agenda = agenda;
        this.ensamblador = ensamblador;
        this.auditoria = auditoria;
        this.eventos = eventos;
        this.reloj = reloj;
    }

    /** Datos para registrar una cita sobre un horario libre. El código lo asigna el sistema. */
    public record NuevaCita(UUID id, UUID pacienteId, UUID especialidadId, UUID horarioId) {
        public NuevaCita {
            Objects.requireNonNull(id, "id");
            Objects.requireNonNull(pacienteId, "pacienteId");
            Objects.requireNonNull(especialidadId, "especialidadId");
            Objects.requireNonNull(horarioId, "horarioId");
        }
    }

    @Transactional
    public UUID registrar(NuevaCita nueva) {
        var ahora = reloj.instant();
        Horario horario = agenda.ocupar(nueva.horarioId(), nueva.id(), ahora)
                .orElseThrow(() -> new ApiException(CodigoError.HORARIO_NO_DISPONIBLE));
        Contexto contexto = new Contexto(ahora, ActorCita.SISTEMA, ensamblador.reglas(), null);
        Cita cita = Cita.registrar(nueva.id(), codigos.siguiente(ahora), nueva.pacienteId(), nueva.especialidadId(),
                new HorarioAsignado(horario.id(), horario.profesionalId(), horario.sedeId(), horario.inicio(),
                        horario.fin()),
                contexto);
        citas.saveAndFlush(cita);
        eventos.publishEvent(ensamblador.eventoIntegracion(cita));
        auditoria.registrar(RegistroAuditoria.exito("CITA_REGISTRAR", "CITA", cita.id(), null,
                Map.of("codigo", cita.codigo())), Optional.empty());
        return cita.id();
    }
}
