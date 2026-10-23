package pe.edu.utp.sigasp.soporte;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

import org.junit.jupiter.api.AfterEach;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.jayway.jsonpath.JsonPath;

/**
 * Atajos para las pruebas de integración de la API: acciones del paciente y del operador,
 * lectura del cuerpo JSON, consultas de verificación sobre la BD y ejecución concurrente.
 */
public abstract class PruebaApi extends PruebaIntegracion {

    protected static final String CITAS = "/api/v1/pacientes/me/citas";
    protected static final String OPERADOR = "/api/v1/operador/citas";

    // ------------------------------------------------------------------
    // Acciones por la API
    // ------------------------------------------------------------------

    protected MvcTestResult confirmar(MockHttpSession sesion, UUID cita, int versionAgenda) {
        return confirmar(sesion, cita, versionAgenda, UUID.randomUUID());
    }

    protected MvcTestResult confirmar(MockHttpSession sesion, UUID cita, int versionAgenda, UUID clave) {
        return post(sesion, CITAS + "/" + cita + "/confirmacion", "{\"versionAgenda\":" + versionAgenda + "}", clave);
    }

    protected MvcTestResult cancelar(MockHttpSession sesion, UUID cita, int versionAgenda, String motivo) {
        return cancelar(sesion, cita, versionAgenda, motivo, UUID.randomUUID());
    }

    protected MvcTestResult cancelar(MockHttpSession sesion, UUID cita, int versionAgenda, String motivo, UUID clave) {
        return post(sesion, CITAS + "/" + cita + "/cancelacion",
                "{\"versionAgenda\":" + versionAgenda + ",\"motivoCodigo\":\"" + motivo + "\"}", clave);
    }

    protected MvcTestResult reprogramar(MockHttpSession sesion, UUID cita, int versionAgenda, UUID horario,
            String motivo) {
        return reprogramar(sesion, cita, versionAgenda, horario, motivo, UUID.randomUUID());
    }

    protected MvcTestResult reprogramar(MockHttpSession sesion, UUID cita, int versionAgenda, UUID horario,
            String motivo, UUID clave) {
        return post(sesion, CITAS + "/" + cita + "/reprogramacion", "{\"versionAgenda\":" + versionAgenda
                + ",\"horarioId\":\"" + horario + "\",\"motivoCodigo\":\"" + motivo + "\"}", clave);
    }

    protected MvcTestResult preCheckIn(MockHttpSession sesion, UUID cita, int versionAgenda, boolean datosCorrectos) {
        return post(sesion, CITAS + "/" + cita + "/pre-check-in", "{\"versionAgenda\":" + versionAgenda
                + ",\"email\":\"ana.precheckin@ejemplo.invalid\",\"telefono\":\"+51 900 111 222\""
                + ",\"datosCorrectos\":" + datosCorrectos + "}");
    }

    protected MvcTestResult llegada(MockHttpSession sesion, UUID cita, int versionAgenda) {
        return post(sesion, CITAS + "/" + cita + "/llegada", "{\"versionAgenda\":" + versionAgenda + "}");
    }

    protected MvcTestResult transicion(MockHttpSession sesion, UUID cita, String accion, long versionCita) {
        return transicion(sesion, cita, accion, versionCita, UUID.randomUUID());
    }

    protected MvcTestResult transicion(MockHttpSession sesion, UUID cita, String accion, long versionCita,
            UUID clave) {
        return post(sesion, OPERADOR + "/" + cita + "/transiciones",
                "{\"accion\":\"" + accion + "\",\"versionCita\":" + versionCita + "}", clave);
    }

    protected MvcTestResult detalle(MockHttpSession sesion, UUID cita) {
        return get(sesion, CITAS + "/" + cita);
    }

    // ------------------------------------------------------------------
    // Respuestas
    // ------------------------------------------------------------------

