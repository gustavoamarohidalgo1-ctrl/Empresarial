package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.ApplicationContext;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import com.jayway.jsonpath.JsonPath;

import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;
import pe.edu.utp.sigasp.correo.Correo;
import pe.edu.utp.sigasp.soporte.CuentasPrueba;
import pe.edu.utp.sigasp.soporte.EscenarioPrueba;
import pe.edu.utp.sigasp.soporte.Origenes;
import pe.edu.utp.sigasp.soporte.PostgresEmbebido;

/**
 * Configuración de producción ({@code sigasp.reloj.ajustable=false} y sin {@code sigasp.dev.buzon-correos}):
 * <ul>
 *   <li>el controlador del reloj simulado y el buzón de correos no existen, y {@code /api/v1/dev/**} responde 404
 *       a todos, también sin sesión;</li>
 *   <li>el correo simulado guarda solo el asunto y el destinatario enmascarado: ni el cuerpo ni el enlace (que
 *       llevan el token) quedan en la BD ni en el log, y el enlace del correo usa el origen de la solicitud.</li>
 * </ul>
 * No extiende {@code PruebaIntegracion}: sin reloj ajustable, sus soportes no pueden crearse (se sustituyen).
 */
@SpringBootTest(properties = {"sigasp.reloj.ajustable=false", "sigasp.dev.buzon-correos=false"})
@AutoConfigureMockMvc
@ActiveProfiles("test")
@ExtendWith(OutputCaptureExtension.class)
@DisplayName("v1.1 · Configuración de producción: sin rutas de desarrollo y correo simulado sin token")
class PerfilProduccionIntegracionTest {

    private static final String CLAVE = "Clave-Produccion-2026";
    private static final String ASUNTO = "Restablece tu contraseña de SIGA-SP";

    @DynamicPropertySource
    static void baseDeDatos(DynamicPropertyRegistry propiedades) {
        PostgresEmbebido.registrar(propiedades);
    }

    /** Dependen del reloj ajustable, que en producción no existe. */
    @MockitoBean
    private EscenarioPrueba escenario;

    @MockitoBean
    private CuentasPrueba cuentas;

    @MockitoSpyBean
    private Correo correo;

    @Autowired
    private MockMvcTester mvc;

    @Autowired
    private JdbcClient jdbc;

    @Autowired
    private PasswordEncoder encoder;

    @Autowired
    private ApplicationContext contexto;

    @Autowired
    private Clock reloj;

