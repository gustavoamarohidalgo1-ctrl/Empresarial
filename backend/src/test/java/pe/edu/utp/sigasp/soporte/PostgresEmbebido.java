package pe.edu.utp.sigasp.soporte;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicBoolean;

import org.springframework.boot.SpringApplication;
import org.springframework.test.context.DynamicPropertyRegistry;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;

/**
 * PostgreSQL real embebido para las pruebas (no requiere Docker ni una instalación local).
 * Se inicia una sola vez por JVM y lo comparten todos los contextos de prueba.
 * <p>
 * Se detiene al terminar la JVM, <b>después</b> de cerrar los contextos de Spring: lo hace un manejador de cierre de
 * Spring Boot, que corre cuando ya se cerraron todos. Antes lo detenía un gancho de la JVM (el propio de zonky),
 * que corre en paralelo con el de Spring: PostgreSQL se detenía primero y, al cerrar cada contexto, Spring Modulith
 * (que busca las publicaciones de eventos incompletas) esperaba 30 s una conexión. Surefire avisaba «The exit has
 * elapsed 30 seconds after System.exit(0)» y mataba la JVM.
 */
public final class PostgresEmbebido {

    /** Respaldo si Spring no llegara a ejecutar sus manejadores de cierre. */
    private static final Duration ESPERA_RESPALDO = Duration.ofSeconds(20);

    private static EmbeddedPostgres instancia;
    private static final AtomicBoolean detenido = new AtomicBoolean();

    private PostgresEmbebido() {
    }

    public static synchronized EmbeddedPostgres instancia() {
        if (instancia == null) {
            try {
                instancia = EmbeddedPostgres.builder()
                        .setServerConfig("timezone", "UTC")
                        .setRegisterShutdownHook(false)
                        .start();
            } catch (IOException ex) {
                throw new UncheckedIOException("No se pudo iniciar PostgreSQL embebido", ex);
            }
            SpringApplication.getShutdownHandlers().add(PostgresEmbebido::detener);
            Runtime.getRuntime().addShutdownHook(new Thread(PostgresEmbebido::detenerSiSpringNoLoHizo,
                    "postgres-embebido-respaldo"));
        }
        return instancia;
    }

    public static void registrar(DynamicPropertyRegistry propiedades) {
        EmbeddedPostgres pg = instancia();
        propiedades.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", "postgres"));
        propiedades.add("spring.datasource.username", () -> "postgres");
        propiedades.add("spring.datasource.password", () -> "");
    }

    private static void detener() {
        if (detenido.compareAndSet(false, true)) {
            try {
                instancia.close();
            } catch (IOException ignorada) {
                // El proceso termina de todos modos.
            }
        }
    }

    /** Normalmente ya lo detuvo Spring; si no, se espera un poco y se detiene igual (no quedan procesos huérfanos). */
    private static void detenerSiSpringNoLoHizo() {
        long limite = System.nanoTime() + ESPERA_RESPALDO.toNanos();
        while (!detenido.get() && System.nanoTime() < limite) {
            try {
                Thread.sleep(100);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                break;
            }
        }
        detener();
    }
}
