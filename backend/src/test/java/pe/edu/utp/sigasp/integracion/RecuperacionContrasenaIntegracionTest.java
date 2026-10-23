package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.CLAVE;
import static pe.edu.utp.sigasp.soporte.Origenes.desde;
import static pe.edu.utp.sigasp.soporte.Origenes.nuevaIp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.CuentasPrueba;
import pe.edu.utp.sigasp.soporte.CuentasPrueba.Cuenta;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * v1.1 · Recuperación de contraseña: la solicitud siempre responde 202, el enlace es de un solo uso y vence a
 * los 30 minutos de hora real (reloj de seguridad), solo se guarda el hash del token, y restablecer cierra las
 * sesiones anteriores.
 * <p>
 * Usa la configuración de desarrollo del correo ({@code sigasp.dev.buzon-correos=true}, la misma de
 * {@link BuzonCorreosDevIntegracionTest}): solo así {@code correo_simulado} guarda el enlace del que se lee el token.
 * Lo que se guarda en producción lo verifica {@link PerfilProduccionIntegracionTest}.
 */
@TestPropertySource(properties = "sigasp.dev.buzon-correos=true")
@DisplayName("v1.1 · Recuperación y restablecimiento de contraseña")
class RecuperacionContrasenaIntegracionTest extends PruebaApi {

    private static final String NUEVA = "Malecon-Barranco-2026";
    /** Hora real simulada del reloj de seguridad (distinta de la hora de negocio {@code AHORA}). */
    private static final Instant HORA_REAL = Instant.parse("2026-10-23T15:00:00Z");

    @Autowired
    private CuentasPrueba cuentas;

    private Cuenta cuenta;

    @BeforeEach
    void cuenta() {
        cuenta = cuentas.paciente("Gabriela");
    }

