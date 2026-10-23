package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.CLAVE;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_ADMIN;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_ADMIN;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_B;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * PB25 · Bitácora (HU17): consulta paginada con filtros, solo para el ADMINISTRADOR y sin
 * operaciones de modificación.
 */
@DisplayName("PB25 · Bitácora")
class BitacoraIntegracionTest extends PruebaApi {

    private static final String BITACORA = "/api/v1/admin/auditoria";
    private static final ZoneId LIMA = ZoneId.of("America/Lima");

    @Autowired
    private PasswordEncoder encoder;

    @Test
    @DisplayName("Pagina de la más reciente a la más antigua, con total, actor (nombre y rol) y acciones distintas")
    void paginacionYOrden() {
        for (int i = 1; i <= 30; i++) {
            entrada(AHORA.minus(Duration.ofMinutes(i)), USUARIO_A, "PACIENTE",
                    i % 2 == 0 ? "CITA_CONFIRMAR" : "CITA_CANCELAR", "EXITO", null);
        }
        MockHttpSession admin = login(EMAIL_ADMIN); // agrega LOGIN en AHORA: la entrada más reciente

        MvcTestResult primera = get(admin, BITACORA + "?pagina=0&tamano=10");
        assertThat(primera).hasStatusOk();
        assertThat(numero(primera, "$.total")).isEqualTo(31);
        assertThat(numero(primera, "$.pagina")).isZero();
        assertThat(numero(primera, "$.tamano")).isEqualTo(10);
        assertThat((List<Object>) valor(primera, "$.elementos")).hasSize(10);
        assertThat((String) valor(primera, "$.elementos[0].accion")).isEqualTo("LOGIN");
        assertThat((String) valor(primera, "$.elementos[0].ocurridoEn")).isEqualTo("2026-11-02T13:00:00Z");
        assertThat((Map<String, Object>) valor(primera, "$.elementos[0].actor"))
                .containsEntry("id", USUARIO_ADMIN.toString())
                .containsEntry("nombre", "Admin Prueba")
                .containsEntry("rol", "ADMINISTRADOR");
        assertThat((Map<String, Object>) valor(primera, "$.elementos[1]"))
                .containsEntry("accion", "CITA_CANCELAR").containsEntry("entidad", "CITA")
                .containsEntry("entidadId", "cita-ref").containsEntry("resultado", "EXITO")
                .containsEntry("codigo", null).containsEntry("requestId", "req-prueba")
                .containsEntry("ocurridoEn", "2026-11-02T12:59:00Z")
                .doesNotContainKey("detalle");
        assertThat((String) valor(primera, "$.elementos[1].actor.nombre")).isEqualTo("Ana Prueba");
        assertThat((List<String>) valor(primera, "$.acciones"))
                .containsExactly("CITA_CANCELAR", "CITA_CONFIRMAR", "LOGIN");

        List<String> instantes = valor(get(admin, BITACORA + "?pagina=1&tamano=10"), "$.elementos[*].ocurridoEn");
        assertThat(instantes).hasSize(10).first().isEqualTo("2026-11-02T12:50:00Z");
        assertThat(instantes).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        MvcTestResult ultima = get(admin, BITACORA + "?pagina=3&tamano=10");
        assertThat((List<Object>) valor(ultima, "$.elementos")).hasSize(1);
        assertThat(numero(ultima, "$.total")).isEqualTo(31);
        assertThat((List<Object>) valor(get(admin, BITACORA + "?pagina=9&tamano=10"), "$.elementos")).isEmpty();

        // Por defecto: página 0 de 25.
        MvcTestResult porDefecto = get(admin, BITACORA);
        assertThat(numero(porDefecto, "$.tamano")).isEqualTo(25);
        assertThat((List<Object>) valor(porDefecto, "$.elementos")).hasSize(25);
    }