    /** Crea un usuario con correo único en un dominio propio y devuelve el correo. */
    private String usuario(String rol, String dominio) {
        String sufijo = UUID.randomUUID().toString().substring(0, 8);
        String email = "lucia." + sufijo + "@" + dominio;
        UUID paciente = null;
        Timestamp ahora = Timestamp.from(Instant.now(reloj));
        if (rol.equals("PACIENTE")) {
            paciente = UUID.randomUUID();
            jdbc.sql("INSERT INTO paciente (id, codigo, nombres, apellidos, email_contacto, telefono_contacto, "
                            + "creado_en, actualizado_en) VALUES (?, ?, 'Lucía', 'Paredes Rojas', ?, '+51 987 654 321', ?, ?)")
                    .params(paciente, "PP-" + sufijo, email, ahora, ahora).update();
        }
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id, creado_en) "
                        + "VALUES (?, ?, ?, 'Lucía Paredes Rojas', ?, TRUE, ?, ?)")
                .params(UUID.randomUUID(), email, encoder.encode(CLAVE), rol, paciente, ahora).update();
        return email;
    }

    private MvcTestResult login(String email, String password) {
        return mvc.post().uri("/api/v1/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").exchange();
    }

    private static void esperar404(MvcTestResult resultado) {
        assertThat(resultado).hasStatus(HttpStatus.NOT_FOUND).bodyJson().extractingPath("$.codigo")
                .isEqualTo("RECURSO_NO_ENCONTRADO");
    }

    private static String sha256(String texto) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(texto.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("El reloj simulado y el buzón no existen: /api/v1/dev/** responde 404 sin sesión y al administrador")
    void sinRutasDeDesarrollo() {
        assertThat(contexto.containsBean("relojDevController")).isFalse();
        assertThat(contexto.containsBean("buzonCorreosController")).isFalse();
        assertThat(contexto.containsBean("buzonCorreos")).isFalse();
        assertThat(contexto.getBeanNamesForType(RelojAjustable.class)).isEmpty();
        assertThat(reloj).isNotInstanceOf(RelojAjustable.class);

        MvcTestResult sesion = login(usuario("ADMINISTRADOR", "siga-sp.test"), CLAVE);
        assertThat(sesion).hasStatusOk();
        MockHttpSession admin = (MockHttpSession) sesion.getRequest().getSession(false);

        for (MockHttpSession actual : List.of(new MockHttpSession(), admin)) {
            for (String ruta : List.of("/api/v1/dev/reloj", "/api/v1/dev/correos", "/api/v1/dev/otra")) {
                esperar404(mvc.get().uri(ruta).session(actual).exchange());
            }
            esperar404(mvc.put().uri("/api/v1/dev/reloj").session(actual).contentType(MediaType.APPLICATION_JSON)
                    .content("{\"ahora\":\"2030-01-01T00:00:00Z\"}").exchange());
            esperar404(mvc.put().uri("/api/v1/dev/reloj").session(actual).with(csrf())
                    .contentType(MediaType.APPLICATION_JSON).content("{\"ahora\":\"2030-01-01T00:00:00Z\"}")
                    .exchange());
        }
    }

    @Test
    @DisplayName("El correo de recuperación no deja el token en la BD ni en el log, y el enlace funciona")
    void correoSinToken(CapturedOutput salida) throws Exception {
        String dominio = "prod-" + UUID.randomUUID().toString().substring(0, 8) + ".test";
        String email = usuario("PACIENTE", dominio);

        MvcTestResult solicitud = mvc.post().uri("https://citas.siga-sp.pe:443/api/v1/auth/recuperacion").with(csrf())
                .with(Origenes.desde(Origenes.nuevaIp())).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\"}").exchange();

        assertThat(solicitud).hasStatus(HttpStatus.ACCEPTED);
        ArgumentCaptor<String> cuerpo = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> enlace = ArgumentCaptor.forClass(String.class);
        verify(correo).enviar(eq(email), eq(ASUNTO), cuerpo.capture(), enlace.capture());
        assertThat(enlace.getValue()).matches("^/restablecer\\?token=[A-Za-z0-9_-]{43}$");
        String token = enlace.getValue().substring(enlace.getValue().indexOf('=') + 1);
        assertThat(cuerpo.getValue()).as("sin sigasp.correo.url-base, el enlace usa el origen de la solicitud")
                .contains("\nhttps://citas.siga-sp.pe/restablecer?token=" + token + "\n");

        Map<String, Object> guardado = jdbc.sql("SELECT destinatario, asunto, cuerpo, enlace FROM correo_simulado "
                + "WHERE destinatario LIKE ?").params("%@" + dominio).query().singleRow();
        assertThat(guardado).containsEntry("destinatario", "l***@" + dominio).containsEntry("asunto", ASUNTO);
        assertThat(guardado.get("cuerpo")).isNull();
        assertThat(guardado.get("enlace")).isNull();
        assertThat(jdbc.sql("SELECT count(*) FROM correo_simulado WHERE destinatario = ? OR cuerpo LIKE ? "
                + "OR enlace LIKE ?").params(email, "%" + token + "%", "%" + token + "%").query(Long.class).single())
                .isZero();
        assertThat(jdbc.sql("SELECT count(*) FROM token_recuperacion WHERE hash_token = ?").params(sha256(token))
                .query(Long.class).single()).isEqualTo(1);
        assertThat(jdbc.sql("SELECT count(*) FROM auditoria WHERE detalle::text LIKE ?").params("%" + token + "%")
                .query(Long.class).single()).isZero();
        assertThat(salida.getAll()).contains("[CORREO SIMULADO", "l***@" + dominio)
                .doesNotContain(token, "token=", email);

        // El flujo completo sigue funcionando: el enlace del correo restablece la contraseña.
        MvcTestResult restablecer = mvc.post().uri("/api/v1/auth/restablecer").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"password\":\"Nueva-Clave-Segura-77\"}").exchange();
        assertThat(restablecer).hasStatus(HttpStatus.NO_CONTENT);
        MvcTestResult nuevo = login(email, "Nueva-Clave-Segura-77");
        assertThat(nuevo).hasStatusOk();
        assertThat((String) JsonPath.read(nuevo.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.email"))
                .isEqualTo(email);
    }
}
