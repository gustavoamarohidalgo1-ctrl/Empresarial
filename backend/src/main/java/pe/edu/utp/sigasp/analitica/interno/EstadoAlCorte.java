package pe.edu.utp.sigasp.analitica.interno;

/**
 * Los 8 estados del recorrido de una cita, en el orden en que se informan. Replica nombres y
 * etiquetas de {@code citas.dominio.EstadoCita} (interno del módulo citas) para no cruzar la
 * frontera del módulo; {@code EstadosAnaliticaTest} verifica que ambos sigan coincidiendo.
 */
public enum EstadoAlCorte {
    PENDIENTE("Pendiente"),
    CONFIRMADA("Confirmada"),
    CHECK_IN("Llegada registrada"),
    EN_ESPERA("En espera"),
    EN_ATENCION("En atención"),
    COMPLETADA("Completada"),
    CANCELADA("Cancelada"),
    NO_ASISTIO("No asistió");

    private final String etiqueta;

    EstadoAlCorte(String etiqueta) {
        this.etiqueta = etiqueta;
    }

    public String etiqueta() {
        return etiqueta;
    }

    /** Vencida y aún sin clasificar: el cierre por inasistencia todavía no la procesó. */
    public boolean esPreviaALlegada() {
        return this == PENDIENTE || this == CONFIRMADA;
    }
}
