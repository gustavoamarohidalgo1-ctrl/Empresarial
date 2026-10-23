package pe.edu.utp.sigasp.auditoria;

import java.time.LocalDate;

/**
 * Criterios de búsqueda en la bitácora. Todos los filtros son opcionales y se combinan con «y».
 *
 * @param desde     primer día local incluido (zona de la sede)
 * @param hasta     último día local incluido
 * @param accion    acción exacta, por ejemplo {@code CITA_CONFIRMAR}
 * @param resultado resultado de la acción
 * @param usuario   correo exacto del actor (sin distinguir mayúsculas)
 * @param pagina    número de página, desde 0
 * @param tamano    elementos por página, de 1 a {@link ConsultaBitacora#TAMANO_MAXIMO}
 */
public record FiltroBitacora(LocalDate desde, LocalDate hasta, String accion, ResultadoAuditoria resultado,
        String usuario, int pagina, int tamano) {
}
