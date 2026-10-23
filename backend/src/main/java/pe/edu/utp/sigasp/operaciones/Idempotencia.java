package pe.edu.utp.sigasp.operaciones;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Clock;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Supplier;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import tools.jackson.databind.ObjectMapper;

/**
 * Ejecuta un cambio una sola vez por clave.
 * <ol>
 *   <li>Toma un candado transaccional por clave ({@code pg_advisory_xact_lock}) para serializar
 *       solicitudes simultáneas con la misma clave.</li>
 *   <li>Si la clave ya se registró con el mismo usuario, tipo, recurso y contenido, devuelve el
 *       resultado guardado (o repite el mismo rechazo) aunque el estado haya avanzado.</li>
 *   <li>Si la clave se registró con otro contenido, responde {@code IDEMPOTENCIA_CONFLICTO}.</li>
 *   <li>Si es nueva, ejecuta la acción y guarda el resultado en la <b>misma</b> transacción: o se
 *       guardan ambos o ninguno, así que una clave sin registro siempre puede reintentarse.</li>
 *   <li>Los rechazos de negocio (409/422) los guarda el llamador con {@link #registrarRechazo} <b>después</b>
 *       de que la transacción principal terminó: así ninguna solicitud retiene dos conexiones a la vez
 *       (con el pool lleno, eso bloquearía el servicio).</li>
 * </ol>
 * La huella se calcula sobre una representación canónica del contenido (claves de mapas ordenadas),
 * para que la misma solicitud produzca la misma huella aunque se reinicie el servidor.
 */
@Service
public class Idempotencia {

    private final JdbcClient jdbc;
    private final ObjectMapper json;
    private final Clock reloj;

