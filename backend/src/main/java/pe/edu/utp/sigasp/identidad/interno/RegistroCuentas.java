package pe.edu.utp.sigasp.identidad.interno;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
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
import pe.edu.utp.sigasp.compartido.seguridad.Rol;
import pe.edu.utp.sigasp.pacientes.RegistroPacientes;
import pe.edu.utp.sigasp.pacientes.RegistroPacientes.NuevoPaciente;

/**
 * Registro público de pacientes (POST /auth/registro).
 * <ol>
 *   <li>Normaliza y valida todos los campos, incluida la política de contraseñas: los errores se devuelven
 *       juntos (400 {@code VALIDACION}). El teléfono es obligatorio (se usa para los recordatorios) y tiene el
 *       mismo formato que en el perfil.</li>
 *   <li>Aplica el límite por IP (429): cuentan los intentos con datos válidos, creen o no la cuenta, para
 *       que no sirva como oráculo masivo de correos registrados.</li>
 *   <li>Crea la ficha del paciente (por la API del módulo de pacientes), con el instante y la versión de la
 *       política de privacidad aceptada ({@code sigasp.privacidad.version}), y el usuario en una sola
 *       transacción; un correo ya registrado responde 409 {@code CORREO_REGISTRADO}.</li>
 *   <li>Inicia la sesión igual que el login (identificador nuevo) y audita {@code REGISTRO} sin datos personales.</li>
 * </ol>
 */
@Service
public class RegistroCuentas {

    /** Letras (con tildes y diéresis), espacios internos, apóstrofo y guion. */
    static final Pattern NOMBRE = Pattern.compile("^[\\p{L}\\p{M}]+(?:[ '’-][\\p{L}\\p{M}]+)*$");
    static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");
    /** Mismo formato que {@code PATCH /pacientes/me/perfil}: dígitos con espacios simples y {@code +} opcional. */
    static final Pattern TELEFONO = Pattern.compile("^\\+?[0-9](?: ?[0-9]){6,19}$");
    static final int MAX_TELEFONO = 30;

    private final RegistroPacientes pacientes;
    private final PoliticaContrasenas politica;
    private final LimitesCuenta limites;
    private final PasswordEncoder encoder;
    private final JdbcClient jdbc;
    private final Sesiones sesiones;
    private final RegistroCredenciales credenciales;
    private final Auditoria auditoria;
    private final Clock reloj;
    private final Clock relojSeguridad;
    private final TransactionTemplate transaccion;
    private final String versionPrivacidad;

    RegistroCuentas(RegistroPacientes pacientes, PoliticaContrasenas politica, LimitesCuenta limites,
            PasswordEncoder encoder, JdbcClient jdbc, Sesiones sesiones, RegistroCredenciales credenciales,
            Auditoria auditoria, Clock reloj, @RelojSeguridad Clock relojSeguridad,
            PlatformTransactionManager transacciones,
            @Value("${sigasp.privacidad.version:1.0}") String versionPrivacidad) {
        this.pacientes = pacientes;
        this.politica = politica;
        this.limites = limites;
        this.encoder = encoder;
        this.jdbc = jdbc;
        this.sesiones = sesiones;
        this.credenciales = credenciales;
        this.auditoria = auditoria;
        this.reloj = reloj;
        this.relojSeguridad = relojSeguridad;
        this.transaccion = new TransactionTemplate(transacciones);
        if (versionPrivacidad == null || versionPrivacidad.isBlank() || versionPrivacidad.strip().length() > 20) {
            throw new IllegalStateException("sigasp.privacidad.version debe tener entre 1 y 20 caracteres");
        }
        this.versionPrivacidad = versionPrivacidad.strip();
    }

    /** Datos del formulario de registro tal como llegan. */
    public record DatosRegistro(String nombres, String apellidos, String email, String telefono, String password,
            Boolean aceptaPrivacidad) {

        @Override
        public String toString() {
            return "DatosRegistro[datos personales y contraseña omitidos]";
        }
    }