    @Test
    @DisplayName("Con el mismo instante, el orden se desempata por id (la última registrada primero)")
    void desempatePorId() {
        Instant mismo = AHORA.minus(Duration.ofHours(1));
        long primera = entrada(mismo, USUARIO_A, "PACIENTE", "CITA_CONFIRMAR", "EXITO", null);
        long segunda = entrada(mismo, USUARIO_A, "PACIENTE", "CITA_CANCELAR", "EXITO", null);

        MvcTestResult r = get(login(EMAIL_ADMIN), BITACORA + "?accion=&desde=2026-11-02&hasta=2026-11-02");
        List<Number> ids = valor(r, "$.elementos[*].id");
        assertThat(ids.stream().map(Number::longValue).toList()).containsSubsequence(segunda, primera);
    }

    @Test
    @DisplayName("Filtra por acción, resultado, correo del usuario y fechas locales de Lima; actor null si es el sistema")
    void filtros() {
        // Domingo 01/11/2026 23:30 en Lima = lunes 02/11 04:30 UTC: cuenta como día local 01/11.
        Instant domingoNoche = lima("2026-11-01T23:30");
        entrada(domingoNoche, USUARIO_A, "PACIENTE", "CITA_CONFIRMAR", "EXITO", null);
        entrada(lima("2026-10-30T10:00"), USUARIO_A, "PACIENTE", "CITA_ACCESO", "DENEGADO", "CITA_NO_ENCONTRADA");
        entrada(lima("2026-10-31T10:00"), USUARIO_B, "PACIENTE", "CITA_CONFIRMAR", "RECHAZO", "FUERA_DE_PLAZO");
        entrada(lima("2026-11-02T07:00"), null, null, "CITA_MARCAR_NO_ASISTIO", "EXITO", null);
        MockHttpSession admin = login(EMAIL_ADMIN);

        MvcTestResult porAccion = get(admin, BITACORA + "?accion=CITA_CONFIRMAR");
        assertThat(numero(porAccion, "$.total")).isEqualTo(2);
        assertThat((List<String>) valor(porAccion, "$.elementos[*].accion")).containsOnly("CITA_CONFIRMAR");

        MvcTestResult denegados = get(admin, BITACORA + "?resultado=DENEGADO");
        assertThat(numero(denegados, "$.total")).isEqualTo(1);
        assertThat((String) valor(denegados, "$.elementos[0].codigo")).isEqualTo("CITA_NO_ENCONTRADA");

        // El correo se compara sin distinguir mayúsculas.
        MvcTestResult deA = get(admin, BITACORA + "?usuario=PACIENTE.A@ejemplo.invalid");
        assertThat(numero(deA, "$.total")).isEqualTo(2);
        assertThat((List<String>) valor(deA, "$.elementos[*].actor.id")).containsOnly(USUARIO_A.toString());

        MvcTestResult domingo = get(admin, BITACORA + "?desde=2026-11-01&hasta=2026-11-01");
        assertThat(numero(domingo, "$.total")).isEqualTo(1);
        assertThat((String) valor(domingo, "$.elementos[0].ocurridoEn")).isEqualTo("2026-11-02T04:30:00Z");

        MvcTestResult desdeOctubre31 = get(admin, BITACORA + "?desde=2026-10-31");
        assertThat(numero(desdeOctubre31, "$.total")).isEqualTo(4); // 31/10, 01/11, 02/11 (sistema) y el LOGIN
        MvcTestResult hastaOctubre30 = get(admin, BITACORA + "?hasta=2026-10-30");
        assertThat(numero(hastaOctubre30, "$.total")).isEqualTo(1);

        MvcTestResult sistema = get(admin, BITACORA + "?accion=CITA_MARCAR_NO_ASISTIO");
        assertThat((Object) valor(sistema, "$.elementos[0].actor")).isNull();

        MvcTestResult combinados = get(admin, BITACORA + "?accion=CITA_CONFIRMAR&resultado=RECHAZO"
                + "&usuario=paciente.b@ejemplo.invalid&desde=2026-10-01&hasta=2026-10-31");
        assertThat(numero(combinados, "$.total")).isEqualTo(1);
        assertThat((String) valor(combinados, "$.elementos[0].actor.nombre")).isEqualTo("Beto Prueba");

        MvcTestResult nadie = get(admin, BITACORA + "?usuario=nadie@ejemplo.invalid");
        assertThat(numero(nadie, "$.total")).isZero();
        // La lista de acciones no depende de los filtros: alimenta el selector.
        assertThat((List<String>) valor(nadie, "$.acciones")).containsExactly("CITA_ACCESO", "CITA_CONFIRMAR",
                "CITA_MARCAR_NO_ASISTIO", "LOGIN");
    }

