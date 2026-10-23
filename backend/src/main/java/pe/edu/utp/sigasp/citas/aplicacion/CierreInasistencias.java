package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.citas.dominio.AccionCita;
import pe.edu.utp.sigasp.citas.dominio.ActorCita;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.Contexto;
import pe.edu.utp.sigasp.citas.dominio.TipoActor;
import pe.edu.utp.sigasp.citas.persistencia.CitaRepository;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas;

/**
 * Cierre automático por inasistencia: marca No asistió las citas Pendientes o Confirmadas sin
 * llegada cuya ventana venció. Cada cita se procesa en su propia transacción; si en ese mismo
 * momento se registra la llegada, el bloqueo de la fila (y, de respaldo, el control optimista)
 * deja confirmarse solo una de las dos.
 */
@Service
public class CierreInasistencias {

    private static final Logger log = LoggerFactory.getLogger(CierreInasistencias.class);
    private static final int LOTE = 200;

    private final ConsultasCitas consultas;
    private final CitaRepository citas;
    private final Ensamblador ensamblador;
    private final Auditoria auditoria;
    private final ApplicationEventPublisher eventos;
    private final Clock reloj;
    private final TransactionTemplate transaccion;

    CierreInasistencias(ConsultasCitas consultas, CitaRepository citas, Ensamblador ensamblador, Auditoria auditoria,
            ApplicationEventPublisher eventos, Clock reloj, PlatformTransactionManager transacciones) {
        this.consultas = consultas;
        this.citas = citas;
        this.ensamblador = ensamblador;
        this.auditoria = auditoria;
        this.eventos = eventos;
        this.reloj = reloj;
        this.transaccion = new TransactionTemplate(transacciones);
    }

    @Scheduled(fixedDelayString = "${sigasp.reglas.intervalo-cierre:PT1M}",
            initialDelayString = "${sigasp.reglas.intervalo-cierre:PT1M}")
    void programado() {
        int cerradas = ejecutar();
        if (cerradas > 0) {
            log.info("Cierre por inasistencia: {} citas marcadas como No asistió", cerradas);
        }
    }

    /** Ejecuta un ciclo de cierre y devuelve cuántas citas cerró. */
    public int ejecutar() {
        Instant ahora = reloj.instant();
        Instant limite = ahora.minus(ensamblador.reglas().llegadaDespues());
        List<UUID> candidatas = consultas.vencidasSinLlegada(limite, LOTE);
        int cerradas = 0;
        for (UUID id : candidatas) {
            try {
                Boolean cerrada = transaccion.execute(estado -> cerrar(id, ahora));
                if (Boolean.TRUE.equals(cerrada)) {
                    cerradas++;
                }
            } catch (OptimisticLockingFailureException ex) {
                log.info("La cita {} cambió durante el cierre (p. ej., se registró su llegada); se omite", id);
            }
        }
        return cerradas;
    }

    private boolean cerrar(UUID citaId, Instant ahora) {
        // Bloquea la fila: si en ese momento se registra la llegada, una espera a la otra y la
        // regla se evalúa con el estado ya confirmado (la cita con llegada se omite).
        Cita cita = citas.bloquear(citaId).orElse(null);
        if (cita == null) {
            return false;
        }
        Contexto contexto = new Contexto(ahora, ActorCita.SISTEMA, ensamblador.reglas(), null);
        if (cita.impedimento(AccionCita.MARCAR_NO_ASISTIO, TipoActor.SISTEMA, ahora, contexto.reglas()).isPresent()) {
            return false;
        }
        cita.marcarNoAsistio(contexto);
        // La cita ya está administrada por JPA: basta con sincronizar (save() haría un merge).
        citas.flush();
        eventos.publishEvent(ensamblador.eventoIntegracion(cita));
        auditoria.registrar(RegistroAuditoria.exito("CITA_MARCAR_NO_ASISTIO", "CITA", cita.id(), null,
                Map.of("codigo", cita.codigo())), Optional.empty());
        return true;
    }
}
