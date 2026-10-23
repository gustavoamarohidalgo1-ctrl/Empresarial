package pe.edu.utp.sigasp.demo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import io.zonky.test.db.postgres.embedded.EmbeddedPostgres;
import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;
import pe.edu.utp.sigasp.demo.DatosDemo.DatosAntiguosException;
import pe.edu.utp.sigasp.soporte.PostgresEmbebido;

/**
 * S1-R06 · Datos de demostración: la carga es idempotente, rápida, no deja relaciones huérfanas y produce
 * datos verosímiles (nombres sin «Demo», proporciones realistas, todos los estados del recorrido, historia
 * rica de Ana y un día lleno para la operadora), siempre por los casos de uso del sistema. Con datos de la v1.0
 * en la BD, el arranque se detiene.
 * <p>
 * Usa una base de datos propia ({@value #BASE_DEDICADA}) en el PostgreSQL embebido: la carga corre al arrancar el
 * contexto y la BD compartida tiene las cuentas {@code @ejemplo.invalid} de las demás pruebas, que la carga trata
 * como datos de la v1.0.
 */
@SpringBootTest(properties = {"sigasp.demo.habilitado=true", "sigasp.demo.password=Clave-Demo-Prueba-2026"})
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@DisplayName("S1-R06 · Datos de demostración realistas")
class DatosDemoIntegracionTest {

    /** Miércoles 04/11/2026, 11:30 en Lima: un día laborable a media mañana. */
    private static final Instant AHORA = Instant.parse("2026-11-04T16:30:00Z");
    private static final Duration MAXIMO_CARGA = Duration.ofSeconds(15);
    private static final List<String> TABLAS = List.of("usuario", "paciente", "profesional", "especialidad", "sede",
            "operador_profesional", "horario", "cita", "cita_version_agenda", "cita_evento", "pre_check_in",
            "registro_llegada");
    private static final String HOY_LIMA = "(v.inicio AT TIME ZONE 'America/Lima')::date = DATE '2026-11-04'";
    private static final String NO_TERMINALES = "('PENDIENTE', 'CONFIRMADA', 'CHECK_IN', 'EN_ESPERA', 'EN_ATENCION')";
    static final String BASE_DEDICADA = "siga_sp_demo";
    private static boolean baseCreada;

    @DynamicPropertySource
    static void baseDeDatos(DynamicPropertyRegistry propiedades) {
        EmbeddedPostgres pg = PostgresEmbebido.instancia();
        crearBaseDedicada(pg);
        propiedades.add("spring.datasource.url", () -> pg.getJdbcUrl("postgres", BASE_DEDICADA));
        propiedades.add("spring.datasource.username", () -> "postgres");
        propiedades.add("spring.datasource.password", () -> "");
    }

    private static synchronized void crearBaseDedicada(EmbeddedPostgres pg) {
        if (baseCreada) {
            return;
        }
        try (Connection conexion = pg.getPostgresDatabase().getConnection();
                Statement sentencia = conexion.createStatement()) {
            sentencia.execute("DROP DATABASE IF EXISTS " + BASE_DEDICADA);
            sentencia.execute("CREATE DATABASE " + BASE_DEDICADA);
            baseCreada = true;
        } catch (SQLException ex) {
            throw new IllegalStateException("No se pudo crear la BD de la prueba de datos de demostración", ex);
        }
    }

    @Autowired
    private DatosDemo datosDemo;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private RelojAjustable reloj;

    private Duration duracion;
    private Map<String, Long> primera;

    @BeforeAll
    void cargar() {
        // El contexto ya ejecutó la carga al arrancar (con la hora real) en su BD propia: se espera a sus oyentes, se
        // parte de cero y se carga con un reloj fijo y reproducible.
        esperarEventos();
        jdbc.sql("""
                TRUNCATE auditoria, operacion, notificacion, encuesta, registro_llegada, pre_check_in, cita_evento,
                         cita_version_agenda, horario, cita, operador_profesional, token_recuperacion, usuario,
                         paciente, profesional, especialidad, sede, correo_simulado, event_publication
                RESTART IDENTITY CASCADE
                """).update();
        reloj.fijar(AHORA);
        long inicio = System.nanoTime();
        datosDemo.run(null);
        duracion = Duration.ofNanos(System.nanoTime() - inicio);
        primera = conteos();
    }

    @AfterAll
    void liberarReloj() {
        esperarEventos();
        reloj.fijar(null);
    }

