package pe.edu.utp.sigasp.identidad.interno;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

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
import pe.edu.utp.sigasp.compartido.error.DemasiadosIntentosException;
import pe.edu.utp.sigasp.compartido.error.Problemas.ErrorCampo;
import pe.edu.utp.sigasp.compartido.error.ValidacionException;
import pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad;

/**
 * Cambio de contraseña de un usuario autenticado (POST /cuenta/contrasena).
 * <ul>
 *   <li>Valida la nueva con la política (400 en el campo {@code nueva}) y exige que sea distinta de la actual.</li>
 *   <li>Verifica la actual (422 {@code CONTRASENA_INCORRECTA}). Los fallos cuentan para el mismo bloqueo por
 *       intentos del login: una sesión robada no sirve para adivinar la contraseña. Mientras dura el bloqueo
 *       responde 429 {@code DEMASIADOS_INTENTOS} con {@code Retry-After} (la persona ya está autenticada, así que
 *       informar el bloqueo no revela nada a terceros).</li>
 *   <li>Incrementa {@code version_credenciales}: las <b>demás</b> sesiones del usuario dejan de valer. La sesión
 *       actual se conserva, con identificador nuevo y la versión nueva. {@code credenciales_cambiadas_en} guarda
 *       la hora real del cambio, solo como dato informativo.</li>
 * </ul>
 */
@Service
public class CambioContrasena {

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final PoliticaContrasenas politica;
    private final IntentosLogin intentos;
    private final RegistroCredenciales credenciales;
    private final Sesiones sesiones;
    private final Auditoria auditoria;
    private final Clock relojSeguridad;
    private final TransactionTemplate transaccion;

    CambioContrasena(JdbcClient jdbc, PasswordEncoder encoder, PoliticaContrasenas politica, IntentosLogin intentos,
            RegistroCredenciales credenciales, Sesiones sesiones, Auditoria auditoria,
            @RelojSeguridad Clock relojSeguridad, PlatformTransactionManager transacciones) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.politica = politica;
        this.intentos = intentos;
        this.credenciales = credenciales;
        this.sesiones = sesiones;
        this.auditoria = auditoria;
        this.relojSeguridad = relojSeguridad;
        this.transaccion = new TransactionTemplate(transacciones);
    }

    public void cambiar(UsuarioAutenticado usuario, String actual, String nueva, HttpServletRequest request,
            HttpServletResponse response) {
        List<ErrorCampo> errores = new ArrayList<>();
        if (actual == null || actual.isEmpty()) {
            errores.add(new ErrorCampo("actual", "Ingresa tu contraseña actual."));
        }
        errores.addAll(politica.evaluar("nueva", nueva, usuario.getUsername()));
        if (actual != null && !actual.isEmpty() && actual.equals(nueva)) {
            errores.add(new ErrorCampo("nueva", "La nueva contraseña debe ser distinta de la actual."));
        }
        if (!errores.isEmpty()) {
            throw new ValidacionException(errores);
        }

        String correo = usuario.getUsername();
        Optional<Duration> bloqueo = intentos.reservar(correo);
        if (bloqueo.isPresent()) {
            auditarRechazo(usuario, CodigoError.DEMASIADOS_INTENTOS);
            // El bloqueo puede venir de inicios de sesión fallidos, no solo de este formulario: el detalle lo explica.
            throw DemasiadosIntentosException.porMotivo("Por seguridad, el cambio de contraseña está bloqueado "
                    + "temporalmente porque hubo varios intentos fallidos con la contraseña de tu cuenta.",
                    bloqueo.get());
        }
        Instant ahora = relojSeguridad.instant().truncatedTo(ChronoUnit.MICROS);
        int nuevaVersion;
        try {
            nuevaVersion = transaccion.execute(estado -> {
                String hashActual = jdbc.sql("SELECT password_hash FROM usuario WHERE id = :id AND activo FOR UPDATE")
                        .param("id", usuario.id())
                        .query(String.class)
                        .optional()
                        .orElseThrow(() -> new ApiException(CodigoError.NO_AUTENTICADO));
                if (!encoder.matches(actual, hashActual)) {
                    throw new ApiException(CodigoError.CONTRASENA_INCORRECTA);
                }
                int version = jdbc.sql("""
                                UPDATE usuario SET password_hash = :hash,
                                                   version_credenciales = version_credenciales + 1,
                                                   credenciales_cambiadas_en = :ahora
                                WHERE id = :id
                                RETURNING version_credenciales
                                """)
                        .param("hash", encoder.encode(nueva))
                        .param("ahora", Timestamp.from(ahora))
                        .param("id", usuario.id())
                        .query(Integer.class)
                        .single();
                auditoria.registrar(RegistroAuditoria.exito("CONTRASENA_CAMBIAR", "USUARIO", usuario.id(), null,
                        Map.of()), Optional.of(usuario.comoActor()));
                return version;
            });
        } catch (ApiException ex) {
            if (ex.codigo() == CodigoError.CONTRASENA_INCORRECTA) {
                auditarRechazo(usuario, CodigoError.CONTRASENA_INCORRECTA);
            }
            throw ex;
        }
        intentos.exito(correo);
        credenciales.recordar(usuario.id(), nuevaVersion);
        // La sesión actual sigue: identificador nuevo y la versión de credenciales recién creada.
        sesiones.establecer(usuario.reautenticado(nuevaVersion, ahora), request, response);
    }

    private void auditarRechazo(UsuarioAutenticado usuario, CodigoError codigo) {
        auditoria.registrarIndependiente(new RegistroAuditoria("CONTRASENA_CAMBIAR", "USUARIO", usuario.id().toString(),
                ResultadoAuditoria.RECHAZO, codigo.name(), null, Map.of()), Optional.of(usuario.comoActor()));
    }
}
