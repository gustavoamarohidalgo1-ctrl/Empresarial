package pe.edu.utp.sigasp.auditoria;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.auditoria.PaginaBitacora.ActorBitacora;
import pe.edu.utp.sigasp.auditoria.PaginaBitacora.Entrada;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Consulta paginada de la bitácora (PB25, HU17). Es de solo lectura: el módulo no ofrece ninguna
 * operación para modificar o borrar entradas, y la tabla además lo impide con un trigger.
 * <ul>
 *   <li>Orden estable: más reciente primero ({@code ocurrido_en DESC, id DESC}).</li>
 *   <li>El nombre del actor se obtiene uniendo con {@code usuario}; el rol es el que tenía al actuar.</li>
 *   <li>El {@code detalle} no se expone: la vista muestra quién, qué, sobre qué, cuándo y con qué resultado.</li>
 *   <li>Tres sentencias por página, con índices (V1 y V4): la página, el total y las acciones distintas.</li>
 * </ul>
 */
@Service
@Transactional(readOnly = true)
public class ConsultaBitacora {

    public static final int TAMANO_MAXIMO = 100;
    public static final int TAMANO_POR_DEFECTO = 25;

    private static final String PAGINA = """
            SELECT a.id, a.ocurrido_en, a.actor_usuario_id, COALESCE(a.actor_rol, u.rol) AS actor_rol,
                   COALESCE(u.nombre_visible, 'Usuario no disponible') AS actor_nombre,
                   a.accion, a.entidad, a.entidad_id, a.resultado, a.codigo, a.request_id
            FROM auditoria a
            LEFT JOIN usuario u ON u.id = a.actor_usuario_id
            WHERE TRUE %s
            ORDER BY a.ocurrido_en DESC, a.id DESC
            LIMIT :limite OFFSET :desplazamiento
            """;

    private static final String TOTAL = "SELECT count(*) FROM auditoria a WHERE TRUE %s";

    /** Valores distintos de {@code accion} con un recorrido «salteado» del índice (una búsqueda por valor). */
    private static final String ACCIONES = """
            WITH RECURSIVE acciones (accion) AS (
                (SELECT accion FROM auditoria ORDER BY accion LIMIT 1)
                UNION ALL
                SELECT (SELECT a.accion FROM auditoria a WHERE a.accion > s.accion ORDER BY a.accion LIMIT 1)
                FROM acciones s
                WHERE s.accion IS NOT NULL
            )
            SELECT accion FROM acciones WHERE accion IS NOT NULL
            """;

    private final JdbcClient jdbc;
    private final ZoneId zona;

    ConsultaBitacora(JdbcClient jdbc, @Value("${sigasp.reglas.zona-horaria:America/Lima}") ZoneId zona) {
        this.jdbc = jdbc;
        this.zona = zona;
    }

    public PaginaBitacora buscar(FiltroBitacora filtro) {
        if (filtro.pagina() < 0) {
            throw new ApiException(CodigoError.VALIDACION, "La página debe ser 0 o mayor.");
        }
        if (filtro.tamano() < 1 || filtro.tamano() > TAMANO_MAXIMO) {
            throw new ApiException(CodigoError.VALIDACION,
                    "El tamaño de página debe estar entre 1 y " + TAMANO_MAXIMO + ".");
        }
        if (filtro.desde() != null && filtro.hasta() != null && filtro.desde().isAfter(filtro.hasta())) {
            throw new ApiException(CodigoError.VALIDACION,
                    "La fecha inicial no puede ser posterior a la fecha final.");
        }
        String accion = texto(filtro.accion(), 50, "La acción");
        String usuario = texto(filtro.usuario(), 160, "El correo del usuario");

        // Solo se concatenan fragmentos fijos; los valores viajan siempre como parámetros.
        StringBuilder condiciones = new StringBuilder();
        Map<String, Object> parametros = new LinkedHashMap<>();
        if (filtro.desde() != null) {
            condiciones.append(" AND a.ocurrido_en >= :desde");
            parametros.put("desde", inicioDelDia(filtro.desde()));
        }
        if (filtro.hasta() != null) {
            condiciones.append(" AND a.ocurrido_en < :hasta");
            parametros.put("hasta", inicioDelDia(filtro.hasta().plusDays(1)));
        }
        if (accion != null) {
            condiciones.append(" AND a.accion = :accion");
            parametros.put("accion", accion);
        }
        if (filtro.resultado() != null) {
            condiciones.append(" AND a.resultado = :resultado");
            parametros.put("resultado", filtro.resultado().name());
        }
        if (usuario != null) {
            condiciones.append(" AND a.actor_usuario_id IN (SELECT id FROM usuario WHERE lower(email) = lower(:usuario))");
            parametros.put("usuario", usuario);
        }

        List<Entrada> elementos = jdbc.sql(PAGINA.formatted(condiciones))
                .params(parametros)
                .param("limite", filtro.tamano())
                .param("desplazamiento", (long) filtro.pagina() * filtro.tamano())
                .query(ConsultaBitacora::entrada)
                .list();
        long total = jdbc.sql(TOTAL.formatted(condiciones)).params(parametros).query(Long.class).single();
        List<String> acciones = jdbc.sql(ACCIONES).query(String.class).list();
        return new PaginaBitacora(elementos, filtro.pagina(), filtro.tamano(), total, acciones);
    }

    private OffsetDateTime inicioDelDia(LocalDate dia) {
        return dia.atStartOfDay(zona).toOffsetDateTime().withOffsetSameInstant(ZoneOffset.UTC);
    }

    private static String texto(String valor, int maximo, String nombre) {
        if (valor == null || valor.isBlank()) {
            return null;
        }
        String limpio = valor.trim();
        if (limpio.length() > maximo) {
            throw new ApiException(CodigoError.VALIDACION, nombre + " admite como máximo " + maximo + " caracteres.");
        }
        return limpio;
    }

    private static Entrada entrada(ResultSet rs, int fila) throws SQLException {
        UUID actorId = rs.getObject("actor_usuario_id", UUID.class);
        ActorBitacora actor = actorId == null ? null
                : new ActorBitacora(actorId, rs.getString("actor_nombre"), rs.getString("actor_rol"));
        return new Entrada(
                rs.getLong("id"),
                rs.getTimestamp("ocurrido_en").toInstant(),
                actor,
                rs.getString("accion"),
                rs.getString("entidad"),
                rs.getString("entidad_id"),
                ResultadoAuditoria.valueOf(rs.getString("resultado")),
                rs.getString("codigo"),
                rs.getString("request_id"));
    }
}
