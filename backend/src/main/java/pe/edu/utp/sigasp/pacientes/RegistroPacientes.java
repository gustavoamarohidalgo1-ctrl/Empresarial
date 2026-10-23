package pe.edu.utp.sigasp.pacientes;

import java.security.SecureRandom;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Alta de la ficha (no clínica) de un paciente. La usa el registro de cuentas del módulo de identidad:
 * la ficha y el usuario se crean en la <b>misma</b> transacción, que abre quien llama. Identidad nunca
 * escribe en las tablas de este módulo.
 */
@Service
public class RegistroPacientes {

    /** Alfabeto Crockford base32 (sin I, L, O ni U): códigos fáciles de dictar por teléfono. */
    private static final char[] ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final int LARGO_CODIGO = 8;

    private final JdbcClient jdbc;
    private final SecureRandom azar = new SecureRandom();

    RegistroPacientes(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Datos de la ficha nueva, ya normalizados y validados por quien llama.
     *
     * @param telefono             teléfono de contacto (obligatorio: se usa para los recordatorios)
     * @param privacidadAceptadaEn instante en que se aceptó la política de privacidad (Ley N.º 29733)
     * @param privacidadVersion    versión de la política de privacidad que se aceptó ({@code sigasp.privacidad.version})
     */
    public record NuevoPaciente(String nombres, String apellidos, String email, String telefono,
            Instant privacidadAceptadaEn, String privacidadVersion) {

        public NuevoPaciente {
            Objects.requireNonNull(nombres, "nombres");
            Objects.requireNonNull(apellidos, "apellidos");
            Objects.requireNonNull(email, "email");
            Objects.requireNonNull(telefono, "telefono");
            Objects.requireNonNull(privacidadAceptadaEn, "privacidadAceptadaEn");
            Objects.requireNonNull(privacidadVersion, "privacidadVersion");
        }

        @Override
        public String toString() {
            return "NuevoPaciente[datos de contacto omitidos]";
        }
    }

    /** Crea la ficha y devuelve su identificador. Debe ejecutarse dentro de una transacción. */
    @Transactional(propagation = Propagation.MANDATORY)
    public UUID registrar(NuevoPaciente datos) {
        UUID id = UUID.randomUUID();
        Timestamp ahora = Timestamp.from(datos.privacidadAceptadaEn());
        jdbc.sql("""
                        INSERT INTO paciente (id, codigo, nombres, apellidos, email_contacto, telefono_contacto,
                                              creado_en, actualizado_en, privacidad_aceptada_en, privacidad_version)
                        VALUES (:id, :codigo, :nombres, :apellidos, :email, :telefono, :ahora, :ahora, :ahora,
                                :privacidadVersion)
                        """)
                .param("id", id)
                .param("codigo", codigoNuevo())
                .param("nombres", datos.nombres())
                .param("apellidos", datos.apellidos())
                .param("email", datos.email())
                .param("telefono", datos.telefono())
                .param("ahora", ahora)
                .param("privacidadVersion", datos.privacidadVersion())
                .update();
        return id;
    }

    /** {@code PAC-7K3M9QX2}: aleatorio para no revelar cuántos pacientes hay ni en qué orden se registraron. */
    private String codigoNuevo() {
        StringBuilder codigo = new StringBuilder("PAC-");
        for (int i = 0; i < LARGO_CODIGO; i++) {
            codigo.append(ALFABETO[azar.nextInt(ALFABETO.length)]);
        }
        return codigo.toString();
    }
}
