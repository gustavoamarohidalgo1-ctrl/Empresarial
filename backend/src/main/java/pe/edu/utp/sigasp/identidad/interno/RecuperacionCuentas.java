package pe.edu.utp.sigasp.identidad.interno;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.error.Problemas.ErrorCampo;
import pe.edu.utp.sigasp.compartido.error.ValidacionException;
import pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad;
import pe.edu.utp.sigasp.correo.Correo;

/**
 * Recuperación de contraseña con enlace de un solo uso.
 * <ul>
 *   <li><b>Solicitud</b> (siempre 202): si la cuenta existe y está activa, genera un token aleatorio de 32 bytes
 *       (base64url), guarda solo su SHA-256 con vigencia de 30 minutos y lo envía por el correo simulado. La
 *       respuesta no revela si el correo está registrado.</li>
 *   <li><b>Restablecimiento</b>: el token debe existir, no haber vencido ni haberse usado (si no, 422
 *       {@code ENLACE_INVALIDO}). Cambia el hash, incrementa {@code version_credenciales} (las sesiones
 *       anteriores dejan de valer) e invalida este y cualquier otro enlace pendiente del usuario.</li>
 * </ul>
 * La vigencia del enlace se mide con el <b>reloj de seguridad</b> (hora real): simular la hora de negocio en
 * desarrollo no lo mantiene vivo ni lo vence antes de tiempo.
 * <p>
 * El enlace absoluto del cuerpo usa {@code sigasp.correo.url-base}; si no está definida, el origen de la solicitud
 * (esquema, host y puerto tal como los resuelve Spring, también detrás de un proxy con la estrategia de
 * cabeceras configurada). En producción conviene definirla: el host de la solicitud lo elige el cliente.
 */
@Service
public class RecuperacionCuentas {

    private static final Logger log = LoggerFactory.getLogger(RecuperacionCuentas.class);
    static final Duration VIGENCIA = Duration.ofMinutes(30);
    static final int BYTES_TOKEN = 32;
    private static final int MAX_LARGO_TOKEN = 128;

    private final JdbcClient jdbc;
    private final Correo correo;
    private final PoliticaContrasenas politica;
    private final LimitesCuenta limites;
    private final PasswordEncoder encoder;
    private final RegistroCredenciales credenciales;
    private final IntentosLogin intentos;
    private final Auditoria auditoria;
    private final Clock relojSeguridad;
    private final TransactionTemplate transaccion;
    private final String urlBase;
    private final SecureRandom azar = new SecureRandom();

    RecuperacionCuentas(JdbcClient jdbc, Correo correo, PoliticaContrasenas politica, LimitesCuenta limites,
            PasswordEncoder encoder, RegistroCredenciales credenciales, IntentosLogin intentos, Auditoria auditoria,
            @RelojSeguridad Clock relojSeguridad, PlatformTransactionManager transacciones,
            @Value("${sigasp.correo.url-base:}") String urlBase) {
        this.jdbc = jdbc;
        this.correo = correo;
        this.politica = politica;
        this.limites = limites;
        this.encoder = encoder;
        this.credenciales = credenciales;
        this.intentos = intentos;
        this.auditoria = auditoria;
        this.relojSeguridad = relojSeguridad;
        this.transaccion = new TransactionTemplate(transacciones);
        this.urlBase = urlBase == null ? "" : urlBase.strip();
    }

    // ------------------------------------------------------------------
    // Solicitud
    // ------------------------------------------------------------------

