package pe.edu.utp.sigasp.citas.dominio;

/** Estados del recorrido de una cita (tabla 7 del documento del proyecto). */
public enum EstadoCita {
    PENDIENTE("Pendiente", false),
    CONFIRMADA("Confirmada", false),
    CHECK_IN("Llegada registrada", false),
    EN_ESPERA("En espera", false),
    EN_ATENCION("En atención", false),
    COMPLETADA("Completada", true),
    CANCELADA("Cancelada", true),
    NO_ASISTIO("No asistió", true);

    private final String etiqueta;
    private final boolean terminal;

    EstadoCita(String etiqueta, boolean terminal) {
        this.etiqueta = etiqueta;
        this.terminal = terminal;
    }

    public String etiqueta() {
        return etiqueta;
    }

    /** Cancelada, Completada y No asistió no admiten nuevos pasos del recorrido. */
    public boolean esTerminal() {
        return terminal;
    }

    /** Estados en los que aún no hay llegada: Pendiente o Confirmada. */
    public boolean esPreviaALlegada() {
        return this == PENDIENTE || this == CONFIRMADA;
    }
}
