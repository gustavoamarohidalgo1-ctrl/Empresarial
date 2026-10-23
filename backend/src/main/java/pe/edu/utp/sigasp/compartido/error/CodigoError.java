package pe.edu.utp.sigasp.compartido.error;

import org.springframework.http.HttpStatus;

/**
 * Catálogo cerrado de errores de la API. El código viaja en la propiedad {@code codigo}
 * del Problem Details y es lo que el frontend interpreta; el texto es para personas.
 * Debe coincidir con la tabla de docs/api.md.
 */
public enum CodigoError {

    VALIDACION(HttpStatus.BAD_REQUEST, "Datos inválidos", "Revisa los datos enviados."),
    IDEMPOTENCY_KEY_REQUERIDA(HttpStatus.BAD_REQUEST, "Falta la clave de operación",
            "La operación requiere la cabecera Idempotency-Key con un UUID."),
    NO_AUTENTICADO(HttpStatus.UNAUTHORIZED, "Sesión requerida", "Inicia sesión para continuar."),
    CREDENCIALES_INVALIDAS(HttpStatus.UNAUTHORIZED, "No se pudo iniciar sesión",
            "Revisa tus credenciales e inténtalo nuevamente."),
    ACCESO_DENEGADO(HttpStatus.FORBIDDEN, "Acceso denegado", "No tienes permiso para realizar esta acción."),
    CSRF_INVALIDO(HttpStatus.FORBIDDEN, "Solicitud no verificada",
            "La solicitud no pudo verificarse. Recarga la página e inténtalo nuevamente."),
    CITA_NO_ENCONTRADA(HttpStatus.NOT_FOUND, "Cita no encontrada", "No encontramos la cita solicitada."),
    RECURSO_NO_ENCONTRADO(HttpStatus.NOT_FOUND, "Recurso no encontrado", "No encontramos el recurso solicitado."),
    METODO_NO_PERMITIDO(HttpStatus.METHOD_NOT_ALLOWED, "Método no permitido",
            "El método HTTP no está permitido para este recurso."),
    FORMATO_NO_ACEPTABLE(HttpStatus.NOT_ACCEPTABLE, "Formato no aceptable",
            "El servidor solo responde en JSON (application/json o application/problem+json)."),
    TIPO_NO_SOPORTADO(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Tipo de contenido no soportado",
            "Envía el cuerpo como application/json."),
    VERSION_OBSOLETA(HttpStatus.CONFLICT, "La cita cambió",
            "La cita fue modificada. Actualiza la vista antes de continuar."),
    CONFLICTO_CONCURRENTE(HttpStatus.CONFLICT, "Cambio simultáneo",
            "Otra operación modificó la cita al mismo tiempo. Actualiza la vista: no se guardó."),
    HORARIO_NO_DISPONIBLE(HttpStatus.CONFLICT, "Horario no disponible",
            "El horario elegido ya no está disponible. Se conserva el horario anterior."),
    IDEMPOTENCIA_CONFLICTO(HttpStatus.CONFLICT, "Clave de operación reutilizada",
            "La clave de operación ya se usó con otro contenido."),
    TRANSICION_NO_PERMITIDA(HttpStatus.UNPROCESSABLE_CONTENT, "Acción no permitida",
            "La acción no está permitida en el estado actual de la cita."),
    FUERA_DE_PLAZO(HttpStatus.UNPROCESSABLE_CONTENT, "Fuera de plazo",
            "La acción ya no está disponible por el horario de la cita."),
    MOTIVO_INVALIDO(HttpStatus.UNPROCESSABLE_CONTENT, "Motivo inválido",
            "Selecciona un motivo válido del catálogo."),
    DATOS_PRE_CHECK_IN_INVALIDOS(HttpStatus.UNPROCESSABLE_CONTENT, "Pre-check-in incompleto",
            "Debes confirmar que tus datos son correctos."),
    LLEGADA_YA_REGISTRADA(HttpStatus.UNPROCESSABLE_CONTENT, "Llegada ya registrada",
            "La llegada de esta cita ya fue registrada."),
    CORREO_REGISTRADO(HttpStatus.CONFLICT, "Correo ya registrado",
            "Ya existe una cuenta con este correo. Inicia sesión o recupera tu contraseña."),
    CONTRASENA_INCORRECTA(HttpStatus.UNPROCESSABLE_CONTENT, "Contraseña incorrecta",
            "La contraseña actual no es correcta."),
    ENLACE_INVALIDO(HttpStatus.UNPROCESSABLE_CONTENT, "Enlace no válido",
            "El enlace para restablecer la contraseña no es válido o ya venció. Solicita uno nuevo."),
    LIMITE_CITAS(HttpStatus.UNPROCESSABLE_CONTENT, "Límite de citas",
            "No puedes reservar esta cita: alcanzaste el límite de citas activas o ya tienes una de esta especialidad ese día."),
    DEMASIADOS_INTENTOS(HttpStatus.TOO_MANY_REQUESTS, "Demasiados intentos",
            "Hiciste demasiadas solicitudes. Espera unos minutos e inténtalo nuevamente."),
    ERROR_INTERNO(HttpStatus.INTERNAL_SERVER_ERROR, "Error interno",
            "Ocurrió un error inesperado. Inténtalo nuevamente en unos minutos.");

    private final HttpStatus estado;
    private final String titulo;
    private final String detallePorDefecto;

    CodigoError(HttpStatus estado, String titulo, String detallePorDefecto) {
        this.estado = estado;
        this.titulo = titulo;
        this.detallePorDefecto = detallePorDefecto;
    }

    public HttpStatus estado() {
        return estado;
    }

    public String titulo() {
        return titulo;
    }

    public String detallePorDefecto() {
        return detallePorDefecto;
    }

    /** Segmento de URI para el campo {@code type}: VERSION_OBSOLETA → version-obsoleta. */
    public String slug() {
        return name().toLowerCase().replace('_', '-');
    }

    /** Errores que provienen de reglas del negocio y que pueden guardarse como resultado de una operación. */
    public boolean esRechazoDeNegocio() {
        return estado == HttpStatus.CONFLICT || estado == HttpStatus.UNPROCESSABLE_CONTENT;
    }
}