    /**
     * @param ip              IP del cliente (para el límite por IP)
     * @param origenSolicitud origen de la solicitud ({@code https://host[:puerto]}), usado para el enlace absoluto
     *                        del correo solo si no hay {@code sigasp.correo.url-base}
     */
    public void solicitar(String email, String ip, String origenSolicitud) {
        String correoNormalizado = email == null ? "" : email.trim().toLowerCase(Locale.ROOT);
        if (correoNormalizado.isEmpty()) {
            throw ValidacionException.campo("email", "Ingresa tu correo.");
        }
        if (correoNormalizado.length() > 160 || !RegistroCuentas.EMAIL.matcher(correoNormalizado).matches()) {
            throw ValidacionException.campo("email", "Formato de correo inválido");
        }
        // Cuentan todas las solicitudes, exista o no la cuenta: si no, el 429 revelaría qué correos existen.
        limites.recuperacion(ip, correoNormalizado);

        Optional<Cuenta> cuenta = jdbc.sql("""
                        SELECT id, email, nombre_visible FROM usuario WHERE lower(email) = :email AND activo
                        """)
                .param("email", correoNormalizado)
                .query((rs, i) -> new Cuenta(rs.getObject("id", UUID.class), rs.getString("email"),
                        rs.getString("nombre_visible")))
                .optional();
        if (cuenta.isEmpty()) {
            log.debug("Solicitud de recuperación para un correo sin cuenta activa; no se envía nada");
            return;
        }
        Cuenta destino = cuenta.get();
        String token = tokenNuevo();
        String enlace = "/restablecer?token=" + token;
        String enlaceAbsoluto = baseDeEnlaces(urlBase, origenSolicitud) + enlace;
        Instant ahora = relojSeguridad.instant().truncatedTo(ChronoUnit.MICROS);
        transaccion.executeWithoutResult(estado -> {
            jdbc.sql("""
                            INSERT INTO token_recuperacion (id, usuario_id, hash_token, creado_en, expira_en)
                            VALUES (:id, :usuario, :hash, :ahora, :expira)
                            """)
                    .param("id", UUID.randomUUID())
                    .param("usuario", destino.id())
                    .param("hash", sha256(token))
                    .param("ahora", Timestamp.from(ahora))
                    .param("expira", Timestamp.from(ahora.plus(VIGENCIA)))
                    .update();
            correo.enviar(destino.email(), "Restablece tu contraseña de SIGA-SP",
                    cuerpo(destino.nombre(), enlaceAbsoluto), enlace);
            auditoria.registrar(RegistroAuditoria.exito("RECUPERACION_SOLICITAR", "USUARIO", destino.id(), null,
                    Map.of()), Optional.empty());
        });
    }

    /**
     * Base de los enlaces absolutos: la URL configurada o, si no hay, el origen de la solicitud; sin barra final.
     * Si no hay ninguna, el enlace queda relativo.
     */
    static String baseDeEnlaces(String configurada, String origenSolicitud) {
        String base = configurada != null && !configurada.isBlank() ? configurada.strip()
                : origenSolicitud == null ? "" : origenSolicitud.strip();
        while (base.endsWith("/")) {
            base = base.substring(0, base.length() - 1);
        }
        return base;
    }

    private String cuerpo(String nombre, String enlace) {
        return """
                %s

                Recibimos una solicitud para restablecer la contraseña de tu cuenta en SIGA-SP.

                Para crear una contraseña nueva, abre el siguiente enlace. Es válido durante 30 minutos y solo \
                puede usarse una vez:

                %s

                Si no solicitaste este cambio, puedes ignorar este mensaje: tu contraseña actual seguirá \
                funcionando y nadie podrá cambiarla sin este enlace.

                Por tu seguridad, no compartas este enlace con nadie. SIGA-SP nunca te pedirá tu contraseña \
                por correo, teléfono ni mensajes.

                Atentamente,
                Equipo de Atención al Paciente
                SIGA-SP · Atención ambulatoria
                """.formatted(saludo(nombre), enlace);
    }

    private static String saludo(String nombre) {
        if (nombre == null || nombre.isBlank()) {
            return "Hola:";
        }
        return "Hola, " + nombre.strip().split("\\s+")[0] + ":";
    }

    // ------------------------------------------------------------------
    // Restablecimiento
    // ------------------------------------------------------------------

