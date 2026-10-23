package pe.edu.utp.sigasp.catalogo;

import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;

/** Consulta del catálogo de motivos de cancelación y reprogramación. */
@Service
public class Motivos {

    private final JdbcClient jdbc;

    Motivos(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    public List<Motivo> activos(TipoMotivo tipo) {
        return jdbc.sql("""
                        SELECT codigo, descripcion, tipo FROM motivo
                        WHERE activo AND tipo = :tipo ORDER BY descripcion
                        """)
                .param("tipo", tipo.name())
                .query((rs, i) -> new Motivo(rs.getString("codigo"), rs.getString("descripcion"),
                        TipoMotivo.valueOf(rs.getString("tipo"))))
                .list();
    }

    /** Devuelve el motivo solo si existe, está activo y es del tipo pedido. */
    public Optional<Motivo> activo(String codigo, TipoMotivo tipo) {
        if (codigo == null || codigo.isBlank()) {
            return Optional.empty();
        }
        return jdbc.sql("""
                        SELECT codigo, descripcion, tipo FROM motivo
                        WHERE codigo = :codigo AND tipo = :tipo AND activo
                        """)
                .param("codigo", codigo)
                .param("tipo", tipo.name())
                .query((rs, i) -> new Motivo(rs.getString("codigo"), rs.getString("descripcion"),
                        TipoMotivo.valueOf(rs.getString("tipo"))))
                .optional();
    }

    public Optional<String> descripcion(String codigo) {
        return jdbc.sql("SELECT descripcion FROM motivo WHERE codigo = :codigo")
                .param("codigo", codigo)
                .query(String.class)
                .optional();
    }
}
