package pe.edu.utp.sigasp.identidad.interno;

import java.util.Map;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Service;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Autentica, aplica el bloqueo por intentos y crea la sesión con un identificador nuevo
 * (protección contra fijación de sesión). Siempre responde con el mismo error genérico.
 */
@Service
public class InicioSesion {

    private final AuthenticationManager autenticador;
    private final Sesiones sesiones;
    private final IntentosLogin intentos;
    private final Auditoria auditoria;

    InicioSesion(AuthenticationManager autenticador, Sesiones sesiones, IntentosLogin intentos,
            Auditoria auditoria) {
        this.autenticador = autenticador;
        this.sesiones = sesiones;
        this.intentos = intentos;
        this.auditoria = auditoria;
    }

    public UsuarioAutenticado iniciar(String email, String password, HttpServletRequest request,
            HttpServletResponse response) {
        String correo = email.trim();
        // La reserva es atómica: solicitudes en paralelo no pueden superar el máximo de intentos.
        if (!intentos.reservarIntento(correo)) {
            auditarFallo(correo, "CUENTA_BLOQUEADA_TEMPORALMENTE");
            throw new ApiException(CodigoError.CREDENCIALES_INVALIDAS);
        }
        Authentication autenticacion;
        try {
            autenticacion = autenticador.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(correo, password));
        } catch (AuthenticationException ex) {
            auditarFallo(correo, CodigoError.CREDENCIALES_INVALIDAS.name());
            throw new ApiException(CodigoError.CREDENCIALES_INVALIDAS);
        }
        intentos.exito(correo);
        sesiones.establecer(autenticacion, request, response);

        UsuarioAutenticado usuario = (UsuarioAutenticado) autenticacion.getPrincipal();
        auditoria.registrarIndependiente(RegistroAuditoria.exito("LOGIN", "SESION", usuario.id(), null, Map.of()),
                Optional.of(usuario.comoActor()));
        return usuario;
    }

    private void auditarFallo(String email, String codigo) {
        // Solo se guarda el dominio del correo para no exponer identificadores en la bitácora.
        String dominio = email.contains("@") ? email.substring(email.indexOf('@')) : "(sin dominio)";
        auditoria.registrarIndependiente(new RegistroAuditoria("LOGIN", "SESION", null, ResultadoAuditoria.DENEGADO,
                codigo, null, Map.of("dominio", dominio)), Optional.empty());
    }
}
