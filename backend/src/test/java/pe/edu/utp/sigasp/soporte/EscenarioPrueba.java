package pe.edu.utp.sigasp.soporte;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.citas.aplicacion.RegistroCitas;
import pe.edu.utp.sigasp.citas.aplicacion.RegistroCitas.NuevaCita;
import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Datos sintéticos mínimos y reproducibles para las pruebas de integración:
 * una sede, dos especialidades, dos profesionales (P1 asignado al operador, P2 no),
 * dos pacientes (A y B) con su usuario, un operador y un administrador.
 */
@Component
public class EscenarioPrueba {

    public static final String CLAVE = "Clave-Prueba-2026";
    public static final String EMAIL_A = "paciente.a@ejemplo.invalid";
    public static final String EMAIL_B = "paciente.b@ejemplo.invalid";
    public static final String EMAIL_OPERADOR = "operador@ejemplo.invalid";
    public static final String EMAIL_ADMIN = "admin@ejemplo.invalid";

    public static final UUID SEDE = UUID.fromString("00000000-0000-0000-0000-00000000000a");
    public static final UUID ESPECIALIDAD = UUID.fromString("00000000-0000-0000-0000-0000000000e1");
    public static final UUID ESPECIALIDAD_2 = UUID.fromString("00000000-0000-0000-0000-0000000000e2");
    public static final UUID P1 = UUID.fromString("00000000-0000-0000-0000-0000000000f1");
    public static final UUID P2 = UUID.fromString("00000000-0000-0000-0000-0000000000f2");
    public static final UUID PACIENTE_A = UUID.fromString("00000000-0000-0000-0000-0000000000a1");
    public static final UUID PACIENTE_B = UUID.fromString("00000000-0000-0000-0000-0000000000b1");
    public static final UUID USUARIO_A = UUID.fromString("00000000-0000-0000-0000-00000000aa01");
    public static final UUID USUARIO_B = UUID.fromString("00000000-0000-0000-0000-00000000bb01");
    public static final UUID USUARIO_OPERADOR = UUID.fromString("00000000-0000-0000-0000-00000000cc01");
    public static final UUID USUARIO_ADMIN = UUID.fromString("00000000-0000-0000-0000-00000000dd01");

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final RegistroCitas registro;
    private final RelojAjustable reloj;

    EscenarioPrueba(JdbcClient jdbc, PasswordEncoder encoder, RegistroCitas registro, RelojAjustable reloj) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.registro = registro;
        this.reloj = reloj;
    }

    /**
     * Vacía todas las tablas de negocio (conserva el catálogo de motivos y el historial de Flyway) y reinicia
     * la secuencia de códigos: la primera cita de cada prueba es {@code SP-2026-000001}.
     */
    public void limpiar() {
        jdbc.sql("""
                TRUNCATE auditoria, operacion, notificacion, encuesta, registro_llegada, pre_check_in,
                         cita_evento, cita_version_agenda, horario, cita, operador_profesional, token_recuperacion,
                         usuario, paciente, profesional, especialidad, sede, correo_simulado, event_publication
                RESTART IDENTITY CASCADE
                """).update();
        jdbc.sql("SELECT setval('cita_codigo_seq', 1, false)").query(Long.class).single();
    }

    /** Código que recibe la n-ésima cita creada en la prueba (con el reloj en 2026). */
    public static String codigo(int n) {
        return "SP-2026-%06d".formatted(n);
    }

    /** Crea catálogos, pacientes y usuarios base. */
    public void base() {
        Timestamp ahora = Timestamp.from(reloj.instant());
        jdbc.sql("INSERT INTO sede (id, codigo, nombre) VALUES (?, 'SEDE-T', 'Sede de prueba')").params(SEDE).update();
        jdbc.sql("INSERT INTO especialidad (id, codigo, nombre) VALUES (?, 'ESP-1', 'Medicina general'), "
                + "(?, 'ESP-2', 'Cardiología')").params(ESPECIALIDAD, ESPECIALIDAD_2).update();
        jdbc.sql("INSERT INTO profesional (id, codigo, nombre_visible, especialidad_id) VALUES "
                + "(?, 'P1', 'Profesional P1', ?), (?, 'P2', 'Profesional P2', ?)")
                .params(P1, ESPECIALIDAD, P2, ESPECIALIDAD_2).update();
        paciente(PACIENTE_A, "PA", "Ana", "Prueba", "ana.contacto@ejemplo.invalid", ahora);
        paciente(PACIENTE_B, "PB", "Beto", "Prueba", "beto.contacto@ejemplo.invalid", ahora);
        String hash = encoder.encode(CLAVE);
        usuario(USUARIO_A, EMAIL_A, "Ana Prueba", Rol.PACIENTE, PACIENTE_A, hash, ahora);
        usuario(USUARIO_B, EMAIL_B, "Beto Prueba", Rol.PACIENTE, PACIENTE_B, hash, ahora);
        usuario(USUARIO_OPERADOR, EMAIL_OPERADOR, "Operador Prueba", Rol.OPERADOR, null, hash, ahora);
        usuario(USUARIO_ADMIN, EMAIL_ADMIN, "Admin Prueba", Rol.ADMINISTRADOR, null, hash, ahora);
        jdbc.sql("INSERT INTO operador_profesional (usuario_id, profesional_id) VALUES (?, ?)")
                .params(USUARIO_OPERADOR, P1).update();
    }

    /** Crea un horario libre de 20 minutos para el profesional. */
    public UUID horario(UUID profesional, Instant inicio) {
        UUID id = UUID.randomUUID();
        jdbc.sql("INSERT INTO horario (id, profesional_id, sede_id, inicio, fin) VALUES (?, ?, ?, ?, ?)")
                .params(id, profesional, SEDE, Timestamp.from(inicio), Timestamp.from(inicio.plus(Duration.ofMinutes(20))))
                .update();
        return id;
    }

    /** Registra una cita Pendiente (con el reloj actual) en un horario nuevo. */
    public UUID cita(UUID paciente, UUID profesional, Instant inicio) {
        UUID especialidad = profesional.equals(P1) ? ESPECIALIDAD : ESPECIALIDAD_2;
        UUID id = UUID.randomUUID();
        registro.registrar(new NuevaCita(id, paciente, especialidad, horario(profesional, inicio)));
        return id;
    }

    public static Actor actorA() {
        return new Actor(USUARIO_A, Rol.PACIENTE, PACIENTE_A, "Ana Prueba");
    }

    public static Actor actorB() {
        return new Actor(USUARIO_B, Rol.PACIENTE, PACIENTE_B, "Beto Prueba");
    }

    public static Actor actorOperador() {
        return new Actor(USUARIO_OPERADOR, Rol.OPERADOR, null, "Operador Prueba");
    }

    private void paciente(UUID id, String codigo, String nombres, String apellidos, String email, Timestamp ahora) {
        jdbc.sql("INSERT INTO paciente (id, codigo, nombres, apellidos, email_contacto, telefono_contacto, "
                + "creado_en, actualizado_en) VALUES (?, ?, ?, ?, ?, '+51 900 000 000', ?, ?)")
                .params(id, codigo, nombres, apellidos, email, ahora, ahora).update();
    }

    private void usuario(UUID id, String email, String nombre, Rol rol, UUID paciente, String hash, Timestamp ahora) {
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id, creado_en) "
                + "VALUES (?, ?, ?, ?, ?, TRUE, ?, ?)")
                .params(id, email, hash, nombre, rol.name(), paciente, ahora).update();
    }
}
