package pe.edu.utp.sigasp.citas.aplicacion;

import java.util.Optional;
import java.util.function.Supplier;

import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;

/**
 * Límites transaccionales de los casos de uso de citas.
 * <p>
 * Los registros "independientes" (accesos denegados, rechazos) se escriben <b>después</b> de que la
 * transacción principal terminó y liberó su conexión. Si se escribieran desde dentro, cada solicitud
 * retendría dos conexiones y una ráfaga de solicitudes podría agotar el pool y bloquear el servicio.
 */
@Component
class Transacciones {

    private final TransactionTemplate escritura;
    private final TransactionTemplate lectura;
    private final Auditoria auditoria;

    Transacciones(PlatformTransactionManager transacciones, Auditoria auditoria) {
        this.escritura = new TransactionTemplate(transacciones);
        this.lectura = new TransactionTemplate(transacciones);
        this.lectura.setReadOnly(true);
        this.auditoria = auditoria;
    }

    /** Ejecuta una consulta; si la cita es ajena, audita el intento tras cerrar la transacción. */
    <T> T leer(Actor actor, Supplier<T> consulta) {
        try {
            return lectura.execute(estado -> consulta.get());
        } catch (CitaAjenaException ex) {
            auditarAccesoAjeno(actor, ex);
            throw ex;
        }
    }

    <T> T escribir(Supplier<T> cambio) {
        return escritura.execute(estado -> cambio.get());
    }

    void auditarAccesoAjeno(Actor actor, CitaAjenaException ex) {
        auditoria.registrarIndependiente(RegistroAuditoria.noExitoso("CITA_ACCESO", "CITA", ex.citaId(),
                ResultadoAuditoria.DENEGADO, CodigoError.CITA_NO_ENCONTRADA.name(), null), Optional.of(actor));
    }
}