    public void restablecer(String token, String password) {
        if (token == null || token.isBlank() || token.length() > MAX_LARGO_TOKEN) {
            auditarEnlaceInvalido();
            throw new ApiException(CodigoError.ENLACE_INVALIDO);
        }
        Instant ahora = relojSeguridad.instant().truncatedTo(ChronoUnit.MICROS);
        Restablecido resultado;
        try {
            resultado = transaccion.execute(estado -> aplicar(sha256(token.trim()), password, ahora));
        } catch (ApiException ex) {
            if (ex.codigo() == CodigoError.ENLACE_INVALIDO) {
                auditarEnlaceInvalido();
            }
            throw ex;
        }
        credenciales.recordar(resultado.usuarioId(), resultado.version());
        // Restablecer por correo demuestra la propiedad de la cuenta: también levanta un bloqueo por intentos.
        intentos.exito(resultado.email());
    }

    private Restablecido aplicar(String hashToken, String password, Instant ahora) {
        TokenVigente vigente = jdbc.sql("""
                        SELECT t.id, t.usuario_id, t.expira_en, t.usado_en, u.email, u.activo
                        FROM token_recuperacion t JOIN usuario u ON u.id = t.usuario_id
                        WHERE t.hash_token = :hash
                        FOR UPDATE OF t
                        """)
                .param("hash", hashToken)
                .query((rs, i) -> new TokenVigente(rs.getObject("usuario_id", UUID.class), rs.getString("email"),
                        rs.getBoolean("activo"), rs.getTimestamp("expira_en").toInstant(),
                        rs.getTimestamp("usado_en") != null))
                .optional()
                .filter(t -> t.activo() && !t.usado() && t.expiraEn().isAfter(ahora))
                .orElseThrow(() -> new ApiException(CodigoError.ENLACE_INVALIDO));

        List<ErrorCampo> errores = politica.evaluar("password", password, vigente.email());
        if (!errores.isEmpty()) {
            throw new ValidacionException(errores);
        }
        int version = jdbc.sql("""
                        UPDATE usuario SET password_hash = :hash,
                                           version_credenciales = version_credenciales + 1,
                                           credenciales_cambiadas_en = :ahora
                        WHERE id = :usuario
                        RETURNING version_credenciales
                        """)
                .param("hash", encoder.encode(password))
                .param("ahora", Timestamp.from(ahora))
                .param("usuario", vigente.usuarioId())
                .query(Integer.class)
                .single();
        // Este enlace y cualquier otro pendiente del mismo usuario dejan de servir.
        jdbc.sql("UPDATE token_recuperacion SET usado_en = :ahora WHERE usuario_id = :usuario AND usado_en IS NULL")
                .param("ahora", Timestamp.from(ahora))
                .param("usuario", vigente.usuarioId())
                .update();
        auditoria.registrar(RegistroAuditoria.exito("CONTRASENA_RESTABLECER", "USUARIO", vigente.usuarioId(), null,
                Map.of()), Optional.empty());
        return new Restablecido(vigente.usuarioId(), vigente.email(), version);
    }

    private void auditarEnlaceInvalido() {
        auditoria.registrarIndependiente(new RegistroAuditoria("CONTRASENA_RESTABLECER", "USUARIO", null,
                ResultadoAuditoria.RECHAZO, CodigoError.ENLACE_INVALIDO.name(), null, Map.of()), Optional.empty());
    }

    // ------------------------------------------------------------------
    // Apoyo
    // ------------------------------------------------------------------

    private String tokenNuevo() {
        byte[] bytes = new byte[BYTES_TOKEN];
        azar.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static String sha256(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible", ex);
        }
    }

    private record Cuenta(UUID id, String email, String nombre) {
    }

    private record TokenVigente(UUID usuarioId, String email, boolean activo, Instant expiraEn, boolean usado) {
    }

    private record Restablecido(UUID usuarioId, String email, int version) {
    }
}
