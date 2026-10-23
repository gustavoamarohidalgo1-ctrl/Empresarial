package pe.edu.utp.sigasp.soporte;

import java.sql.Timestamp;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Cuentas nuevas para las pruebas de credenciales (cambio y restablecimiento de contraseña).
 * <p>
 * Usan identificadores y correos <b>aleatorios</b>: la vigencia de las sesiones se decide con una caché en
 * memoria de la versión de credenciales de cada usuario, que sobrevive entre pruebas del mismo contexto. Si una
 * prueba cambiara la contraseña de un usuario fijo de {@link EscenarioPrueba}, las siguientes verían sus sesiones
 * revocadas.
 */
@Component
public class CuentasPrueba {

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final RelojAjustable reloj;

    CuentasPrueba(JdbcClient jdbc, PasswordEncoder encoder, RelojAjustable reloj) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.reloj = reloj;
    }

    public record Cuenta(UUID usuarioId, UUID pacienteId, String email) {
    }

    /** Paciente con usuario activo y la contraseña {@link EscenarioPrueba#CLAVE}. */
    public Cuenta paciente(String nombres) {
        String sufijo = UUID.randomUUID().toString().substring(0, 8);
        Cuenta cuenta = new Cuenta(UUID.randomUUID(), UUID.randomUUID(), "cuenta." + sufijo + "@correo.test");
        Timestamp ahora = Timestamp.from(reloj.instant());
        jdbc.sql("INSERT INTO paciente (id, codigo, nombres, apellidos, email_contacto, telefono_contacto, "
                        + "creado_en, actualizado_en) VALUES (?, ?, ?, 'Salas Vega', ?, '+51 900 000 000', ?, ?)")
                .params(cuenta.pacienteId(), "PT-" + sufijo, nombres, cuenta.email(), ahora, ahora).update();
        usuario(cuenta.usuarioId(), cuenta.email(), nombres + " Salas Vega", Rol.PACIENTE, cuenta.pacienteId());
        return cuenta;
    }

    /** Usuario del personal (sin ficha de paciente) con la contraseña {@link EscenarioPrueba#CLAVE}. */
    public Cuenta personal(Rol rol) {
        Cuenta cuenta = new Cuenta(UUID.randomUUID(), null,
                "personal." + UUID.randomUUID().toString().substring(0, 8) + "@siga-sp.test");
        usuario(cuenta.usuarioId(), cuenta.email(), "Personal de prueba", rol, null);
        return cuenta;
    }

    private void usuario(UUID id, String email, String nombre, Rol rol, UUID paciente) {
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id, creado_en) "
                        + "VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)")
                .params(id, email, encoder.encode(EscenarioPrueba.CLAVE), nombre, rol.name(), paciente,
                        Timestamp.from(reloj.instant()))
                .update();
    }
}
