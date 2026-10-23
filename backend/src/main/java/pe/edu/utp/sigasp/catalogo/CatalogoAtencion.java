package pe.edu.utp.sigasp.catalogo;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.text.Collator;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Catálogos de atención: sedes, especialidades y profesionales. Los ordena alfabéticamente con las reglas
 * del español (las tildes no alteran el orden) y, en los profesionales, sin contar el tratamiento
 * («Dr.», «Dra.»).
 */
@Service
@Transactional(readOnly = true)
public class CatalogoAtencion {

    private static final Pattern TRATAMIENTO = Pattern.compile("^(?:Dra?\\.|Lic\\.|Mg\\.)\\s+",
            Pattern.CASE_INSENSITIVE);
    private static final String PROFESIONALES = """
            SELECT p.id, p.codigo, p.nombre_visible, e.id AS esp_id, e.codigo AS esp_codigo, e.nombre AS esp_nombre
            FROM profesional p JOIN especialidad e ON e.id = p.especialidad_id
            """;

    private final JdbcClient jdbc;
    private final Collator colacion;

    CatalogoAtencion(JdbcClient jdbc) {
        this.jdbc = jdbc;
        this.colacion = Collator.getInstance(Locale.forLanguageTag("es-PE"));
        this.colacion.setStrength(Collator.PRIMARY);
    }

    public record Especialidad(UUID id, String codigo, String nombre, String descripcion) {
    }

    public record Profesional(UUID id, String codigo, String nombre, Especialidad especialidad) {
    }

    public record Sede(UUID id, String codigo, String nombre, String direccion) {
    }

    public List<Especialidad> especialidades() {
        return jdbc.sql("SELECT id, codigo, nombre, descripcion FROM especialidad")
                .query(CatalogoAtencion::especialidad)
                .list()
                .stream()
                .sorted(Comparator.comparing(Especialidad::nombre, colacion))
                .toList();
    }

    public Optional<Especialidad> especialidad(String codigo) {
        if (codigo == null || codigo.isBlank()) {
            return Optional.empty();
        }
        return jdbc.sql("SELECT id, codigo, nombre, descripcion FROM especialidad WHERE codigo = :codigo")
                .param("codigo", codigo.trim())
                .query(CatalogoAtencion::especialidad)
                .optional();
    }

    /** Profesionales de la especialidad indicada, o todos si es {@code null}. */
    public List<Profesional> profesionales(String especialidadCodigo) {
        List<Profesional> lista = especialidadCodigo == null || especialidadCodigo.isBlank()
                ? jdbc.sql(PROFESIONALES).query(CatalogoAtencion::profesional).list()
                : jdbc.sql(PROFESIONALES + " WHERE e.codigo = :especialidad")
                        .param("especialidad", especialidadCodigo.trim())
                        .query(CatalogoAtencion::profesional)
                        .list();
        return lista.stream()
                .sorted(Comparator.comparing((Profesional p) -> sinTratamiento(p.nombre()), colacion)
                        .thenComparing(Profesional::codigo))
                .toList();
    }

    public Optional<Profesional> profesional(String codigo) {
        if (codigo == null || codigo.isBlank()) {
            return Optional.empty();
        }
        return jdbc.sql(PROFESIONALES + " WHERE p.codigo = :codigo")
                .param("codigo", codigo.trim())
                .query(CatalogoAtencion::profesional)
                .optional();
    }

    public Optional<Profesional> profesional(UUID id) {
        return jdbc.sql(PROFESIONALES + " WHERE p.id = :id")
                .param("id", id)
                .query(CatalogoAtencion::profesional)
                .optional();
    }

    public List<Sede> sedes() {
        return jdbc.sql("SELECT id, codigo, nombre, direccion FROM sede")
                .query((rs, i) -> new Sede(rs.getObject("id", UUID.class), rs.getString("codigo"),
                        rs.getString("nombre"), rs.getString("direccion")))
                .list()
                .stream()
                .sorted(Comparator.comparing(Sede::nombre, colacion))
                .toList();
    }

    static String sinTratamiento(String nombre) {
        return TRATAMIENTO.matcher(nombre).replaceFirst("");
    }

    private static Especialidad especialidad(ResultSet rs, int fila) throws SQLException {
        return new Especialidad(rs.getObject("id", UUID.class), rs.getString("codigo"), rs.getString("nombre"),
                rs.getString("descripcion"));
    }

    private static Profesional profesional(ResultSet rs, int fila) throws SQLException {
        return new Profesional(rs.getObject("id", UUID.class), rs.getString("codigo"), rs.getString("nombre_visible"),
                new Especialidad(rs.getObject("esp_id", UUID.class), rs.getString("esp_codigo"),
                        rs.getString("esp_nombre"), null));
    }
}