    @Test
    @DisplayName("Valida los parámetros: tamaño de 1 a 100, página ≥ 0, desde ≤ hasta, resultado y fechas válidos")
    void validaciones() {
        MockHttpSession admin = login(EMAIL_ADMIN);
        assertThat(get(admin, BITACORA + "?tamano=100")).hasStatusOk();
        for (String consulta : List.of("?tamano=101", "?tamano=0", "?pagina=-1", "?desde=2026-11-02&hasta=2026-11-01",
                "?resultado=OTRO", "?desde=02-11-2026", "?pagina=uno", "?accion=" + "X".repeat(51))) {
            esperarError(get(admin, BITACORA + consulta), HttpStatus.BAD_REQUEST, "VALIDACION");
        }
    }

    @Test
    @DisplayName("Solo el ADMINISTRADOR la consulta; es de solo lectura (no hay rutas de modificación)")
    void soloAdministradorYSoloLectura() {
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id, creado_en) "
                        + "VALUES (?, 'responsable@ejemplo.invalid', ?, 'Responsable Prueba', 'RESPONSABLE', TRUE, NULL, ?)")
                .params(UUID.randomUUID(), encoder.encode(CLAVE), Timestamp.from(AHORA)).update();
        for (String email : List.of(EMAIL_A, EMAIL_OPERADOR, "responsable@ejemplo.invalid")) {
            esperarError(get(login(email), BITACORA), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        }
        esperarError(mvc.get().uri(BITACORA).exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");

        MockHttpSession admin = login(EMAIL_ADMIN);
        long antes = contar("SELECT count(*) FROM auditoria");
        assertThat(get(admin, BITACORA)).hasStatusOk();
        assertThat(contar("SELECT count(*) FROM auditoria")).as("consultar no escribe en la bitácora").isEqualTo(antes);
        esperarError(mvc.post().uri(BITACORA).session(admin).with(csrf()).exchange(),
                HttpStatus.METHOD_NOT_ALLOWED, "METODO_NO_PERMITIDO");
        esperarError(mvc.delete().uri(BITACORA).session(admin).with(csrf()).exchange(),
                HttpStatus.METHOD_NOT_ALLOWED, "METODO_NO_PERMITIDO");
        assertThat(contar("SELECT count(*) FROM auditoria")).isEqualTo(antes);
    }

    // ------------------------------------------------------------------
    // Apoyo
    // ------------------------------------------------------------------

    private static Instant lima(String fechaHoraLocal) {
        return LocalDateTime.parse(fechaHoraLocal).atZone(LIMA).toInstant();
    }

    private long entrada(Instant cuando, UUID actor, String rol, String accion, String resultado, String codigo) {
        return jdbc.sql("INSERT INTO auditoria (ocurrido_en, actor_usuario_id, actor_rol, accion, entidad, entidad_id, "
                        + "resultado, codigo, request_id) VALUES (?, ?, ?, ?, 'CITA', 'cita-ref', ?, ?, 'req-prueba') "
                        + "RETURNING id")
                .params(Timestamp.from(cuando), actor, rol, accion, resultado, codigo)
                .query(Long.class).single();
    }
}
