package pe.edu.utp.sigasp.operaciones.web;

import java.time.Instant;
import java.util.UUID;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import pe.edu.utp.sigasp.operaciones.Idempotencia;
import pe.edu.utp.sigasp.operaciones.OperacionRegistrada;

/**
 * Permite comprobar una operación cuya respuesta se perdió. Un 404 significa que la operación
 * no se registró: el cliente puede reintentar con la misma clave sin riesgo de duplicar.
 */
@RestController
@RequestMapping("/api/v1/operaciones")
class OperacionesController {

    private final Idempotencia idempotencia;
    private final ActorActual actorActual;

    OperacionesController(Idempotencia idempotencia, ActorActual actorActual) {
        this.idempotencia = idempotencia;
        this.actorActual = actorActual;
    }

    @GetMapping("/{clave}")
    EstadoOperacionRespuesta consultar(@PathVariable UUID clave) {
        return idempotencia.consultar(clave, actorActual.requerido().usuarioId())
                .map(EstadoOperacionRespuesta::de)
                .orElseThrow(() -> new ApiException(CodigoError.RECURSO_NO_ENCONTRADO,
                        "La operación no está registrada. Puedes reintentarla con la misma clave."));
    }

    record EstadoOperacionRespuesta(String clave, String tipo, String recursoId, String estado, int httpStatus,
            String codigoError, Instant registradaEn) {

        static EstadoOperacionRespuesta de(OperacionRegistrada op) {
            return new EstadoOperacionRespuesta(op.clave().toString(), op.tipo(), op.recursoId().toString(),
                    op.estado().name(), op.httpStatus(), op.codigoError(), op.registradaEn());
        }
    }
}
