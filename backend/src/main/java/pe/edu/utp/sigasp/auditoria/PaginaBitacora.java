package pe.edu.utp.sigasp.auditoria;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Página de la bitácora (contrato de {@code GET /api/v1/admin/auditoria}).
 *
 * @param elementos entradas de la página, de la más reciente a la más antigua
 * @param pagina    página devuelta (desde 0)
 * @param tamano    tamaño de página solicitado
 * @param total     entradas que cumplen los filtros
 * @param acciones  acciones distintas registradas, en orden alfabético (para el filtro)
 */
public record PaginaBitacora(List<Entrada> elementos, int pagina, int tamano, long total, List<String> acciones) {

    /** Entrada de la bitácora. {@code actor} es {@code null} en las acciones del sistema. */
    public record Entrada(long id, Instant ocurridoEn, ActorBitacora actor, String accion, String entidad,
            String entidadId, ResultadoAuditoria resultado, String codigo, String requestId) {
    }

    /** Actor de la entrada: su nombre visible y el rol que tenía al actuar. */
    public record ActorBitacora(UUID id, String nombre, String rol) {
    }
}
