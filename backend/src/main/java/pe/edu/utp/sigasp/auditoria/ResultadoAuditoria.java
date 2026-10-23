package pe.edu.utp.sigasp.auditoria;

/** Resultado de una acción auditada. */
public enum ResultadoAuditoria {
    /** La acción se ejecutó y su cambio quedó persistido. */
    EXITO,
    /** Una regla del negocio rechazó la acción; no hubo cambios. */
    RECHAZO,
    /** Falta de autenticación, de permiso o de propiedad sobre el recurso. */
    DENEGADO,
    /** Fallo técnico (por ejemplo, un envío simulado que falló). */
    FALLO
}
