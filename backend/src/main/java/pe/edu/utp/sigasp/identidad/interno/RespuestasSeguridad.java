package pe.edu.utp.sigasp.identidad.interno;

import java.io.IOException;
import java.util.Map;
import java.util.Optional;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.access.AccessDeniedHandler;
import org.springframework.security.web.csrf.CsrfException;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.error.Problemas;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import tools.jackson.databind.ObjectMapper;

/**
 * Respuestas 401 y 403 en formato Problem Details. Los accesos denegados se auditan
 * (HU02: "intentos no autorizados producen respuesta controlada y evento de log").
 */
@Component
class RespuestasSeguridad implements AuthenticationEntryPoint, AccessDeniedHandler {

    private static final Logger log = LoggerFactory.getLogger(RespuestasSeguridad.class);
    /** Longitud de la columna auditoria.entidad_id. */
    private static final int MAX_ENTIDAD_ID = 64;
    /** Máximo de la ruta guardada en el detalle o en el log. */
    private static final int MAX_RUTA = 256;

    private final ObjectMapper json;
    private final Auditoria auditoria;
    private final ActorActual actorActual;

    RespuestasSeguridad(ObjectMapper json, Auditoria auditoria, ActorActual actorActual) {
        this.json = json;
        this.auditoria = auditoria;
        this.actorActual = actorActual;
    }

    @Override
    public void commence(HttpServletRequest request, HttpServletResponse response,
            AuthenticationException ex) throws IOException {
        escribir(response, Problemas.crear(CodigoError.NO_AUTENTICADO,
                CodigoError.NO_AUTENTICADO.detallePorDefecto(), request.getRequestURI()));
    }

    @Override
    public void handle(HttpServletRequest request, HttpServletResponse response,
            AccessDeniedException ex) throws IOException {
        CodigoError codigo = ex instanceof CsrfException ? CodigoError.CSRF_INVALIDO : CodigoError.ACCESO_DENEGADO;
        String ruta = recortar(request.getMethod() + " " + request.getRequestURI(), MAX_RUTA);
        Optional<Actor> actor = actorActual.opcional();
        if (actor.isPresent()) {
            // HU02: un intento no autorizado de un usuario identificado queda en la bitácora.
            // auditoria.entidad_id admite 64 caracteres; la ruta (acotada) va en el detalle.
            auditoria.registrarIndependiente(
                    new RegistroAuditoria("ACCESO_RUTA", "RUTA", recortar(ruta, MAX_ENTIDAD_ID),
                            ResultadoAuditoria.DENEGADO, codigo.name(), null, Map.of("ruta", ruta)),
                    actor);
        } else {
            // Sin sesión no se escribe en la BD: evita que solicitudes anónimas en ráfaga llenen la bitácora.
            log.warn("Solicitud anónima rechazada ({}): {}", codigo, ruta);
        }
        escribir(response, Problemas.crear(codigo, codigo.detallePorDefecto(), request.getRequestURI()));
    }

    /** 404 {@code RECURSO_NO_ENCONTRADO}, igual que una ruta inexistente de la API (sin auditar ni registrar). */
    void noEncontrado(HttpServletRequest request, HttpServletResponse response) throws IOException {
        escribir(response, Problemas.crear(CodigoError.RECURSO_NO_ENCONTRADO,
                CodigoError.RECURSO_NO_ENCONTRADO.detallePorDefecto(), request.getRequestURI()));
    }

    private static String recortar(String texto, int maximo) {
        return texto.length() > maximo ? texto.substring(0, maximo) : texto;
    }

    private void escribir(HttpServletResponse response, ProblemDetail problema) throws IOException {
        response.setStatus(problema.getStatus());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        json.writeValue(response.getOutputStream(), Problemas.comoMapa(problema));
    }
}
