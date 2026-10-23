package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.Origenes.desde;
import static pe.edu.utp.sigasp.soporte.Origenes.nuevaIp;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * v1.1 · Registro de pacientes: crea la ficha y el usuario en una transacción, inicia la sesión como el login,
 * valida todos los campos (teléfono obligatorio) con la política de contraseñas, guarda la versión de la política de
 * privacidad aceptada, rechaza correos repetidos y limita los intentos por IP con el reloj de seguridad.
 */
@DisplayName("v1.1 · Registro de cuenta")
class RegistroCuentaIntegracionTest extends PruebaApi {

    private static final String REGISTRO = "/api/v1/auth/registro";
    private static final String CLAVE_FUERTE = "Mirador-Surco-2026";
    /** Hora real simulada del reloj de seguridad (distinta de la hora de negocio {@code AHORA}). */
    private static final Instant HORA_REAL = Instant.parse("2026-10-23T15:00:00Z");

    private static String cuerpo(String email, String password) {
        return """
                {"nombres":"  Lucía  ","apellidos":"Paredes Rojas","email":"%s","telefono":"+51 987 654 321",
                 "password":"%s","aceptaPrivacidad":true}
                """.formatted(email, password);
    }

    private static String correoNuevo() {
        return "lucia." + UUID.randomUUID().toString().substring(0, 8) + "@correo.test";
    }

    private MvcTestResult registrar(String json, String ip) {
        return mvc.post().uri(REGISTRO).with(csrf()).with(desde(ip))
                .contentType(MediaType.APPLICATION_JSON).content(json).exchange();
    }

    @Test
    @DisplayName("Registrar responde 201 con la sesión iniciada, crea paciente y usuario PACIENTE y audita sin datos personales")
    void registroIniciaSesion() {
        String email = correoNuevo();
        MockHttpSession previa = new MockHttpSession();
        String idPrevio = previa.getId();

        MvcTestResult resultado = mvc.post().uri(REGISTRO).session(previa).with(csrf()).with(desde(nuevaIp()))
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo(email.toUpperCase(), CLAVE_FUERTE))
                .exchange();

        assertThat(resultado).hasStatus(HttpStatus.CREATED).bodyJson()
                .isLenientlyEqualTo("{\"nombre\":\"Lucía Paredes Rojas\",\"email\":\"" + email
                        + "\",\"rol\":\"PACIENTE\"}");
        assertThat(cuerpo(resultado)).doesNotContain("password", CLAVE_FUERTE);
        MockHttpSession sesion = (MockHttpSession) resultado.getRequest().getSession(false);
        assertThat(sesion.getId()).as("identificador de sesión nuevo").isNotEqualTo(idPrevio);
        assertThat(get(sesion, "/api/v1/auth/sesion")).hasStatusOk().bodyJson().extractingPath("$.email")
                .isEqualTo(email);
        assertThat(get(sesion, "/api/v1/pacientes/me/perfil")).hasStatusOk().bodyJson()
                .isLenientlyEqualTo("{\"nombres\":\"Lucía\",\"apellidos\":\"Paredes Rojas\",\"email\":\"" + email
                        + "\",\"telefono\":\"+51 987 654 321\"}");
        assertThat(get(sesion, CITAS)).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(0);

