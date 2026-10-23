package pe.edu.utp.sigasp.citas.dominio;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.Objects;

/**
 * Parámetros temporales del piloto (por validar con la clínica).
 * <p>
 * Ventana de llegada: {@code [inicio − llegadaAntes, inicio + llegadaDespues)} y el mismo día local.
 * El cierre por inasistencia es elegible desde {@code inicio + llegadaDespues}: ambas fronteras
 * coinciden en un mismo instante y no se solapan (el límite superior de la llegada es exclusivo).
 */
public record ReglasTiempo(Duration llegadaAntes, Duration llegadaDespues, ZoneId zona) {

    public static final ReglasTiempo POR_DEFECTO =
            new ReglasTiempo(Duration.ofMinutes(60), Duration.ofMinutes(30), ZoneId.of("America/Lima"));

    public ReglasTiempo {
        Objects.requireNonNull(llegadaAntes, "llegadaAntes");
        Objects.requireNonNull(llegadaDespues, "llegadaDespues");
        Objects.requireNonNull(zona, "zona");
        if (llegadaAntes.isNegative() || llegadaDespues.isNegative()) {
            throw new IllegalArgumentException("Las ventanas no pueden ser negativas");
        }
    }

    public Instant aperturaLlegada(Instant inicio) {
        return inicio.minus(llegadaAntes);
    }

    /** Primer instante en que ya no se admite llegada y la cita puede cerrarse como No asistió. */
    public Instant cierreLlegada(Instant inicio) {
        return inicio.plus(llegadaDespues);
    }

    public boolean mismoDiaLocal(Instant a, Instant b) {
        return a.atZone(zona).toLocalDate().equals(b.atZone(zona).toLocalDate());
    }
}
