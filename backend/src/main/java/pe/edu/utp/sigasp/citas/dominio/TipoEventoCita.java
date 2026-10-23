package pe.edu.utp.sigasp.citas.dominio;

/** Eventos de la línea de tiempo. REPROGRAMADA es un evento, no un estado estable. */
public enum TipoEventoCita {
    CREADA,
    CONFIRMADA,
    CANCELADA,
    REPROGRAMADA,
    PRE_CHECK_IN_COMPLETADO,
    LLEGADA_REGISTRADA,
    EN_ESPERA,
    EN_ATENCION,
    COMPLETADA,
    NO_ASISTIO
}
