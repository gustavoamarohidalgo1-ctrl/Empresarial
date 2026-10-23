package pe.edu.utp.sigasp.auditoria;

import java.time.Instant;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Entrada de auditoría: usuario, acción, entidad, referencia, resultado y detalle (RNF06).
 * El detalle nunca debe incluir contraseñas, tokens ni datos clínicos.
 *
 * @param accion     verbo en mayúsculas, por ejemplo {@code CITA_CONFIRMAR} o {@code LOGIN}
 * @param entidad    tipo de entidad afectada, por ejemplo {@code CITA}
 * @param entidadId  referencia de la entidad afectada (puede ser {@code null})
 * @param codigo     código de error cuando el resultado no es EXITO
 * @param operacionId clave de idempotencia de la operación, si la hay
 * @param ocurridoEn  instante de la acción; si es {@code null} se usa el reloj al registrar. Las acciones
 *                    sobre citas pasan el mismo instante del evento, para que evento y auditoría coincidan.
 */
public record RegistroAuditoria(
        String accion,
        String entidad,
        String entidadId,
        ResultadoAuditoria resultado,
        String codigo,
        UUID operacionId,
        Map<String, Object> detalle,
        Instant ocurridoEn) {

    public RegistroAuditoria {
        Objects.requireNonNull(accion, "accion");
        Objects.requireNonNull(entidad, "entidad");
        Objects.requireNonNull(resultado, "resultado");
        detalle = detalle == null ? Map.of() : Map.copyOf(detalle);
    }

    public RegistroAuditoria(String accion, String entidad, String entidadId, ResultadoAuditoria resultado,
            String codigo, UUID operacionId, Map<String, Object> detalle) {
        this(accion, entidad, entidadId, resultado, codigo, operacionId, detalle, null);
    }

    /** Copia con el instante explícito de la acción. */
    public RegistroAuditoria en(Instant instante) {
        return new RegistroAuditoria(accion, entidad, entidadId, resultado, codigo, operacionId, detalle, instante);
    }

    public static RegistroAuditoria exito(String accion, String entidad, Object entidadId, UUID operacionId,
            Map<String, Object> detalle) {
        return new RegistroAuditoria(accion, entidad, texto(entidadId), ResultadoAuditoria.EXITO, null,
                operacionId, detalle);
    }

    public static RegistroAuditoria noExitoso(String accion, String entidad, Object entidadId,
            ResultadoAuditoria resultado, String codigo, UUID operacionId) {
        return new RegistroAuditoria(accion, entidad, texto(entidadId), resultado, codigo, operacionId, Map.of());
    }

    private static String texto(Object valor) {
        return valor == null ? null : valor.toString();
    }
}