    public UsuarioAutenticado registrar(DatosRegistro datos, String ip, HttpServletRequest request,
            HttpServletResponse response) {
        String nombres = normalizarNombre(datos.nombres());
        String apellidos = normalizarNombre(datos.apellidos());
        String email = datos.email() == null ? null : datos.email().trim().toLowerCase(Locale.ROOT);
        String telefono = datos.telefono() == null || datos.telefono().isBlank() ? null
                : datos.telefono().trim().replaceAll(" {2,}", " ");
        validar(nombres, apellidos, email, telefono, datos.password(), datos.aceptaPrivacidad());

        limites.registro(ip);
        if (correoRegistrado(email)) {
            auditarRechazo(email);
            throw new ApiException(CodigoError.CORREO_REGISTRADO);
        }

        String hash = encoder.encode(datos.password());
        Instant ahora = reloj.instant().truncatedTo(ChronoUnit.MICROS);
        UUID usuarioId = UUID.randomUUID();
        String nombreVisible = nombres + " " + apellidos;
        UUID pacienteId;
        try {
            pacienteId = transaccion.execute(estado -> {
                UUID paciente = pacientes.registrar(new NuevoPaciente(nombres, apellidos, email, telefono, ahora,
                        versionPrivacidad));
                jdbc.sql("""
                                INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo,
                                                     paciente_id, creado_en)
                                VALUES (:id, :email, :hash, :nombre, :rol, TRUE, :paciente, :ahora)
                                """)
                        .param("id", usuarioId)
                        .param("email", email)
                        .param("hash", hash)
                        .param("nombre", recortar(nombreVisible, 120))
                        .param("rol", Rol.PACIENTE.name())
                        .param("paciente", paciente)
                        .param("ahora", Timestamp.from(ahora))
                        .update();
                return paciente;
            });
        } catch (DuplicateKeyException ex) {
            // Dos registros simultáneos con el mismo correo: el índice único decide y el segundo recibe 409.
            if (ex.getMessage() == null || !ex.getMessage().contains("ux_usuario_email")) {
                throw ex;
            }
            auditarRechazo(email);
            throw new ApiException(CodigoError.CORREO_REGISTRADO);
        }

        credenciales.recordar(usuarioId, RegistroCredenciales.VERSION_INICIAL);
        UsuarioAutenticado usuario = UsuarioAutenticado.nuevo(usuarioId, email, recortar(nombreVisible, 120),
                Rol.PACIENTE, pacienteId, relojSeguridad.instant().truncatedTo(ChronoUnit.MICROS));
        sesiones.establecer(usuario, request, response);
        auditoria.registrarIndependiente(RegistroAuditoria.exito("REGISTRO", "USUARIO", usuarioId, null,
                Map.of("rol", Rol.PACIENTE.name())), Optional.of(usuario.comoActor()));
        return usuario;
    }

    private void validar(String nombres, String apellidos, String email, String telefono, String password,
            Boolean aceptaPrivacidad) {
        List<ErrorCampo> errores = new ArrayList<>();
        validarNombre(errores, "nombres", nombres, "tus nombres");
        validarNombre(errores, "apellidos", apellidos, "tus apellidos");
        if (email == null || email.isEmpty()) {
            errores.add(new ErrorCampo("email", "Ingresa tu correo."));
        } else if (email.length() > 160) {
            errores.add(new ErrorCampo("email", "El correo no puede superar los 160 caracteres."));
        } else if (!EMAIL.matcher(email).matches()) {
            errores.add(new ErrorCampo("email", "Formato de correo inválido"));
        }
        if (telefono == null) {
            errores.add(new ErrorCampo("telefono", "Ingresa tu teléfono."));
        } else if (telefono.length() > MAX_TELEFONO || !TELEFONO.matcher(telefono).matches()) {
            errores.add(new ErrorCampo("telefono", "Formato de teléfono inválido"));
        }
        errores.addAll(politica.evaluar("password", password, email));
        if (!Boolean.TRUE.equals(aceptaPrivacidad)) {
            errores.add(new ErrorCampo("aceptaPrivacidad",
                    "Debes aceptar la política de privacidad para crear tu cuenta."));
        }
        if (!errores.isEmpty()) {
            throw new ValidacionException(errores);
        }
    }

    private static void validarNombre(List<ErrorCampo> errores, String campo, String valor, String descripcion) {
        if (valor == null || valor.isEmpty()) {
            errores.add(new ErrorCampo(campo, "Ingresa " + descripcion + "."));
        } else if (valor.codePointCount(0, valor.length()) < 2 || valor.codePointCount(0, valor.length()) > 80) {
            errores.add(new ErrorCampo(campo, "Debe tener entre 2 y 80 caracteres."));
        } else if (!NOMBRE.matcher(valor).matches()) {
            errores.add(new ErrorCampo(campo, "Usa solo letras, espacios, apóstrofo (') o guion (-)."));
        }
    }

    /** Quita espacios en los extremos y deja uno solo entre palabras. */
    static String normalizarNombre(String valor) {
        return valor == null ? null : valor.strip().replaceAll("\\s+", " ");
    }

    private boolean correoRegistrado(String email) {
        return jdbc.sql("SELECT count(*) FROM usuario WHERE lower(email) = :email")
                .param("email", email)
                .query(Long.class)
                .single() > 0;
    }

    private void auditarRechazo(String email) {
        // Como en el login fallido, solo el dominio: la bitácora no guarda el correo de un tercero.
        auditoria.registrarIndependiente(new RegistroAuditoria("REGISTRO", "USUARIO", null, ResultadoAuditoria.RECHAZO,
                CodigoError.CORREO_REGISTRADO.name(), null, Map.of("dominio", email.substring(email.indexOf('@')))),
                Optional.empty());
    }

    private static String recortar(String texto, int maximo) {
        return texto.length() > maximo ? texto.substring(0, maximo) : texto;
    }
}