    protected static String cuerpo(MvcTestResult resultado) {
        try {
            return resultado.getResponse().getContentAsString(StandardCharsets.UTF_8);
        } catch (java.io.UnsupportedEncodingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    /** Lee un valor del cuerpo JSON con JsonPath. */
    protected static <T> T valor(MvcTestResult resultado, String ruta) {
        return JsonPath.read(cuerpo(resultado), ruta);
    }

    protected static long numero(MvcTestResult resultado, String ruta) {
        return ((Number) valor(resultado, ruta)).longValue();
    }

    protected static void esperarError(MvcTestResult resultado, HttpStatus estado, String codigo) {
        assertThat(resultado).hasStatus(estado)
                .bodyJson().extractingPath("$.codigo").isEqualTo(codigo);
    }

    // ------------------------------------------------------------------
    // Verificaciones en la BD
    // ------------------------------------------------------------------

    protected String estado(UUID cita) {
        return jdbc.sql("SELECT estado FROM cita WHERE id = ?").params(cita).query(String.class).single();
    }

    protected int versionAgenda(UUID cita) {
        return jdbc.sql("SELECT version_agenda_vigente FROM cita WHERE id = ?").params(cita)
                .query(Integer.class).single();
    }

    protected long versionCita(UUID cita) {
        return jdbc.sql("SELECT version FROM cita WHERE id = ?").params(cita).query(Long.class).single();
    }

    /** Horario que ocupa la cita en la agenda, o {@code null} si no ocupa ninguno. */
    protected UUID horarioDe(UUID cita) {
        return jdbc.sql("SELECT id FROM horario WHERE cita_id = ?").params(cita).query(UUID.class)
                .optional().orElse(null);
    }

    /** Cita que ocupa el horario, o {@code null} si está libre. */
    protected UUID ocupanteDe(UUID horario) {
        return jdbc.sql("SELECT cita_id FROM horario WHERE id = ?").params(horario).query(UUID.class)
                .optional().orElse(null);
    }

    /** Horario de la versión de agenda vigente de la cita. */
    protected UUID horarioVigente(UUID cita) {
        return jdbc.sql("SELECT horario_id FROM cita_version_agenda WHERE cita_id = ? AND vigente_hasta IS NULL")
                .params(cita).query(UUID.class).single();
    }

    /** Tipos de evento de la línea de tiempo en orden de secuencia. */
    protected List<String> tiposEvento(UUID cita) {
        return jdbc.sql("SELECT tipo FROM cita_evento WHERE cita_id = ? ORDER BY secuencia").params(cita)
                .query(String.class).list();
    }

    protected long eventos(UUID cita, String tipo) {
        return contar("SELECT count(*) FROM cita_evento WHERE cita_id = ? AND tipo = ?", cita, tipo);
    }

    protected long auditorias(String accion, String resultado, UUID entidad) {
        return contar("SELECT count(*) FROM auditoria WHERE accion = ? AND resultado = ? AND entidad_id = ?",
                accion, resultado, entidad.toString());
    }

    protected Instant instante(String sql, Object... parametros) {
        return jdbc.sql(sql).params(parametros).query((rs, i) -> rs.getTimestamp(1)).optional()
                .map(Timestamp::toInstant).orElse(null);
    }

    // ------------------------------------------------------------------
    // Oyentes de eventos
    // ------------------------------------------------------------------

    /**
     * Espera a que terminen los oyentes de eventos de integración (avisos, invalidación de
     * recordatorios). Aunque las pruebas desactivan {@code sigasp.tareas.habilitadas}, Spring Modulith
     * habilita {@code @EnableAsync} por su cuenta ({@code AsyncEnablingConfiguration}), así que los
     * oyentes {@code @ApplicationModuleListener} corren en otro hilo tras el commit. Cada publicación
     * queda en {@code event_publication} y se marca completada al terminar su oyente.
     */
    protected void esperarOyentes() {
        if (!oyentesTerminados(Duration.ofSeconds(10))) {
            throw new AssertionError("Los oyentes de eventos no terminaron en 10 s");
        }
        assertThat(contar("SELECT count(*) FROM event_publication WHERE status = 'FAILED'"))
                .as("publicaciones de eventos fallidas").isZero();
    }

    /** Evita que un oyente rezagado de esta prueba corra mientras la siguiente vacía la BD. */
    @AfterEach
    void esperarOyentesRezagados() {
        oyentesTerminados(Duration.ofSeconds(5));
    }

    private boolean oyentesTerminados(Duration espera) {
        long limite = System.nanoTime() + espera.toNanos();
        while (contar("SELECT count(*) FROM event_publication WHERE completion_date IS NULL "
                + "AND (status IS NULL OR status <> 'FAILED')") > 0) {
            if (System.nanoTime() > limite) {
                return false;
            }
            try {
                Thread.sleep(10);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return true;
    }

    // ------------------------------------------------------------------
    // Concurrencia
    // ------------------------------------------------------------------

    /**
     * Ejecuta las solicitudes en hilos distintos y las libera a la vez con un {@link CountDownLatch};
     * devuelve los resultados en el mismo orden de las tareas.
     */
    @SafeVarargs
    protected static List<MvcTestResult> simultaneas(Supplier<MvcTestResult>... tareas) throws Exception {
        ExecutorService hilos = Executors.newFixedThreadPool(tareas.length);
        CountDownLatch listos = new CountDownLatch(tareas.length);
        CountDownLatch salida = new CountDownLatch(1);
        try {
            List<Future<MvcTestResult>> futuros = new ArrayList<>();
            for (Supplier<MvcTestResult> tarea : tareas) {
                futuros.add(hilos.submit(() -> {
                    listos.countDown();
                    salida.await();
                    return tarea.get();
                }));
            }
            assertThat(listos.await(10, TimeUnit.SECONDS)).as("los hilos quedaron listos").isTrue();
            salida.countDown();
            List<MvcTestResult> resultados = new ArrayList<>();
            for (Future<MvcTestResult> futuro : futuros) {
                resultados.add(futuro.get(60, TimeUnit.SECONDS));
            }
            return resultados;
        } finally {
            hilos.shutdownNow();
        }
    }
}
