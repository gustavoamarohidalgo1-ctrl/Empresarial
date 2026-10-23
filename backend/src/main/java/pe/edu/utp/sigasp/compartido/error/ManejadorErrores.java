package pe.edu.utp.sigasp.compartido.error;

import java.util.List;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.ConstraintViolationException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.HttpMediaTypeNotAcceptableException;
import org.springframework.web.HttpMediaTypeNotSupportedException;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import pe.edu.utp.sigasp.compartido.error.Problemas.ErrorCampo;

/**
 * Traduce excepciones a Problem Details. Los errores no controlados se registran con el
 * requestId y se responden con un mensaje genérico, sin trazas ni SQL.
 */
@RestControllerAdvice
public class ManejadorErrores {

    private static final Logger log = LoggerFactory.getLogger(ManejadorErrores.class);

    @ExceptionHandler(ApiException.class)
    ResponseEntity<ProblemDetail> api(ApiException ex, HttpServletRequest request) {
        if (ex instanceof ValidacionException validacion) {
            return responder(Problemas.validacion(validacion.errores(), request.getRequestURI()));
        }
        ProblemDetail problema = Problemas.crear(ex.codigo(), ex.getMessage(), request.getRequestURI());
        if (ex instanceof DemasiadosIntentosException limite) {
            return ResponseEntity.status(problema.getStatus())
                    .header(HttpHeaders.RETRY_AFTER, String.valueOf(limite.segundosDeEspera()))
                    .body(problema);
        }
        return responder(problema);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ProblemDetail> validacion(MethodArgumentNotValidException ex, HttpServletRequest request) {
        List<ErrorCampo> errores = ex.getBindingResult().getFieldErrors().stream()
                .map(e -> new ErrorCampo(e.getField(), e.getDefaultMessage()))
                .toList();
        return responder(Problemas.validacion(errores, request.getRequestURI()));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ProblemDetail> restricciones(ConstraintViolationException ex, HttpServletRequest request) {
        List<ErrorCampo> errores = ex.getConstraintViolations().stream()
                .map(v -> new ErrorCampo(ultimoNodo(v.getPropertyPath().toString()), v.getMessage()))
                .toList();
        return responder(Problemas.validacion(errores, request.getRequestURI()));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class,
            MissingServletRequestParameterException.class})
    ResponseEntity<ProblemDetail> cuerpoIlegible(Exception ex, HttpServletRequest request) {
        return responder(Problemas.crear(CodigoError.VALIDACION,
                "La solicitud tiene un formato inválido.", request.getRequestURI()));
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    ResponseEntity<ProblemDetail> cabeceraFaltante(MissingRequestHeaderException ex, HttpServletRequest request) {
        if ("Idempotency-Key".equalsIgnoreCase(ex.getHeaderName())) {
            return responder(Problemas.crear(CodigoError.IDEMPOTENCY_KEY_REQUERIDA,
                    CodigoError.IDEMPOTENCY_KEY_REQUERIDA.detallePorDefecto(), request.getRequestURI()));
        }
        return responder(Problemas.crear(CodigoError.VALIDACION,
                "Falta la cabecera " + ex.getHeaderName() + ".", request.getRequestURI()));
    }

    /**
     * Conflictos de concurrencia: control optimista, espera de candado o interbloqueo detectado por
     * PostgreSQL (por ejemplo, dos pacientes que intercambian horarios a la vez). Nada se guardó.
     */
    @ExceptionHandler({OptimisticLockingFailureException.class, PessimisticLockingFailureException.class})
    ResponseEntity<ProblemDetail> concurrencia(Exception ex, HttpServletRequest request) {
        return responder(Problemas.crear(CodigoError.CONFLICTO_CONCURRENTE,
                CodigoError.CONFLICTO_CONCURRENTE.detallePorDefecto(), request.getRequestURI()));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    ResponseEntity<ProblemDetail> rutaInexistente(Exception ex, HttpServletRequest request) {
        return responder(Problemas.crear(CodigoError.RECURSO_NO_ENCONTRADO,
                CodigoError.RECURSO_NO_ENCONTRADO.detallePorDefecto(), request.getRequestURI()));
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException.class)
    ResponseEntity<ProblemDetail> metodo(HttpRequestMethodNotSupportedException ex, HttpServletRequest request) {
        return responder(Problemas.crear(CodigoError.METODO_NO_PERMITIDO,
                CodigoError.METODO_NO_PERMITIDO.detallePorDefecto(), request.getRequestURI()));
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException.class)
    ResponseEntity<ProblemDetail> tipoContenido(HttpMediaTypeNotSupportedException ex, HttpServletRequest request) {
        return responder(Problemas.crear(CodigoError.TIPO_NO_SOPORTADO,
                CodigoError.TIPO_NO_SOPORTADO.detallePorDefecto(), request.getRequestURI()));
    }

    /** El cliente pidió un formato que la API no produce: se responde 406 sin cuerpo (no hay formato aceptable). */
    @ExceptionHandler(HttpMediaTypeNotAcceptableException.class)
    ResponseEntity<Void> noAceptable(HttpMediaTypeNotAcceptableException ex) {
        return ResponseEntity.status(CodigoError.FORMATO_NO_ACEPTABLE.estado()).build();
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<ProblemDetail> inesperado(Exception ex, HttpServletRequest request) {
        log.error("Error no controlado en {} {}", request.getMethod(), request.getRequestURI(), ex);
        return responder(Problemas.crear(CodigoError.ERROR_INTERNO,
                CodigoError.ERROR_INTERNO.detallePorDefecto(), request.getRequestURI()));
    }

    private static ResponseEntity<ProblemDetail> responder(ProblemDetail problema) {
        return ResponseEntity.status(problema.getStatus()).body(problema);
    }

    private static String ultimoNodo(String ruta) {
        int punto = ruta.lastIndexOf('.');
        return punto >= 0 ? ruta.substring(punto + 1) : ruta;
    }
}
