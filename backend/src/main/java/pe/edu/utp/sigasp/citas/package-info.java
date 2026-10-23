/**
 * M2 · Gestión de citas (incluida la reserva por el paciente, v1.1), M3 · Pre-atención y
 * M4 · Llegada y turno. Toda cita nueva recibe un código {@code SP-AAAA-NNNNNN}.
 * <p>
 * El dominio ({@code dominio}) concentra la máquina de estados; {@code aplicacion} orquesta
 * los casos de uso con idempotencia, agenda y auditoría; {@code web} expone la API.
 * Hacia otros módulos solo se publican eventos ({@link pe.edu.utp.sigasp.citas.CitaActualizada})
 * y consultas de solo lectura.
 */
@ApplicationModule(displayName = "Citas")
package pe.edu.utp.sigasp.citas;

import org.springframework.modulith.ApplicationModule;