    @Test
    @DisplayName("La carga tarda menos de 15 s, no omite pasos y repetirla no duplica nada")
    void cargaIdempotenteYRapida() {
        assertThat(duracion).as("duración de la carga").isLessThan(MAXIMO_CARGA);
        assertThat(datosDemo.pasosOmitidos()).as("pasos rechazados por una regla").isZero();
        assertThat(reloj.instant()).as("el reloj vuelve a su estado previo").isEqualTo(AHORA);

        datosDemo.run(null);

        assertThat(conteos()).isEqualTo(primera);
        assertThat(contar("SELECT count(*) FROM cita c LEFT JOIN paciente p ON p.id = c.paciente_id "
                + "WHERE p.id IS NULL")).as("citas huérfanas").isZero();
        assertThat(contar("SELECT count(*) FROM cita c LEFT JOIN cita_version_agenda v ON v.cita_id = c.id "
                + "AND v.vigente_hasta IS NULL WHERE v.id IS NULL")).as("citas sin versión vigente").isZero();
    }

    @Test
    @DisplayName("Catálogo y personas: 2 sedes con dirección, 8 especialidades descritas, 14 profesionales, 12 pacientes")
    void catalogoYPersonas() {
        assertThat(primera).containsEntry("sede", 2L).containsEntry("especialidad", 8L)
                .containsEntry("profesional", 14L).containsEntry("paciente", 12L).containsEntry("usuario", 16L);
        assertThat(jdbc.sql("SELECT nombre FROM sede ORDER BY nombre").query(String.class).list())
                .containsExactly("Sede San Isidro", "Sede Surco");
        assertThat(contar("SELECT count(*) FROM sede WHERE direccion IS NULL OR direccion = ''")).isZero();
        assertThat(jdbc.sql("SELECT nombre FROM especialidad").query(String.class).list())
                .containsExactlyInAnyOrder("Medicina general", "Cardiología", "Pediatría", "Dermatología",
                        "Ginecología", "Traumatología", "Oftalmología", "Endocrinología");
        assertThat(contar("SELECT count(*) FROM especialidad WHERE descripcion IS NULL OR descripcion = ''")).isZero();
        assertThat(contar("SELECT count(DISTINCT sede_id) FROM horario")).isEqualTo(2);
        assertThat(jdbc.sql("SELECT nombre_visible FROM profesional").query(String.class).list())
                .allMatch(nombre -> nombre.matches("^Dra?\\. \\p{Lu}\\p{L}+( \\p{Lu}\\p{L}+){2,3}$"));
        assertThat(jdbc.sql("SELECT nombre_visible, rol FROM usuario WHERE email IN (?, ?, ?, ?, ?, ?)")
                .params("ana.torres@correo.test", "luis.ramirez@correo.test", "rita.huaman@correo.test",
                        "carla.mendoza@siga-sp.test", "jorge.salazar@siga-sp.test", "admin@siga-sp.test")
                .query((rs, i) -> rs.getString(1) + "|" + rs.getString(2)).list())
                .containsExactlyInAnyOrder("Ana Lucía Torres Vega|PACIENTE", "Luis Alberto Ramírez Soto|PACIENTE",
                        "Rita Huamán Flores|PACIENTE", "Carla Mendoza Ruiz|OPERADOR",
                        "Jorge Salazar Paz|RESPONSABLE", "Mónica Ríos Valdivia|ADMINISTRADOR");
    }

    @Test
    @DisplayName("Realismo: ningún nombre con «Demo», «Prueba» o «Test» y solo dominios reservados .test")
    void sinRastrosDeDemo() {
        String textos = """
                SELECT nombres || ' ' || apellidos FROM paciente
                UNION ALL SELECT nombre_visible FROM usuario
                UNION ALL SELECT nombre_visible FROM profesional
                UNION ALL SELECT nombre || ' ' || direccion FROM sede
                UNION ALL SELECT nombre || ' ' || descripcion FROM especialidad
                """;
        assertThat(jdbc.sql(textos).query(String.class).list())
                .hasSizeGreaterThan(40)
                .noneMatch(texto -> texto.toLowerCase().matches(".*\\b(demo|prueba|test|ejemplo|piloto)\\b.*"));
        assertThat(contar("SELECT count(*) FROM usuario WHERE email NOT LIKE '%.test'")).isZero();
        assertThat(contar("SELECT count(*) FROM paciente WHERE email_contacto NOT LIKE '%.test'")).isZero();
        assertThat(contar("SELECT count(*) FROM paciente WHERE telefono_contacto !~ '^\\+51 9[0-9]{2} [0-9]{3} [0-9]{3}$'"))
                .as("teléfonos móviles peruanos con formato").isZero();
    }

