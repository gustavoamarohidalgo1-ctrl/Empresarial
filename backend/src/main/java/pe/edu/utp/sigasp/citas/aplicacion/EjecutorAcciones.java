package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.citas.dominio.ActorCita;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.Contexto;
import pe.edu.utp.sigasp.citas.persistencia.CitaRepository;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.operaciones.Idempotencia;
import pe.edu.utp.sigasp.operaciones.SolicitudIdempotente;

/**
 * Plantilla común de toda acción que cambia una cita. Es el límite transaccional del caso de uso.
 * <ol>
 *   <li>En una transacción: idempotencia → carga y bloqueo de la cita (verificando propiedad) → regla de
 *       dominio → flush → evento de integración → auditoría de éxito → resultado de la operación.</li>
 *   <li>Después de la transacción, ya liberada su conexión: si hubo un rechazo de negocio, se guarda para
 *       la idempotencia y se audita; si la cita era ajena, se audita el acceso denegado.</li>
 * </ol>
 */
@Component
class EjecutorAcciones {

    private static final int HTTP_OK = 200;
    private static final int HTTP_CREATED = 201;

    private final Idempotencia idempotencia;
    private final CitaRepository citas;
    private final Auditoria auditoria;
    private final ApplicationEventPublisher eventos;
    private final Ensamblador ensamblador;
    private final Transacciones transacciones;
    private final Clock reloj;

    EjecutorAcciones(Idempotencia idempotencia, CitaRepository citas, Auditoria auditoria,
            ApplicationEventPublisher eventos, Ensamblador ensamblador, Transacciones transacciones, Clock reloj) {
        this.idempotencia = idempotencia;
        this.citas = citas;
        this.auditoria = auditoria;
        this.eventos = eventos;
        this.ensamblador = ensamblador;
        this.transacciones = transacciones;
        this.reloj = reloj;
    }

    /**
     * @param tipoOperacion tipo de operación para la idempotencia y la auditoría (p. ej. CITA_CONFIRMAR)
     * @param contenido     datos de la solicitud (definen la huella de la operación)
     * @param cargar        obtiene y bloquea la cita verificando que el actor puede operar sobre ella;
     *                      lanza {@link CitaAjenaException} si existe pero no le corresponde
     * @param accion        aplica la regla de dominio
     * @param respuesta     construye la respuesta a partir de la cita ya modificada
     */
    <T> T ejecutar(Actor actor, ActorCita actorCita, UUID citaId, UUID clave, String tipoOperacion,
            Object contenido, Function<UUID, Cita> cargar, AccionSobreCita accion, Class<T> tipoRespuesta,
            RespuestaDeCita<T> respuesta) {
        return enTransaccion(actor, actorCita, citaId, clave, tipoOperacion, contenido, HTTP_OK, contexto -> {
            Cita cita = cargar.apply(citaId);
            accion.aplicar(cita, contexto);
            return cita;
        }, tipoRespuesta, respuesta);
    }

    /**
     * Alta de una cita con la misma plantilla (idempotencia, evento, auditoría y registro de rechazos).
     *
     * @param citaId identificador de la cita que se creará; debe derivarse de la solicitud (no al azar) para
     *               que repetir la misma clave sea reconocida como la misma operación
     * @param crear  valida las reglas, ocupa el horario y construye el agregado (aún sin persistir)
     */
    <T> T registrar(Actor actor, ActorCita actorCita, UUID citaId, UUID clave, String tipoOperacion,
            Object contenido, Function<Contexto, Cita> crear, Class<T> tipoRespuesta, RespuestaDeCita<T> respuesta) {
        return enTransaccion(actor, actorCita, citaId, clave, tipoOperacion, contenido, HTTP_CREATED, contexto -> {
            Cita cita = crear.apply(contexto);
            citas.save(cita);
            return cita;
        }, tipoRespuesta, respuesta);
    }

    private <T> T enTransaccion(Actor actor, ActorCita actorCita, UUID citaId, UUID clave, String tipoOperacion,
            Object contenido, int httpStatus, Function<Contexto, Cita> paso, Class<T> tipoRespuesta,
            RespuestaDeCita<T> respuesta) {
        Instant ahora = reloj.instant();
        Contexto contexto = new Contexto(ahora, actorCita, ensamblador.reglas(), clave);
        SolicitudIdempotente solicitud =
                new SolicitudIdempotente(clave, actor.usuarioId(), tipoOperacion, citaId, contenido);
        try {
            return transacciones.escribir(() -> idempotencia.ejecutar(solicitud, tipoRespuesta, httpStatus, () -> {
                Cita cita = paso.apply(contexto);
                // La cita ya está administrada por JPA: basta con sincronizar (save() haría un merge).
                citas.flush();
                eventos.publishEvent(ensamblador.eventoIntegracion(cita));
                auditoria.registrar(RegistroAuditoria.exito(tipoOperacion, "CITA", cita.id(), clave,
                        ensamblador.detalleAuditoria(cita)).en(ahora), Optional.of(actor));
                return respuesta.construir(cita, ahora);
            }));
        } catch (CitaAjenaException ex) {
            transacciones.auditarAccesoAjeno(actor, ex);
            throw ex;
        } catch (ApiException ex) {
            if (ex.codigo().esRechazoDeNegocio()) {
                idempotencia.registrarRechazo(solicitud, ex);
                auditoria.registrarIndependiente(RegistroAuditoria.noExitoso(tipoOperacion, "CITA", citaId,
                        ResultadoAuditoria.RECHAZO, ex.codigo().name(), clave).en(ahora), Optional.of(actor));
            }
            throw ex;
        }
    }

    @FunctionalInterface
    interface AccionSobreCita {
        void aplicar(Cita cita, Contexto contexto);
    }

    @FunctionalInterface
    interface RespuestaDeCita<T> {
        T construir(Cita cita, Instant ahora);
    }
}
