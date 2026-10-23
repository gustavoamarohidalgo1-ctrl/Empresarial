package pe.edu.utp.sigasp.pacientes;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Perfil no clínico del paciente (HU21). Solo el correo y el teléfono de contacto son editables;
 * el ID, el rol y la identidad no. Cada cambio se audita con los nombres de los campos, no con
 * sus valores (minimización de datos).
 */
@Service
public class Perfiles {

    private final JdbcClient jdbc;
    private final Auditoria auditoria;
    private final Clock reloj;

    Perfiles(JdbcClient jdbc, Auditoria auditoria, Clock reloj) {
        this.jdbc = jdbc;
        this.auditoria = auditoria;
        this.reloj = reloj;
    }

    public record Perfil(String nombres, String apellidos, String email, String telefono) {
    }

    @Transactional(readOnly = true)
    public Perfil consultar(Actor actor) {
        return buscar(pacienteDe(actor)).orElseThrow(() -> new ApiException(CodigoError.RECURSO_NO_ENCONTRADO));
    }

    @Transactional
    public Perfil actualizar(Actor actor, String email, String telefono) {
        UUID paciente = pacienteDe(actor);
        Perfil actual = buscar(paciente).orElseThrow(() -> new ApiException(CodigoError.RECURSO_NO_ENCONTRADO));
        List<String> cambiados = new ArrayList<>();
        String nuevoEmail = email != null ? email.trim() : actual.email();
        String nuevoTelefono = telefono != null ? telefono.trim() : actual.telefono();
        if (!nuevoEmail.equals(actual.email())) {
            cambiados.add("email");
        }
        if (!nuevoTelefono.equals(actual.telefono())) {
            cambiados.add("telefono");
        }
        if (cambiados.isEmpty()) {
            return actual;
        }
        jdbc.sql("""
                        UPDATE paciente SET email_contacto = :email, telefono_contacto = :telefono,
                                            actualizado_en = :ahora
                        WHERE id = :id
                        """)
                .param("email", nuevoEmail)
                .param("telefono", nuevoTelefono)
                .param("ahora", Timestamp.from(reloj.instant()))
                .param("id", paciente)
                .update();
        auditoria.registrar(RegistroAuditoria.exito("PERFIL_ACTUALIZAR", "PACIENTE", paciente, null,
                Map.of("campos", cambiados)), Optional.of(actor));
        return new Perfil(actual.nombres(), actual.apellidos(), nuevoEmail, nuevoTelefono);
    }

    private Optional<Perfil> buscar(UUID pacienteId) {
        return jdbc.sql("SELECT nombres, apellidos, email_contacto, telefono_contacto FROM paciente WHERE id = :id")
                .param("id", pacienteId)
                .query((rs, i) -> new Perfil(rs.getString("nombres"), rs.getString("apellidos"),
                        rs.getString("email_contacto"), rs.getString("telefono_contacto")))
                .optional();
    }

    private static UUID pacienteDe(Actor actor) {
        if (!actor.es(Rol.PACIENTE)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
        return actor.pacienteId();
    }
}
