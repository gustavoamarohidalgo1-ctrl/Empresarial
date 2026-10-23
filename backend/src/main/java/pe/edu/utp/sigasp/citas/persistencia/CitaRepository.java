package pe.edu.utp.sigasp.citas.persistencia;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

import pe.edu.utp.sigasp.citas.dominio.Cita;

/**
 * Carga del agregado {@link Cita}.
 * <p>
 * La llegada es un uno-a-uno inverso ({@code mappedBy}): Hibernate no puede cargarlo de forma
 * perezosa ni por lotes, así que sin {@code join fetch} lanza una consulta por cada cita. Las
 * consultas de lectura lo traen en la misma sentencia. Las colecciones (versiones, eventos,
 * pre-check-ins) se inicializan por lotes ({@code hibernate.default_batch_fetch_size}): una sola
 * sentencia por colección para todas las citas de la sesión, sin multiplicar filas.
 */
public interface CitaRepository extends JpaRepository<Cita, UUID> {

    /** Busca la cita solo si pertenece al paciente: la propiedad se valida en la consulta. */
    @Query("select c from Cita c left join fetch c.llegada where c.id = ?1 and c.pacienteId = ?2")
    Optional<Cita> buscarDePaciente(UUID citaId, UUID pacienteId);

    /**
     * Como {@link #buscarDePaciente}, pero bloquea la fila para modificarla: dos cambios simultáneos
     * sobre la misma cita se serializan y el segundo evalúa las reglas con el estado ya confirmado
     * (sin esto, ambos insertan el evento con la misma secuencia y el perdedor falla con un 500).
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Cita c where c.id = ?1 and c.pacienteId = ?2")
    Optional<Cita> bloquearDePaciente(UUID citaId, UUID pacienteId);

    /** Carga la cita bloqueando su fila para modificarla (ver {@link #bloquearDePaciente}). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select c from Cita c where c.id = ?1")
    Optional<Cita> bloquear(UUID citaId);

    /** Varias citas con su llegada en una sola sentencia (panel del operador). */
    @Query("select c from Cita c left join fetch c.llegada where c.id in ?1")
    List<Cita> buscarTodas(Collection<UUID> ids);
}