    Idempotencia(JdbcClient jdbc, ObjectMapper json, Clock reloj) {
        this.jdbc = jdbc;
        this.json = json;
        this.reloj = reloj;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public <T> T ejecutar(SolicitudIdempotente solicitud, Class<T> tipoRespuesta, Supplier<T> accion) {
        return ejecutar(solicitud, tipoRespuesta, 200, accion);
    }

    /**
     * Como {@link #ejecutar(SolicitudIdempotente, Class, Supplier)}, con el estado HTTP que se registra para la
     * operación completada (por ejemplo, 201 al crear una cita).
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public <T> T ejecutar(SolicitudIdempotente solicitud, Class<T> tipoRespuesta, int httpStatus, Supplier<T> accion) {
        jdbc.sql("SELECT pg_advisory_xact_lock(:candado)")
                .param("candado", candado(solicitud.clave()))
                .query((rs, fila) -> Boolean.TRUE)
                .list();

        String huella = huella(solicitud);
        Optional<OperacionRegistrada> previa = buscar(solicitud.clave());
        if (previa.isPresent()) {
            return repetir(previa.get(), solicitud, huella, tipoRespuesta);
        }

        T resultado = accion.get();
        jdbc.sql("""
                        INSERT INTO operacion (clave, usuario_id, tipo, recurso_id, huella, estado, http_status,
                                               codigo_error, respuesta, registrada_en)
                        VALUES (:clave, :usuario, :tipo, :recurso, :huella, 'COMPLETADA', :status, NULL,
                                CAST(:respuesta AS jsonb), :ahora)
                        """)
                .param("status", httpStatus)
                .param("clave", solicitud.clave())
                .param("usuario", solicitud.usuarioId())
                .param("tipo", solicitud.tipo())
                .param("recurso", solicitud.recursoId())
                .param("huella", huella)
                .param("respuesta", json.writeValueAsString(resultado))
                .param("ahora", Timestamp.from(reloj.instant()))
                .update();
        return resultado;
    }

    /** Consulta pública del estado de una operación, solo para el usuario que la ejecutó. */
    @Transactional(readOnly = true)
    public Optional<OperacionRegistrada> consultar(UUID clave, UUID usuarioId) {
        return buscar(clave).filter(op -> op.usuarioId().equals(usuarioId));
    }

    private <T> T repetir(OperacionRegistrada previa, SolicitudIdempotente solicitud, String huella,
            Class<T> tipoRespuesta) {
        boolean mismaOperacion = previa.usuarioId().equals(solicitud.usuarioId())
                && previa.tipo().equals(solicitud.tipo())
                && previa.recursoId().equals(solicitud.recursoId())
                && previa.huella().equals(huella);
        if (!mismaOperacion) {
            throw new ApiException(CodigoError.IDEMPOTENCIA_CONFLICTO);
        }
        if (previa.estado() == EstadoOperacion.RECHAZADA) {
            CodigoError codigo = CodigoError.valueOf(previa.codigoError());
            throw new ApiException(codigo, previa.detalleError() != null ? previa.detalleError()
                    : codigo.detallePorDefecto());
        }
        return json.readValue(previa.respuesta(), tipoRespuesta);
    }

    /**
     * Guarda un rechazo de negocio (409/422) para que repetir la operación devuelva el mismo rechazo.
     * Debe llamarse <b>fuera</b> de cualquier transacción, una vez revertida la principal. Si la clave ya
     * estaba registrada (repetición o conflicto de clave), no hace nada.
     */
    @Transactional
    public void registrarRechazo(SolicitudIdempotente solicitud, ApiException ex) {
        if (!ex.codigo().esRechazoDeNegocio() || ex.codigo() == CodigoError.IDEMPOTENCIA_CONFLICTO) {
            return;
        }
        String huella = huella(solicitud);
        jdbc.sql("""
                        INSERT INTO operacion (clave, usuario_id, tipo, recurso_id, huella, estado, http_status,
                                               codigo_error, respuesta, registrada_en)
                        VALUES (:clave, :usuario, :tipo, :recurso, :huella, 'RECHAZADA', :status, :codigo,
                                CAST(:respuesta AS jsonb), :ahora)
                        ON CONFLICT (clave) DO NOTHING
                        """)
                .param("clave", solicitud.clave())
                .param("usuario", solicitud.usuarioId())
                .param("tipo", solicitud.tipo())
                .param("recurso", solicitud.recursoId())
                .param("huella", huella)
                .param("status", ex.codigo().estado().value())
                .param("codigo", ex.codigo().name())
                .param("respuesta", json.writeValueAsString(Map.of("detalle", ex.getMessage())))
                .param("ahora", Timestamp.from(reloj.instant()))
                .update();
    }

    private Optional<OperacionRegistrada> buscar(UUID clave) {
        return jdbc.sql("""
                        SELECT clave, usuario_id, tipo, recurso_id, huella, estado, http_status, codigo_error,
                               respuesta::text AS respuesta, registrada_en
                        FROM operacion WHERE clave = :clave
                        """)
                .param("clave", clave)
                .query((rs, i) -> new OperacionRegistrada(
                        rs.getObject("clave", UUID.class),
                        rs.getObject("usuario_id", UUID.class),
                        rs.getString("tipo"),
                        rs.getObject("recurso_id", UUID.class),
                        rs.getString("huella"),
                        EstadoOperacion.valueOf(rs.getString("estado")),
                        rs.getInt("http_status"),
                        rs.getString("codigo_error"),
                        rs.getString("respuesta"),
                        rs.getTimestamp("registrada_en").toInstant()))
                .optional()
                .map(op -> op.conDetalleError(detalleDe(op)));
    }

    private String detalleDe(OperacionRegistrada op) {
        if (op.estado() != EstadoOperacion.RECHAZADA || op.respuesta() == null) {
            return null;
        }
        return json.readTree(op.respuesta()).path("detalle").asString(null);
    }

    private String huella(SolicitudIdempotente solicitud) {
        String material = solicitud.tipo() + "|" + solicitud.recursoId() + "|"
                + json.writeValueAsString(canonico(solicitud.contenido()));
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(material.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 no disponible", ex);
        }
    }

    /** Ordena las claves de los mapas (también anidados): el orden de iteración de Map.of es aleatorio por JVM. */
    private static Object canonico(Object valor) {
        if (valor instanceof Map<?, ?> mapa) {
            Map<String, Object> ordenado = new TreeMap<>();
            mapa.forEach((clave, contenido) -> ordenado.put(String.valueOf(clave), canonico(contenido)));
            return ordenado;
        }
        return valor;
    }

    private static long candado(UUID clave) {
        return clave.getMostSignificantBits() ^ clave.getLeastSignificantBits();
    }
}
