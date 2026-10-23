package pe.edu.utp.sigasp.compartido.reloj;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Reloj del sistema que puede "detenerse" en un instante simulado. Se usa como reloj de negocio en desarrollo
 * (para demostrar ventanas de llegada, recordatorios e inasistencias) y en las pruebas. En producción se usa un
 * {@link Clock#systemUTC()} sin esta posibilidad. El reloj de seguridad ({@link RelojSeguridad}) es otro: fuera de las pruebas, siempre la hora real.
 */
public class RelojAjustable extends Clock {

    private final Clock base;
    private final AtomicReference<Instant> simulado = new AtomicReference<>();

    public RelojAjustable(Clock base) {
        this.base = Objects.requireNonNull(base);
    }

    public static RelojAjustable delSistema() {
        return new RelojAjustable(Clock.systemUTC());
    }

    /** Fija la hora simulada; {@code null} vuelve a la hora real. */
    public void fijar(Instant instante) {
        simulado.set(instante);
    }

    public boolean esSimulado() {
        return simulado.get() != null;
    }

    @Override
    public Instant instant() {
        Instant fijo = simulado.get();
        return fijo != null ? fijo : base.instant();
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        throw new UnsupportedOperationException("El reloj de SIGA-SP siempre opera en UTC");
    }
}