    @Test
    @DisplayName("Unas 150 citas en [hoy − 45, hoy + 21] con todos los estados y proporciones verosímiles")
    void volumenYProporciones() {
        long citas = primera.get("cita");
        assertThat(citas).isBetween(130L, 180L);
        assertThat(jdbc.sql("SELECT codigo FROM cita").query(String.class).list())
                .allMatch(codigo -> codigo.matches("^SP-2026-\\d{6}$"));
        assertThat(jdbc.sql("SELECT DISTINCT estado FROM cita").query(String.class).list())
                .containsExactlyInAnyOrder("PENDIENTE", "CONFIRMADA", "CHECK_IN", "EN_ESPERA", "EN_ATENCION",
                        "COMPLETADA", "CANCELADA", "NO_ASISTIO");
        double canceladas = 100.0 * contar("SELECT count(*) FROM cita WHERE estado = 'CANCELADA'") / citas;
        double inasistencias = 100.0 * contar("SELECT count(*) FROM cita WHERE estado = 'NO_ASISTIO'") / citas;
        assertThat(canceladas).as("%% de canceladas").isBetween(6.0, 14.0);
        assertThat(inasistencias).as("%% de inasistencias").isBetween(4.0, 12.0);
        assertThat(contar("SELECT count(*) FROM cita WHERE estado = 'COMPLETADA'"))
                .as("las completadas son mayoría en el pasado").isGreaterThan(citas / 3);
        assertThat(contar("SELECT count(DISTINCT cita_id) FROM cita_evento WHERE tipo = 'REPROGRAMADA'"))
                .isGreaterThanOrEqualTo(8);
        Instant desde = AHORA.minus(Duration.ofDays(46));
        Instant hasta = AHORA.plus(Duration.ofDays(30));
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE vigente_hasta IS NULL "
                + "AND (inicio < ? OR inicio > ?)", Timestamp.from(desde), Timestamp.from(hasta))).isZero();
        assertThat(contar("SELECT count(*) FROM cita c JOIN cita_version_agenda v ON v.cita_id = c.id "
                + "AND v.vigente_hasta IS NULL WHERE v.inicio < ? AND c.estado IN ('PENDIENTE', 'CONFIRMADA')",
                Timestamp.from(AHORA.minus(Duration.ofMinutes(30))))).as("pasadas sin cerrar").isZero();
        // Coherencia con las reglas de la reserva: como máximo 5 activas por paciente.
        assertThat(contar("SELECT count(*) FROM (SELECT paciente_id FROM cita WHERE estado IN ('PENDIENTE', "
                + "'CONFIRMADA', 'CHECK_IN', 'EN_ESPERA', 'EN_ATENCION') GROUP BY paciente_id HAVING count(*) > 5) x"))
                .isZero();
        assertThat(contar("SELECT count(*) FROM notificacion WHERE tipo = 'RECORDATORIO'")).isGreaterThan(30);
    }

    @Test
    @DisplayName("Coherencia con la reserva: ningún paciente tiene citas activas que se crucen ni dos de la misma especialidad el mismo día")
    void coherenciaConReglasDeReserva() {
        String activas = "FROM cita c JOIN cita_version_agenda v ON v.cita_id = c.id AND v.vigente_hasta IS NULL "
                + "WHERE c.estado IN " + NO_TERMINALES;
        assertThat(contar("SELECT count(*) FROM (SELECT c.id, c.paciente_id, v.inicio, v.fin " + activas + ") a "
                + "JOIN (SELECT c.id, c.paciente_id, v.inicio, v.fin " + activas + ") b "
                + "ON a.paciente_id = b.paciente_id AND a.id < b.id AND a.inicio < b.fin AND b.inicio < a.fin"))
                .as("citas activas del mismo paciente que se cruzan").isZero();
        assertThat(contar("SELECT count(*) FROM (SELECT c.paciente_id " + activas + " GROUP BY c.paciente_id, "
                + "c.especialidad_id, (v.inicio AT TIME ZONE 'America/Lima')::date HAVING count(*) > 1) x"))
                .as("dos citas activas de la misma especialidad el mismo día").isZero();
    }

    @Test
    @DisplayName("Con datos de la v1.0 (cuentas @ejemplo.invalid) se detiene con un mensaje que pide scripts/db.sh reset")
    void detieneConDatosDeLaVersionAnterior() {
        UUID antiguo = UUID.randomUUID();
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, creado_en) "
                        + "VALUES (?, 'ana.demo@ejemplo.invalid', 'x', 'Ana Demo', 'ADMINISTRADOR', TRUE, ?)")
                .params(antiguo, Timestamp.from(AHORA)).update();
        try {
            assertThatThrownBy(() -> datosDemo.run(null))
                    .isInstanceOf(DatosAntiguosException.class)
                    .hasMessageContaining("versión 1.0")
                    .hasMessageContaining("@ejemplo.invalid")
                    .hasMessageContaining("scripts/db.sh reset");
            assertThat(conteos()).as("no carga nada encima")
                    .isEqualTo(conUsuarios(primera, primera.get("usuario") + 1));
            assertThat(reloj.instant()).as("no toca el reloj").isEqualTo(AHORA);
        } finally {
            jdbc.sql("DELETE FROM usuario WHERE id = ?").params(antiguo).update();
        }
    }

    @Test
    @DisplayName("Ana: historial rico en todos los estados del paciente y una cita de hoy dentro de la ventana de llegada")
    void historiaDeAna() {
        String ana = "(SELECT paciente_id FROM usuario WHERE email = 'ana.torres@correo.test')";
        assertThat(contar("SELECT count(*) FROM cita WHERE paciente_id = " + ana)).isGreaterThanOrEqualTo(10);
        assertThat(jdbc.sql("SELECT DISTINCT estado FROM cita WHERE paciente_id = " + ana).query(String.class).list())
                .contains("PENDIENTE", "CONFIRMADA", "COMPLETADA", "CANCELADA", "NO_ASISTIO");
        assertThat(contar("SELECT count(DISTINCT e.cita_id) FROM cita_evento e JOIN cita c ON c.id = e.cita_id "
                + "WHERE e.tipo = 'REPROGRAMADA' AND c.paciente_id = " + ana)).isGreaterThanOrEqualTo(2);
        assertThat(contar("SELECT count(*) FROM pre_check_in p JOIN cita c ON c.id = p.cita_id "
                + "WHERE c.paciente_id = " + ana)).isGreaterThanOrEqualTo(1);
        assertThat(jdbc.sql("SELECT c.estado FROM cita c JOIN cita_version_agenda v ON v.cita_id = c.id "
                        + "AND v.vigente_hasta IS NULL WHERE c.paciente_id = " + ana + " AND " + HOY_LIMA
                        + " AND v.inicio - interval '60 minutes' <= ? AND ? < v.inicio + interval '30 minutes'")
                .params(Timestamp.from(AHORA), Timestamp.from(AHORA)).query(String.class).list())
                .containsExactly("CONFIRMADA");
        assertThat(contar("SELECT count(*) FROM cita WHERE paciente_id = " + ana
                + " AND estado IN ('PENDIENTE', 'CONFIRMADA', 'CHECK_IN', 'EN_ESPERA', 'EN_ATENCION')"))
                .as("deja cupo para reservar").isLessThan(5);
        esperarEventos();
        assertThat(jdbc.sql("SELECT DISTINCT n.ventana FROM notificacion n JOIN cita c ON c.id = n.cita_id "
                + "WHERE c.paciente_id = " + ana + " AND n.estado = 'ENVIADA_SIMULADA'").query(String.class).list())
                .contains("CREADA", "CONFIRMADA", "CANCELADA", "REPROGRAMADA", "24H");
    }

    @Test
    @DisplayName("Carla: opera varios profesionales de Sede Surco y su día de hoy está lleno, en distintos momentos")
    void diaDeLaOperadora() {
        String carla = "(SELECT id FROM usuario WHERE email = 'carla.mendoza@siga-sp.test')";
        assertThat(contar("SELECT count(*) FROM operador_profesional WHERE usuario_id = " + carla))
                .isGreaterThanOrEqualTo(5);
        String deHoy = "FROM cita c JOIN cita_version_agenda v ON v.cita_id = c.id AND v.vigente_hasta IS NULL "
                + "WHERE " + HOY_LIMA + " AND v.profesional_id IN (SELECT profesional_id FROM operador_profesional "
                + "WHERE usuario_id = " + carla + ")";
        assertThat(contar("SELECT count(*) " + deHoy)).isGreaterThanOrEqualTo(10);
        assertThat(jdbc.sql("SELECT DISTINCT c.estado " + deHoy).query(String.class).list())
                .contains("COMPLETADA", "EN_ATENCION", "EN_ESPERA", "CHECK_IN", "CONFIRMADA", "PENDIENTE");
    }

    private void esperarEventos() {
        long limite = System.nanoTime() + Duration.ofSeconds(30).toNanos();
        while (contar("SELECT count(*) FROM event_publication WHERE completion_date IS NULL "
                + "AND (status IS NULL OR status <> 'FAILED')") > 0 && System.nanoTime() < limite) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private long contar(String sql, Object... parametros) {
        return jdbc.sql(sql).params(parametros).query(Long.class).single();
    }

    private static Map<String, Long> conUsuarios(Map<String, Long> conteos, long usuarios) {
        Map<String, Long> copia = new LinkedHashMap<>(conteos);
        copia.put("usuario", usuarios);
        return copia;
    }

    private Map<String, Long> conteos() {
        Map<String, Long> conteos = new LinkedHashMap<>();
        for (String tabla : TABLAS) {
            conteos.put(tabla, contar("SELECT count(*) FROM " + tabla));
        }
        return conteos;
    }
}