        UUID usuario = UUID.fromString(valor(resultado, "$.id"));
        Map<String, Object> fila = jdbc.sql("""
                        SELECT u.rol, u.activo, u.password_hash, u.version_credenciales, p.codigo,
                               p.privacidad_aceptada_en, p.privacidad_version, p.telefono_contacto
                        FROM usuario u JOIN paciente p ON p.id = u.paciente_id WHERE u.id = ?
                        """).params(usuario).query().singleRow();
        assertThat(fila).containsEntry("rol", "PACIENTE").containsEntry("activo", true)
                .containsEntry("version_credenciales", 0).containsEntry("privacidad_version", "1.0")
                .containsEntry("telefono_contacto", "+51 987 654 321");
        assertThat((String) fila.get("password_hash")).startsWith("{bcrypt}").doesNotContain(CLAVE_FUERTE);
        assertThat((String) fila.get("codigo")).matches("^PAC-[0-9A-Z]{8}$");
        assertThat(fila.get("privacidad_aceptada_en")).isNotNull();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'REGISTRO' AND resultado = 'EXITO' "
                + "AND actor_usuario_id = ? AND entidad_id = ?", usuario, usuario.toString())).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE detalle::text ILIKE ? OR detalle::text LIKE ?",
                "%" + email + "%", "%Lucía%")).as("sin datos personales en la bitácora").isZero();
    }

    @Test
    @DisplayName("Un correo ya registrado (sin distinguir mayúsculas) responde 409 CORREO_REGISTRADO y no crea nada")
    void correoDuplicado() {
        long pacientes = contar("SELECT count(*) FROM paciente");

        MvcTestResult resultado = registrar(cuerpo(EMAIL_A.toUpperCase(), CLAVE_FUERTE), nuevaIp());

        esperarError(resultado, HttpStatus.CONFLICT, "CORREO_REGISTRADO");
        assertThat((String) valor(resultado, "$.detail")).contains("Inicia sesión o recupera tu contraseña");
        assertThat(contar("SELECT count(*) FROM paciente")).isEqualTo(pacientes);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'REGISTRO' AND resultado = 'RECHAZO' "
                + "AND codigo = 'CORREO_REGISTRADO' AND detalle ->> 'dominio' = '@ejemplo.invalid'")).isEqualTo(1);
    }

    @Test
    @DisplayName("Una contraseña débil responde 400 con cada regla incumplida en el campo password")
    void contrasenaDebil() {
        String email = correoNuevo();
        String ip = nuevaIp();

        MvcTestResult corta = registrar(cuerpo(email, "abc123"), ip);
        MvcTestResult sinNumero = registrar(cuerpo(email, "SoloLetrasLargas"), ip);
        MvcTestResult comun = registrar(cuerpo(email, "Password1234"), ip);
        MvcTestResult igualAlCorreo = registrar(cuerpo(email, email), ip);

        for (MvcTestResult resultado : List.of(corta, sinNumero, comun, igualAlCorreo)) {
            esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
            assertThat((List<String>) valor(resultado, "$.errores[*].campo")).containsOnly("password");
        }
        assertThat((List<String>) valor(corta, "$.errores[*].mensaje"))
                .containsExactly("La contraseña debe tener entre 10 y 128 caracteres.");
        assertThat((List<String>) valor(sinNumero, "$.errores[*].mensaje"))
                .containsExactly("La contraseña debe incluir al menos una letra y un número.");
        assertThat((String) valor(comun, "$.errores[0].mensaje")).contains("muy común");
        assertThat((List<String>) valor(igualAlCorreo, "$.errores[*].mensaje"))
                .anyMatch(mensaje -> mensaje.contains("igual a tu correo"));
        assertThat(contar("SELECT count(*) FROM usuario WHERE lower(email) = ?", email)).isZero();

        // Los errores de validación no consumen el cupo de la IP: el registro correcto sigue permitido.
        assertThat(registrar(cuerpo(email, CLAVE_FUERTE), ip)).hasStatus(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("Todos los campos inválidos se informan juntos, con el nombre del campo del JSON")
    void validacionCompleta() {
        MvcTestResult resultado = registrar("""
                {"nombres":"L","apellidos":"Paredes 3","email":"no-es-correo","telefono":"12ab",
                 "password":"corta","aceptaPrivacidad":false}
                """, nuevaIp());

        esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(resultado, "$.errores[*].campo"))
                .containsExactly("nombres", "apellidos", "email", "telefono", "password", "password",
                        "aceptaPrivacidad");
        assertThat((String) valor(resultado, "$.errores[6].mensaje")).contains("política de privacidad");

        MvcTestResult valido = registrar("""
                {"nombres":"María José","apellidos":"O'Connor Pérez-Rojas","email":"%s","telefono":"987654321",
                 "password":"%s","aceptaPrivacidad":true}
                """.formatted(correoNuevo(), CLAVE_FUERTE), nuevaIp());
        assertThat(valido).as("apóstrofo, guion y tildes permitidos; teléfono sin prefijo")
                .hasStatus(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("El teléfono es obligatorio (se usa para los recordatorios) y tiene el formato del perfil")
    void telefonoObligatorio() {
        String email = correoNuevo();
        String ip = nuevaIp();
        String sinTelefono = """
                {"nombres":"Lucía","apellidos":"Paredes Rojas","email":"%s","password":"%s","aceptaPrivacidad":true}
                """.formatted(email, CLAVE_FUERTE);

        for (MvcTestResult resultado : List.of(registrar(sinTelefono, ip),
                registrar(cuerpo(email, CLAVE_FUERTE).replace("+51 987 654 321", "   "), ip))) {
            esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
            assertThat((List<String>) valor(resultado, "$.errores[*].campo")).containsExactly("telefono");
            assertThat((List<String>) valor(resultado, "$.errores[*].mensaje")).containsExactly("Ingresa tu teléfono.");
        }
        for (String invalido : List.of("+51  987", "987-654-321", "+51 987 654 321 000 000 000 000", "teléfono")) {
            MvcTestResult resultado = registrar(cuerpo(email, CLAVE_FUERTE).replace("+51 987 654 321", invalido), ip);
            esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
            assertThat((List<String>) valor(resultado, "$.errores[*].mensaje")).as(invalido)
                    .containsExactly("Formato de teléfono inválido");
        }
        assertThat(contar("SELECT count(*) FROM usuario WHERE lower(email) = ?", email)).isZero();

        // Espacios repetidos se normalizan a uno: queda con el mismo formato que acepta el perfil.
        assertThat(registrar(cuerpo(email, CLAVE_FUERTE).replace("+51 987 654 321", " +51  987  654  321 "), ip))
                .hasStatus(HttpStatus.CREATED);
        assertThat(jdbc.sql("SELECT p.telefono_contacto FROM paciente p JOIN usuario u ON u.paciente_id = p.id "
                + "WHERE u.email = ?").params(email).query(String.class).single()).isEqualTo("+51 987 654 321");
    }

    @Test
    @DisplayName("Más de 5 registros por hora (hora real) desde la misma IP responden 429 con Retry-After; otra IP sí puede")
    void limitePorIp() {
        relojSeguridad.fijar(HORA_REAL);
        String ip = nuevaIp();
        for (int i = 0; i < 5; i++) {
            assertThat(registrar(cuerpo(correoNuevo(), CLAVE_FUERTE), ip)).hasStatus(HttpStatus.CREATED);
        }
        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofMinutes(20)));

        MvcTestResult sexto = registrar(cuerpo(correoNuevo(), CLAVE_FUERTE), ip);

        esperarError(sexto, HttpStatus.TOO_MANY_REQUESTS, "DEMASIADOS_INTENTOS");
        assertThat((String) valor(sexto, "$.detail")).contains("40 minutos");
        assertThat(sexto.getResponse().getHeader(HttpHeaders.RETRY_AFTER)).isEqualTo("2400");
        // Un correo repetido también consume cupo (no sirve para comprobar correos en masa).
        esperarError(registrar(cuerpo(EMAIL_A, CLAVE_FUERTE), ip), HttpStatus.TOO_MANY_REQUESTS,
                "DEMASIADOS_INTENTOS");
        assertThat(registrar(cuerpo(correoNuevo(), CLAVE_FUERTE), nuevaIp())).hasStatus(HttpStatus.CREATED);

        // Adelantar la hora de negocio no libera el cupo: la ventana usa el reloj de seguridad.
        reloj.fijar(AHORA.plus(Duration.ofHours(2)));
        esperarError(registrar(cuerpo(correoNuevo(), CLAVE_FUERTE), ip), HttpStatus.TOO_MANY_REQUESTS,
                "DEMASIADOS_INTENTOS");

        relojSeguridad.fijar(HORA_REAL.plus(Duration.ofHours(1)));
        assertThat(registrar(cuerpo(correoNuevo(), CLAVE_FUERTE), ip)).hasStatus(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("Sin token CSRF responde 403 y no crea la cuenta")
    void sinCsrf() {
        String email = correoNuevo();
        MvcTestResult resultado = mvc.post().uri(REGISTRO).with(desde(nuevaIp()))
                .contentType(MediaType.APPLICATION_JSON).content(cuerpo(email, CLAVE_FUERTE)).exchange();

        esperarError(resultado, HttpStatus.FORBIDDEN, "CSRF_INVALIDO");
        assertThat(contar("SELECT count(*) FROM usuario WHERE lower(email) = ?", email)).isZero();
    }

    @Test
    @DisplayName("Una contraseña larga (más de 72 bytes) se acepta y sirve para iniciar sesión")
    void contrasenaLarga() {
        String email = correoNuevo();
        String larga = "frase de paso muy larga para mi cuenta de salud en Lima 2026 " + "ñ".repeat(30);
        assertThat(registrar(cuerpo(email, larga), nuevaIp())).hasStatus(HttpStatus.CREATED);

        MvcTestResult login = mvc.post().uri("/api/v1/auth/login").with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + larga + "\"}").exchange();
        assertThat(login).hasStatusOk();
        assertThat(jdbc.sql("SELECT password_hash FROM usuario WHERE email = ?").params(email).query(String.class)
                .single()).startsWith("{bcrypt-sha256}");
    }
}
