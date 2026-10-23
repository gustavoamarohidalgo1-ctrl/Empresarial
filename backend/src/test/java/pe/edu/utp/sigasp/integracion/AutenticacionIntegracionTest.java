package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.CLAVE;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S1-R01 · Inicio de sesión: credenciales válidas e inválidas, mensaje genérico, bloqueo tras
 * cinco intentos fallidos y protección CSRF. El bloqueo vive en memoria (uno por JVM), así que
 * cada prueba que falla a propósito usa un usuario propio con correo único.
 */
@DisplayName("S1-R01 · Inicio de sesión, bloqueo y CSRF")
class AutenticacionIntegracionTest extends PruebaApi {

    @Autowired
    private PasswordEncoder encoder;

    private MvcTestResult intentarLogin(String email, String password) {
        return mvc.post().uri("/api/v1/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}")
                .exchange();
    }

    /** Crea un usuario operador con correo único para no compartir el contador de intentos. */
    private String usuarioPropio() {
        String email = "intentos." + UUID.randomUUID() + "@ejemplo.invalid";
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id, creado_en) "
                        + "VALUES (?, ?, ?, 'Usuario Intentos', 'OPERADOR', TRUE, NULL, ?)")
                .params(UUID.randomUUID(), email, encoder.encode(CLAVE), Timestamp.from(AHORA))
                .update();
        return email;
    }

    @Test
    @DisplayName("Con credenciales válidas responde 200 con la sesión, la sesión funciona y el LOGIN queda auditado")
    void credencialesValidas() {
        MvcTestResult resultado = intentarLogin(EMAIL_A, CLAVE);

        assertThat(resultado).hasStatusOk().bodyJson()
                .isLenientlyEqualTo("{\"id\":\"" + USUARIO_A + "\",\"nombre\":\"Ana Prueba\",\"email\":\""
                        + EMAIL_A + "\",\"rol\":\"PACIENTE\"}");
        assertThat(cuerpo(resultado)).doesNotContain("password", "hash", PACIENTE_A.toString());

        MockHttpSession sesion = (MockHttpSession) resultado.getRequest().getSession(false);
        assertThat(get(sesion, "/api/v1/auth/sesion")).hasStatusOk()
                .bodyJson().extractingPath("$.rol").isEqualTo("PACIENTE");

        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'LOGIN' AND resultado = 'EXITO' "
                + "AND actor_usuario_id = ? AND actor_rol = 'PACIENTE'", USUARIO_A)).isEqualTo(1);
    }

    @Test
    @DisplayName("Con credenciales inválidas responde 401 CREDENCIALES_INVALIDAS idéntico exista o no el usuario")
    void credencialesInvalidas() {
        String existente = usuarioPropio();
        String inexistente = "nadie." + UUID.randomUUID() + "@ejemplo.invalid";

        MvcTestResult claveErronea = intentarLogin(existente, "Clave-Equivocada-1");
        MvcTestResult usuarioInexistente = intentarLogin(inexistente, "Clave-Equivocada-1");

        esperarError(claveErronea, HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        esperarError(usuarioInexistente, HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        for (String campo : new String[] {"$.type", "$.title", "$.detail", "$.status"}) {
            assertThat((Object) valor(claveErronea, campo)).as(campo)
                    .isEqualTo(valor(usuarioInexistente, campo));
        }
        assertThat(cuerpo(claveErronea)).doesNotContain(existente, "bloque", "existe");
        assertThat(cuerpo(usuarioInexistente)).doesNotContain(inexistente, "existe");

        // Ambos intentos quedan auditados sin identificar al usuario: solo el dominio del correo.
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'LOGIN' AND resultado = 'DENEGADO' "
                + "AND codigo = 'CREDENCIALES_INVALIDAS' AND actor_usuario_id IS NULL "
                + "AND detalle ->> 'dominio' = '@ejemplo.invalid'")).isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE detalle::text LIKE ? OR detalle::text LIKE ?",
                "%" + existente + "%", "%" + inexistente + "%")).isZero();
    }

    @Test
    @DisplayName("Cinco fallos bloquean la cuenta 15 minutos (hora real) aun con la clave correcta, con el mismo mensaje genérico")
    void bloqueoTrasCincoFallos() {
        Instant horaReal = Instant.parse("2026-10-23T15:00:00Z");
        relojSeguridad.fijar(horaReal);
        String email = usuarioPropio();
        MvcTestResult fallo = null;
        for (int intento = 1; intento <= 5; intento++) {
            fallo = intentarLogin(email, "Clave-Equivocada-" + intento);
            esperarError(fallo, HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        }

        MvcTestResult bloqueado = intentarLogin(email, CLAVE);
        esperarError(bloqueado, HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        assertThat((String) valor(bloqueado, "$.detail")).isEqualTo(valor(fallo, "$.detail"));
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'LOGIN' "
                + "AND codigo = 'CUENTA_BLOQUEADA_TEMPORALMENTE'")).isEqualTo(1);

        relojSeguridad.fijar(horaReal.plus(Duration.ofMinutes(14)).plusSeconds(59));
        esperarError(intentarLogin(email, CLAVE), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");

        // La hora de negocio simulada (PUT /dev/reloj) no levanta el bloqueo: lo mide el reloj de seguridad.
        reloj.fijar(AHORA.plus(Duration.ofDays(1)));
        esperarError(intentarLogin(email, CLAVE), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");

        relojSeguridad.fijar(horaReal.plus(Duration.ofMinutes(15)));
        assertThat(intentarLogin(email, CLAVE)).hasStatusOk();
    }

    @Test
    @DisplayName("Un login correcto antes del quinto fallo reinicia el contador de intentos")
    void loginCorrectoReiniciaContador() {
        String email = usuarioPropio();
        for (int intento = 1; intento <= 4; intento++) {
            esperarError(intentarLogin(email, "mala-" + intento), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        }
        assertThat(intentarLogin(email, CLAVE)).hasStatusOk();
        for (int intento = 1; intento <= 4; intento++) {
            esperarError(intentarLogin(email, "mala-" + intento), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        }
        assertThat(intentarLogin(email, CLAVE)).hasStatusOk();
    }

    @Test
    @DisplayName("Un POST sin token CSRF responde 403 CSRF_INVALIDO y no inicia sesión")
    void loginSinCsrf() {
        MvcTestResult resultado = mvc.post().uri("/api/v1/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + EMAIL_A + "\",\"password\":\"" + CLAVE + "\"}")
                .exchange();

        esperarError(resultado, HttpStatus.FORBIDDEN, "CSRF_INVALIDO");
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'LOGIN' AND resultado = 'EXITO'")).isZero();
        // Sin sesión no se escribe en la bitácora (evita que ráfagas anónimas la llenen); queda en el log.
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA'")).isZero();
    }

    @Test
    @DisplayName("Una acción sobre la cita sin CSRF o con un token inválido responde 403 y la cita no cambia")
    void accionSinCsrf() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult sinToken = mvc.post().uri(CITAS + "/" + cita + "/confirmacion")
                .session(sesion)
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"versionAgenda\":1}")
                .exchange();
        MvcTestResult tokenInvalido = mvc.post().uri(CITAS + "/" + cita + "/confirmacion")
                .session(sesion)
                .with(csrf().useInvalidToken())
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"versionAgenda\":1}")
                .exchange();

        esperarError(sinToken, HttpStatus.FORBIDDEN, "CSRF_INVALIDO");
        esperarError(tokenInvalido, HttpStatus.FORBIDDEN, "CSRF_INVALIDO");
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
        assertThat(tiposEvento(cita)).containsExactly("CREADA");
        assertThat(contar("SELECT count(*) FROM operacion")).isZero();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA' AND codigo = 'CSRF_INVALIDO' "
                + "AND actor_usuario_id = ? AND detalle ->> 'ruta' = ?", USUARIO_A,
                "POST " + CITAS + "/" + cita + "/confirmacion")).isEqualTo(2);
    }
}
