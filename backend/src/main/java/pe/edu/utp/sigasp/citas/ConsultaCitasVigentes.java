package pe.edu.utp.sigasp.citas;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Consultas de solo lectura que el módulo de citas ofrece a otros módulos. */
public interface ConsultaCitasVigentes {

    /** Citas en Pendiente o Confirmada cuya hora vigente está en [desde, hasta). */
    List<CitaVigente> previasALlegadaConInicioEntre(Instant desde, Instant hasta);

    /** Una cita con su versión de agenda vigente, en cualquier estado (para redactar avisos). */
    Optional<CitaVigente> buscar(UUID citaId);
}