    private MvcTestResult solicitar(String email, String ip) {
        return mvc.post().uri("/api/v1/auth/recuperacion").with(csrf()).with(desde(ip))
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"" + email + "\"}").exchange();
    }

    private MvcTestResult restablecer(String token, String password) {
        return mvc.post().uri("/api/v1/auth/restablecer").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}").exchange();
    }

    private MvcTestResult intentarLogin(String email, String password) {
        return mvc.post().uri("/api/v1/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").exchange();
    }

    /** Token del último correo simulado enviado al destinatario. */
    private String tokenEnviado(String email) {
        String enlace = jdbc.sql("SELECT enlace FROM correo_simulado WHERE destinatario = ? "
                + "ORDER BY enviado_en DESC LIMIT 1").params(email).query(String.class).single();
        assertThat(enlace).matches("^/restablecer\\?token=[A-Za-z0-9_-]{43}$");
        return enlace.substring(enlace.indexOf('=') + 1);
    }

    private static String sha256(String texto) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(texto.getBytes(StandardCharsets.UTF_8)));
    }

    @Test
    @DisplayName("Con una cuenta activa responde 202, envía un correo simulado profesional y guarda solo el hash del token")
    void solicitudConCuenta() throws Exception {
        MvcTestResult resultado = solicitar(cuenta.email().toUpperCase(), nuevaIp());

        assertThat(resultado).hasStatus(HttpStatus.ACCEPTED);
        assertThat(cuerpo(resultado)).isEmpty();
        Map<String, Object> correo = jdbc.sql("SELECT destinatario, asunto, cuerpo FROM correo_simulado")
                .query().singleRow();
        assertThat(correo).containsEntry("destinatario", cuenta.email())
                .containsEntry("asunto", "Restablece tu contraseña de SIGA-SP");
        String token = tokenEnviado(cuenta.email());
        assertThat((String) correo.get("cuerpo")).startsWith("Hola, Gabriela:")
                .as("sin sigasp.correo.url-base, el enlace absoluto usa el origen de la solicitud")
                .contains("válido durante 30 minutos", "solo puede usarse una vez",
                        "\nhttp://localhost/restablecer?token=" + token + "\n",
                        "Si no solicitaste este cambio", "Equipo de Atención al Paciente")
                .doesNotContainIgnoringCase("demo").doesNotContainIgnoringCase("prueba");

        Map<String, Object> fila = jdbc.sql("SELECT hash_token, usuario_id, "
                + "CAST(extract(epoch FROM expira_en - creado_en) AS integer) AS vigencia, usado_en "
                + "FROM token_recuperacion").query().singleRow();
        assertThat(fila).containsEntry("hash_token", sha256(token)).containsEntry("usuario_id", cuenta.usuarioId())
                .containsEntry("vigencia", 1800);
        assertThat(fila.get("usado_en")).isNull();
        assertThat(contar("SELECT count(*) FROM token_recuperacion WHERE hash_token = ?", token)).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE detalle::text LIKE ?", "%" + token + "%")).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'RECUPERACION_SOLICITAR' "
                + "AND resultado = 'EXITO' AND entidad_id = ?", cuenta.usuarioId().toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("Sin cuenta responde igual (202 sin cuerpo) y no envía nada: no revela qué correos existen")
    void solicitudSinCuenta() {
        MvcTestResult inexistente = solicitar("nadie." + UUID.randomUUID() + "@correo.test", nuevaIp());
        MvcTestResult existente = solicitar(cuenta.email(), nuevaIp());

        assertThat(inexistente).hasStatus(HttpStatus.ACCEPTED);
        assertThat(cuerpo(inexistente)).isEqualTo(cuerpo(existente));
        assertThat(contar("SELECT count(*) FROM correo_simulado")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM token_recuperacion")).isEqualTo(1);
        esperarError(solicitar("no-es-correo", nuevaIp()), HttpStatus.BAD_REQUEST, "VALIDACION");
    }

    @Test
    @DisplayName("Restablecer cambia la contraseña, cierra las sesiones anteriores y el login siguiente funciona")
    void restablecerCierraSesiones() {
        relojSeguridad.fijar(HORA_REAL);
        MockHttpSession anterior = login(cuenta.email());
        assertThat(get(anterior, "/api/v1/pacientes/me/perfil")).hasStatusOk();
        // Aunque el reloj de negocio retroceda, la sesión anterior se cierra: se invalida por versión.
        reloj.fijar(AHORA.minus(Duration.ofDays(1)));
        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(5)));
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String token = tokenEnviado(cuenta.email());

        assertThat(restablecer(token, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        esperarError(get(anterior, "/api/v1/pacientes/me/perfil"), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        assertThat(anterior.isInvalid()).as("la sesión anterior se invalidó en el servidor").isTrue();
        esperarError(intentarLogin(cuenta.email(), CLAVE), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        MvcTestResult nuevo = intentarLogin(cuenta.email(), NUEVA);
        assertThat(nuevo).hasStatusOk();
        MockHttpSession sesion = (MockHttpSession) nuevo.getRequest().getSession(false);
        assertThat(get(sesion, "/api/v1/pacientes/me/perfil")).hasStatusOk();

        assertThat(contar("SELECT version_credenciales FROM usuario WHERE id = ?", cuenta.usuarioId())).isEqualTo(1);
        assertThat(instante("SELECT credenciales_cambiadas_en FROM usuario WHERE id = ?", cuenta.usuarioId()))
                .isEqualTo(HORA_REAL.plus(Duration.ofMinutes(5)));
        assertThat(contar("SELECT count(*) FROM token_recuperacion WHERE usado_en IS NOT NULL")).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CONTRASENA_RESTABLECER' "
                + "AND resultado = 'EXITO' AND entidad_id = ?", cuenta.usuarioId().toString())).isEqualTo(1);
    }

    @Test
    @DisplayName("Un enlace ya usado, vencido o inexistente responde 422 ENLACE_INVALIDO y no cambia nada")
    void enlacesInvalidos() {
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String usado = tokenEnviado(cuenta.email());
        assertThat(restablecer(usado, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);
        esperarError(restablecer(usado, "Otra-Clave-Segura-77"), HttpStatus.UNPROCESSABLE_CONTENT, "ENLACE_INVALIDO");

        reloj.fijar(AHORA.plus(Duration.ofMinutes(1)));
        relojSeguridad.fijar(HORA_REAL);
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String vencido = tokenEnviado(cuenta.email());
        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(31)));
        esperarError(restablecer(vencido, "Otra-Clave-Segura-77"), HttpStatus.UNPROCESSABLE_CONTENT,
                "ENLACE_INVALIDO");

        esperarError(restablecer("token-inventado", "Otra-Clave-Segura-77"), HttpStatus.UNPROCESSABLE_CONTENT,
                "ENLACE_INVALIDO");
        esperarError(restablecer("", "Otra-Clave-Segura-77"), HttpStatus.UNPROCESSABLE_CONTENT, "ENLACE_INVALIDO");

        assertThat(intentarLogin(cuenta.email(), NUEVA)).as("la contraseña sigue siendo la del primer enlace")
                .hasStatusOk();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CONTRASENA_RESTABLECER' "
                + "AND resultado = 'RECHAZO' AND codigo = 'ENLACE_INVALIDO'")).isEqualTo(4);
    }

    @Test
    @DisplayName("La vigencia del enlace sigue la hora real: mover el reloj de negocio no lo vence ni lo revive")
    void vigenciaConRelojDeSeguridad() {
        relojSeguridad.fijar(HORA_REAL);
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String vigente = tokenEnviado(cuenta.email());
        reloj.fijar(AHORA.plus(Duration.ofMinutes(1)));
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String otro = tokenEnviado(cuenta.email());
        assertThat(otro).isNotEqualTo(vigente);
        assertThat(contar("SELECT count(*) FROM token_recuperacion WHERE creado_en = ? AND expira_en = ?",
                Timestamp.from(HORA_REAL), Timestamp.from(HORA_REAL.plus(Duration.ofMinutes(30))))).isEqualTo(2);

        // Un enlace vencido en hora real no revive aunque el reloj de negocio retroceda.
        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(30)));
        reloj.fijar(AHORA.minus(Duration.ofDays(1)));
        esperarError(restablecer(otro, NUEVA), HttpStatus.UNPROCESSABLE_CONTENT, "ENLACE_INVALIDO");

        // Y uno vigente en hora real sirve aunque el reloj de negocio se adelante días.
        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(40)));
        reloj.fijar(AHORA.plus(Duration.ofDays(3)));
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String nuevo = tokenEnviado(cuenta.email());
        assertThat(restablecer(nuevo, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);
        assertThat(intentarLogin(cuenta.email(), NUEVA)).hasStatusOk();
    }

    @Test
    @DisplayName("Una contraseña débil responde 400 en el campo password y el enlace sigue sirviendo")
    void contrasenaDebilNoConsumeElEnlace() {
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String token = tokenEnviado(cuenta.email());

        MvcTestResult debil = restablecer(token, cuenta.email());

        esperarError(debil, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((String) valor(debil, "$.errores[0].campo")).isEqualTo("password");
        assertThat(restablecer(token, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);
    }

    @Test
    @DisplayName("Un enlace nuevo no anula el anterior, pero restablecer con cualquiera invalida todos los pendientes")
    void variosEnlaces() {
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String primero = tokenEnviado(cuenta.email());
        reloj.fijar(AHORA.plus(Duration.ofMinutes(2)));
        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        String segundo = tokenEnviado(cuenta.email());
        assertThat(segundo).isNotEqualTo(primero);

        assertThat(restablecer(segundo, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        esperarError(restablecer(primero, "Otra-Clave-Segura-77"), HttpStatus.UNPROCESSABLE_CONTENT,
                "ENLACE_INVALIDO");
    }

    @Test
    @DisplayName("Restablecer levanta el bloqueo por intentos fallidos de inicio de sesión")
    void restablecerDesbloquea() {
        for (int i = 1; i <= 5; i++) {
            esperarError(intentarLogin(cuenta.email(), "equivocada-" + i), HttpStatus.UNAUTHORIZED,
                    "CREDENCIALES_INVALIDAS");
        }
        esperarError(intentarLogin(cuenta.email(), CLAVE), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");

        assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        assertThat(restablecer(tokenEnviado(cuenta.email()), NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        assertThat(intentarLogin(cuenta.email(), NUEVA)).hasStatusOk();
    }

    @Test
    @DisplayName("Más de 5 solicitudes en 15 minutos (hora real) para el mismo correo o desde la misma IP responden 429")
    void limites() {
        relojSeguridad.fijar(HORA_REAL);
        for (int i = 0; i < 5; i++) {
            assertThat(solicitar(cuenta.email(), nuevaIp())).hasStatus(HttpStatus.ACCEPTED);
        }
        esperarError(solicitar(cuenta.email(), nuevaIp()), HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS");
        assertThat(contar("SELECT count(*) FROM correo_simulado")).isEqualTo(5);

        String ip = nuevaIp();
        for (int i = 0; i < 5; i++) {
            assertThat(solicitar("nadie." + i + "." + UUID.randomUUID() + "@correo.test", ip))
                    .hasStatus(HttpStatus.ACCEPTED);
        }
        MvcTestResult bloqueada = solicitar("otro." + UUID.randomUUID() + "@correo.test", ip);
        esperarError(bloqueada, HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS");
        assertThat((String) valor(bloqueada, "$.detail")).contains("15 minutos");

        // La hora de negocio no libera el cupo: la ventana se mide con el reloj de seguridad.
        reloj.fijar(AHORA.plus(Duration.ofHours(1)));
        esperarError(solicitar(cuenta.email(), nuevaIp()), HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS");

        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(15)));
        assertThat(solicitar(cuenta.email(), ip)).hasStatus(HttpStatus.ACCEPTED);
    }
}
