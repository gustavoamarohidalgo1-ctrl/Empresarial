package pe.edu.utp.sigasp.correo.interno;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Lectura del buzón del correo simulado. Solo existe con {@code sigasp.dev.buzon-correos=true} (perfil dev), que es
 * también la única configuración en la que {@code correo_simulado} guarda el cuerpo y el enlace.
 */
@Component
@ConditionalOnProperty(name = "sigasp.dev.buzon-correos", havingValue = "true")
public class BuzonCorreos {

    /** Máximo de mensajes que devuelve el buzón. */
    public static final int MAXIMO = 50;

    private final JdbcClient jdbc;

    BuzonCorreos(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public record CorreoEnviado(UUID id, String destinatario, String asunto, String cuerpo, String enlace,
            Instant enviadoEn) {
    }

    /** Los mensajes más recientes primero. */
    @Transactional(readOnly = true)
    public List<CorreoEnviado> recientes() {
        return jdbc.sql("""
                        SELECT id, destinatario, asunto, cuerpo, enlace, enviado_en FROM correo_simulado
                        ORDER BY enviado_en DESC, id
                        LIMIT :maximo
                        """)
                .param("maximo", MAXIMO)
                .query((rs, i) -> new CorreoEnviado(rs.getObject("id", UUID.class), rs.getString("destinatario"),
                        rs.getString("asunto"), rs.getString("cuerpo"), rs.getString("enlace"),
                        rs.getTimestamp("enviado_en").toInstant()))
                .list();
    }
}
