package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.CLAVE;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.compartido.seguridad.Rol;
import pe.edu.utp.sigasp.soporte.CuentasPrueba;
import pe.edu.utp.sigasp.soporte.CuentasPrueba.Cuenta;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * v1.1 · Cambio de contraseña: verifica la actual, aplica la política, conserva la sesión actual (con
 * identificador nuevo) e invalida las demás sesiones del usuario por versión de credenciales, sin depender del
 * reloj de negocio simulado. Durante el bloqueo por intentos responde 429 con Retry-After.
 */
@DisplayName("v1.1 · Cambio de contraseña")
class CambioContrasenaIntegracionTest extends PruebaApi {

    private static final String CAMBIO = "/api/v1/cuenta/contrasena";
    private static final String NUEVA = "Parque-Kennedy-2026";
    /** Hora real simulada del reloj de seguridad (distinta de la hora de negocio {@code AHORA}). */
    private static final Instant HORA_REAL = Instant.parse("2026-10-23T15:00:00Z");

    @Autowired
    private CuentasPrueba cuentas;

    private Cuenta cuenta;

    @BeforeEach
    void cuenta() {
        cuenta = cuentas.paciente("Valeria");
    }

    private MvcTestResult cambiar(MockHttpSession sesion, String actual, String nueva) {
        return mvc.post().uri(CAMBIO).session(sesion).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"actual\":\"" + actual + "\",\"nueva\":\"" + nueva + "\"}").exchange();
    }

    private MvcTestResult intentarLogin(String email, String password) {
        return mvc.post().uri("/api/v1/auth/login").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}").exchange();
    }

    @Test
    @DisplayName("Cambiar responde 204: la sesión actual sigue (id nuevo), las demás se cierran y vale la nueva contraseña")
    void cambioCorrecto() {
        relojSeguridad.fijar(HORA_REAL);
        MockHttpSession actual = login(cuenta.email());
        MockHttpSession otra = login(cuenta.email());
        reloj.fijar(AHORA.plus(Duration.ofMinutes(1)));
        String idAnterior = actual.getId();

        assertThat(cambiar(actual, CLAVE, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        assertThat(actual.getId()).as("identificador de sesión renovado").isNotEqualTo(idAnterior);
        assertThat(get(actual, "/api/v1/auth/sesion")).hasStatusOk().bodyJson().extractingPath("$.email")
                .isEqualTo(cuenta.email());
        assertThat(get(actual, CITAS)).hasStatusOk();
        esperarError(get(otra, CITAS), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        assertThat(otra.isInvalid()).isTrue();
        esperarError(intentarLogin(cuenta.email(), CLAVE), HttpStatus.UNAUTHORIZED, "CREDENCIALES_INVALIDAS");
        assertThat(intentarLogin(cuenta.email(), NUEVA)).hasStatusOk();
        assertThat(get(actual, CITAS)).as("la sesión actual sigue después del login nuevo").hasStatusOk();

        assertThat(contar("SELECT version_credenciales FROM usuario WHERE id = ?", cuenta.usuarioId())).isEqualTo(1);
        assertThat(instante("SELECT credenciales_cambiadas_en FROM usuario WHERE id = ?", cuenta.usuarioId()))
                .as("dato informativo con la hora real, no la de negocio").isEqualTo(HORA_REAL);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CONTRASENA_CAMBIAR' AND resultado = 'EXITO' "
                + "AND actor_usuario_id = ? AND ocurrido_en = ?", cuenta.usuarioId(),
                Timestamp.from(AHORA.plus(Duration.ofMinutes(1))))).as("la bitácora sigue la hora de negocio")
                .isEqualTo(1);
    }

    @Test
    @DisplayName("Con el reloj de negocio atrasado, el cambio igual cierra las demás sesiones y la actual sigue")
    void cambioConRelojAtrasado() {
        MockHttpSession actual = login(cuenta.email());
        MockHttpSession otra = login(cuenta.email());
        reloj.fijar(AHORA.minus(Duration.ofDays(3)));

        assertThat(cambiar(actual, CLAVE, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        esperarError(get(otra, CITAS), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        assertThat(get(actual, CITAS)).hasStatusOk();
    }

    @Test
    @DisplayName("Tras cambiarla con el reloj de negocio adelantado, volver a la hora real no cierra la sesión actual ni las nuevas")
    void cambioConRelojAdelantado() {
        MockHttpSession actual = login(cuenta.email());
        reloj.fijar(AHORA.plus(Duration.ofDays(2)));
        assertThat(cambiar(actual, CLAVE, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        reloj.fijar(AHORA);
        MvcTestResult nuevo = intentarLogin(cuenta.email(), NUEVA);
        assertThat(nuevo).hasStatusOk();
        MockHttpSession nueva = (MockHttpSession) nuevo.getRequest().getSession(false);

        for (int i = 0; i < 2; i++) {
            assertThat(get(actual, CITAS)).hasStatusOk();
            assertThat(get(nueva, CITAS)).hasStatusOk();
        }
    }

    @Test
    @DisplayName("Con la contraseña actual incorrecta responde 422 CONTRASENA_INCORRECTA y nada cambia")
    void actualIncorrecta() {
        MockHttpSession sesion = login(cuenta.email());

        esperarError(cambiar(sesion, "No-Es-La-Mia-1", NUEVA), HttpStatus.UNPROCESSABLE_CONTENT,
                "CONTRASENA_INCORRECTA");

        assertThat(get(sesion, CITAS)).hasStatusOk();
        assertThat(intentarLogin(cuenta.email(), CLAVE)).hasStatusOk();
        assertThat(instante("SELECT credenciales_cambiadas_en FROM usuario WHERE id = ?", cuenta.usuarioId()))
                .isNull();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CONTRASENA_CAMBIAR' "
                + "AND resultado = 'RECHAZO' AND codigo = 'CONTRASENA_INCORRECTA'")).isEqualTo(1);
    }

    @Test
    @DisplayName("La nueva contraseña sigue la política (campo nueva) y debe ser distinta de la actual")
    void politica() {
        MockHttpSession sesion = login(cuenta.email());

        MvcTestResult debil = cambiar(sesion, CLAVE, "qwerty12345");
        MvcTestResult igual = cambiar(sesion, CLAVE, CLAVE);
        MvcTestResult sinActual = cambiar(sesion, "", NUEVA);

        esperarError(debil, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(debil, "$.errores[*].campo")).containsOnly("nueva");
        esperarError(igual, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(igual, "$.errores[*].mensaje"))
                .containsExactly("La nueva contraseña debe ser distinta de la actual.");
        esperarError(sinActual, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(sinActual, "$.errores[*].campo")).containsExactly("actual");
        assertThat(intentarLogin(cuenta.email(), CLAVE)).hasStatusOk();
    }

    @Test
    @DisplayName("Los fallos cuentan para el bloqueo por intentos; durante el bloqueo responde 429 con Retry-After")
    void bloqueoPorIntentos() {
        relojSeguridad.fijar(HORA_REAL);
        MockHttpSession sesion = login(cuenta.email());
        for (int i = 1; i <= 5; i++) {
            esperarError(cambiar(sesion, "Equivocada-" + i, NUEVA), HttpStatus.UNPROCESSABLE_CONTENT,
                    "CONTRASENA_INCORRECTA");
        }
        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(5)));

        MvcTestResult bloqueado = cambiar(sesion, CLAVE, NUEVA);

        esperarError(bloqueado, HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS");
        assertThat(bloqueado.getResponse().getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("600");
        assertThat((String) valor(bloqueado, "$.detail")).contains("cambio de contraseña", "10 minutos");
        // El bloqueo puede venir de inicios de sesión fallidos de otra persona: el detalle nombra la causa real.
        assertThat((String) valor(bloqueado, "$.detail"))
                .contains("intentos fallidos con la contraseña de tu cuenta")
                .doesNotContain("Hiciste demasiadas solicitudes");
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CONTRASENA_CAMBIAR' "
                + "AND resultado = 'RECHAZO' AND codigo = 'DEMASIADOS_INTENTOS'")).isEqualTo(1);
        assertThat(contar("SELECT version_credenciales FROM usuario WHERE id = ?", cuenta.usuarioId())).isZero();

        // Adelantar la hora de negocio no levanta el bloqueo: lo mide el reloj de seguridad.
        reloj.fijar(AHORA.plus(Duration.ofHours(2)));
        esperarError(cambiar(sesion, CLAVE, NUEVA), HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS");
        assertThat(get(sesion, CITAS)).as("el bloqueo no cierra la sesión").hasStatusOk();

        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(15)));
        assertThat(cambiar(sesion, CLAVE, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);
        assertThat(intentarLogin(cuenta.email(), NUEVA)).hasStatusOk();
    }

    @Test
    @DisplayName("Cualquier rol autenticado puede cambiarla; sin sesión responde 401 y sin CSRF 403")
    void rolesYProteccion() {
        Cuenta operador = cuentas.personal(Rol.OPERADOR);
        MockHttpSession sesion = login(operador.email());
        assertThat(cambiar(sesion, CLAVE, NUEVA)).hasStatus(HttpStatus.NO_CONTENT);

        esperarError(mvc.post().uri(CAMBIO).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"actual\":\"x\",\"nueva\":\"y\"}").exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        esperarError(mvc.post().uri(CAMBIO).session(login(cuenta.email())).contentType(MediaType.APPLICATION_JSON)
                .content("{\"actual\":\"" + CLAVE + "\",\"nueva\":\"" + NUEVA + "\"}").exchange(),
                HttpStatus.FORBIDDEN, "CSRF_INVALIDO");
    }
}
