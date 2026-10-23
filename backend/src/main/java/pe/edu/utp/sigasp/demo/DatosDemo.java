package pe.edu.utp.sigasp.demo;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.citas.aplicacion.CierreInasistencias;
import pe.edu.utp.sigasp.citas.aplicacion.RegistroCitas;
import pe.edu.utp.sigasp.citas.aplicacion.RegistroCitas.NuevaCita;
import pe.edu.utp.sigasp.citas.aplicacion.ServicioAtencionOperador;
import pe.edu.utp.sigasp.citas.aplicacion.ServicioAtencionOperador.AccionOperador;
import pe.edu.utp.sigasp.citas.aplicacion.ServicioCitasPaciente;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;
import pe.edu.utp.sigasp.notificaciones.Notificaciones;

/**
 * Carga idempotente de datos de demostración <b>ficticios pero verosímiles</b> (solo perfil dev): dos sedes,
 * ocho especialidades, catorce profesionales con agenda semanal, doce pacientes con cuenta y unas 150 citas
 * entre hoy − 45 y hoy + 21 días. Si ya existen (marcador: {@value #EMAIL_ADMIN}), no hace nada. Para
 * regenerar fechas relativas a hoy: {@code scripts/db.sh reset}.
 * <p>
 * Si la BD conserva datos de la v1.0 (cuentas {@value #DOMINIO_V1_0}), <b>detiene el arranque</b> con un mensaje
 * que pide reiniciar la BD: cargar encima mezclaría los datos antiguos («Ana Demo», citas {@code CIT001}…) con los
 * nuevos en el panel del operador, los indicadores y la bitácora.
 * <p>
 * Todas las citas se registran y avanzan por los <b>mismos casos de uso</b> que la API (registro, confirmación,
 * pre-check-in, cancelación, reprogramación, llegada, atención, cierre por inasistencia y recordatorios). Los
 * pasos se ordenan en el tiempo y se ejecutan moviendo el reloj ajustable a cada instante, así la línea de
 * tiempo, la auditoría y las notificaciones quedan coherentes. Al terminar, el reloj vuelve a su estado previo.
 */
@Component
@ConditionalOnProperty(name = "sigasp.demo.habilitado", havingValue = "true")
class DatosDemo implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DatosDemo.class);

    static final String EMAIL_ADMIN = "admin@siga-sp.test";
    static final String EMAIL_ANA = "ana.torres@correo.test";
    static final String EMAIL_CARLA = "carla.mendoza@siga-sp.test";
    /** Dominio de las cuentas de la demostración v1.0 («Ana Demo», PAC001, CIT001…). */
    static final String DOMINIO_V1_0 = "@ejemplo.invalid";
    static final String MENSAJE_DATOS_V1_0 = "La base de datos contiene datos de la versión 1.0 de SIGA-SP (cuentas "
            + DOMINIO_V1_0 + ") y no se cargarán los datos nuevos encima. Reinicia la base de datos con "
            + "'scripts/db.sh reset' (con Docker: 'docker compose down -v' y luego 'docker compose up -d') y vuelve "
            + "a arrancar el backend.";
    private static final long SEMILLA = 20_261_023L;
    private static final Duration FRANJA = Duration.ofMinutes(20);
    private static final int FRANJAS_POR_TURNO = 15;
    private static final int DIAS_PASADOS = 45;
    private static final int DIAS_FUTUROS = 21;
    /** Citas activas como máximo en los datos (la regla de reserva admite 5). */
    private static final int MAX_ACTIVAS = 5;
    /** Las cuentas principales dejan cupo para probar la reserva. */
    private static final int MAX_ACTIVAS_CUENTAS_PRINCIPALES = 4;
    private static final List<String> MOTIVOS_CANCELACION = List.of("CAN-PERSONAL", "CAN-LABORAL", "CAN-TRASLADO",
            "CAN-YA-ATENDIDO");
    private static final List<String> MOTIVOS_REPROGRAMACION = List.of("REP-DISPONIBILIDAD", "REP-LABORAL",
            "REP-TRASLADO");

    // ------------------------------------------------------------------
    // Catálogo ficticio
    // ------------------------------------------------------------------

    enum Turno {
        MANANA(LocalTime.of(8, 0)),
        TARDE(LocalTime.of(14, 0));

        final LocalTime inicio;

        Turno(LocalTime inicio) {
            this.inicio = inicio;
        }
    }

    record SedeDemo(String codigo, String nombre, String direccion) {
        UUID id() {
            return DatosDemo.id("sede:" + codigo);
        }
    }

    record EspecialidadDemo(String codigo, String nombre, String descripcion) {
        UUID id() {
            return DatosDemo.id("especialidad:" + codigo);
        }
    }

    record ProfesionalDemo(String codigo, String nombre, EspecialidadDemo especialidad, SedeDemo sede,
            Set<DayOfWeek> dias, Turno turno) {
        UUID id() {
            return DatosDemo.id("profesional:" + codigo);
        }

        boolean atiende(LocalDate dia) {
            return dias.contains(dia.getDayOfWeek());
        }
    }

    record PacienteDemo(String codigo, String nombres, String apellidos, String email, String telefono,
            boolean femenino, boolean menor) {
        UUID id() {
            return DatosDemo.id("paciente:" + codigo);
        }

        UUID usuarioId() {
            return DatosDemo.id("usuario:" + codigo);
        }

        String nombreCompleto() {
            return nombres + " " + apellidos;
        }

        Actor actor() {
            return new Actor(usuarioId(), Rol.PACIENTE, id(), nombreCompleto());
        }
    }

    static final SedeDemo SURCO = new SedeDemo("SURCO", "Sede Surco", "Av. Primavera 1450, Santiago de Surco, Lima");
    static final SedeDemo SAN_ISIDRO = new SedeDemo("SAN-ISIDRO", "Sede San Isidro",
            "Calle Las Begonias 475, San Isidro, Lima");

    static final EspecialidadDemo MED_GEN = new EspecialidadDemo("MED-GEN", "Medicina general",
            "Evaluación integral, prevención y control de enfermedades frecuentes");
    static final EspecialidadDemo CARDIO = new EspecialidadDemo("CARDIO", "Cardiología",
            "Corazón y sistema circulatorio");
    static final EspecialidadDemo PEDIA = new EspecialidadDemo("PEDIA", "Pediatría",
            "Atención integral de bebés, niños y adolescentes");
    static final EspecialidadDemo DERMA = new EspecialidadDemo("DERMA", "Dermatología", "Piel, cabello y uñas");
    static final EspecialidadDemo GINECO = new EspecialidadDemo("GINECO", "Ginecología",
            "Salud de la mujer y control ginecológico");
    static final EspecialidadDemo TRAUMA = new EspecialidadDemo("TRAUMA", "Traumatología",
            "Huesos, articulaciones, músculos y lesiones deportivas");
    static final EspecialidadDemo OFTALMO = new EspecialidadDemo("OFTALMO", "Oftalmología",
            "Salud visual y enfermedades de los ojos");
    static final EspecialidadDemo ENDOCRINO = new EspecialidadDemo("ENDOCRINO", "Endocrinología",
            "Diabetes, tiroides, hormonas y metabolismo");
    static final List<EspecialidadDemo> ESPECIALIDADES = List.of(MED_GEN, CARDIO, PEDIA, DERMA, GINECO, TRAUMA,
            OFTALMO, ENDOCRINO);

    private static final Set<DayOfWeek> LUN_SAB = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.SATURDAY);
    private static final Set<DayOfWeek> LUN_VIE = EnumSet.range(DayOfWeek.MONDAY, DayOfWeek.FRIDAY);
    private static final Set<DayOfWeek> LMV = EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY);
    private static final Set<DayOfWeek> MJS = EnumSet.of(DayOfWeek.TUESDAY, DayOfWeek.THURSDAY, DayOfWeek.SATURDAY);
    private static final Set<DayOfWeek> LMVS = EnumSet.of(DayOfWeek.MONDAY, DayOfWeek.WEDNESDAY, DayOfWeek.FRIDAY,
            DayOfWeek.SATURDAY);

    static final ProfesionalDemo P01 = new ProfesionalDemo("P01", "Dr. Martín Quispe Salas", MED_GEN, SURCO,
            LUN_SAB, Turno.MANANA);
    static final ProfesionalDemo P02 = new ProfesionalDemo("P02", "Dra. Lucía Paredes Rojas", CARDIO, SURCO,
            LUN_VIE, Turno.MANANA);
    static final ProfesionalDemo P03 = new ProfesionalDemo("P03", "Dra. Carmen Villanueva Ccori", PEDIA, SURCO,
            LUN_SAB, Turno.TARDE);
    static final ProfesionalDemo P04 = new ProfesionalDemo("P04", "Dr. Andrés Salinas Medina", DERMA, SURCO,
            LMVS, Turno.TARDE);
    static final ProfesionalDemo P05 = new ProfesionalDemo("P05", "Dra. Gabriela Chávez Romero", GINECO, SURCO,
            MJS, Turno.MANANA);
    static final ProfesionalDemo P06 = new ProfesionalDemo("P06", "Dr. Ricardo Alvarado Cueva", TRAUMA, SURCO,
            LUN_VIE, Turno.TARDE);
    static final ProfesionalDemo P07 = new ProfesionalDemo("P07", "Dra. Patricia Rivas Gonzales", MED_GEN, SURCO,
            LUN_SAB, Turno.TARDE);
    static final ProfesionalDemo P08 = new ProfesionalDemo("P08", "Dr. Fernando Castillo Vera", MED_GEN,
            SAN_ISIDRO, LUN_SAB, Turno.MANANA);
    static final ProfesionalDemo P09 = new ProfesionalDemo("P09", "Dr. Eduardo Ramos Figueroa", CARDIO,
            SAN_ISIDRO, LUN_VIE, Turno.TARDE);
    static final ProfesionalDemo P10 = new ProfesionalDemo("P10", "Dra. Silvia Cárdenas Ponce", PEDIA,
            SAN_ISIDRO, LUN_VIE, Turno.MANANA);
    static final ProfesionalDemo P11 = new ProfesionalDemo("P11", "Dra. Mariela Gutiérrez Lozano", DERMA,
            SAN_ISIDRO, MJS, Turno.MANANA);
    static final ProfesionalDemo P12 = new ProfesionalDemo("P12", "Dra. Rosa Elena Tapia Núñez", GINECO,
            SAN_ISIDRO, LMV, Turno.TARDE);
    static final ProfesionalDemo P13 = new ProfesionalDemo("P13", "Dr. Víctor Manrique Solís", OFTALMO,
            SAN_ISIDRO, LUN_VIE, Turno.MANANA);
    static final ProfesionalDemo P14 = new ProfesionalDemo("P14", "Dra. Claudia Benavides Arce", ENDOCRINO,
            SAN_ISIDRO, LMV, Turno.MANANA);
    static final List<ProfesionalDemo> PROFESIONALES = List.of(P01, P02, P03, P04, P05, P06, P07, P08, P09, P10,
            P11, P12, P13, P14);

    static final PacienteDemo ANA = new PacienteDemo("PAC-0001", "Ana Lucía", "Torres Vega", EMAIL_ANA,
            "+51 987 112 340", true, false);
    static final PacienteDemo LUIS = new PacienteDemo("PAC-0002", "Luis Alberto", "Ramírez Soto",
            "luis.ramirez@correo.test", "+51 986 245 118", false, false);
    static final PacienteDemo RITA = new PacienteDemo("PAC-0003", "Rita", "Huamán Flores", "rita.huaman@correo.test",
            "+51 985 330 271", true, false);
    static final List<PacienteDemo> PACIENTES = List.of(ANA, LUIS, RITA,
            new PacienteDemo("PAC-0004", "José Antonio", "Vargas Lima", "jose.vargas@correo.test", "+51 984 417 652",
                    false, false),
            new PacienteDemo("PAC-0005", "María Fernanda", "Cruz Delgado", "maria.cruz@correo.test",
                    "+51 983 508 914", true, false),
            new PacienteDemo("PAC-0006", "Carlos Eduardo", "Sánchez Rojas", "carlos.sanchez@correo.test",
                    "+51 982 619 335", false, false),
            new PacienteDemo("PAC-0007", "Rosa María", "Flores Ventura", "rosa.flores@correo.test", "+51 981 720 486",
                    true, false),
            new PacienteDemo("PAC-0008", "Diego Alonso", "Herrera Campos", "diego.herrera@correo.test",
                    "+51 980 831 527", false, false),
            new PacienteDemo("PAC-0009", "Valeria Sofía", "Morales Pinto", "valeria.morales@correo.test",
                    "+51 979 942 618", true, false),
            new PacienteDemo("PAC-0010", "Miguel Ángel", "Espinoza Ríos", "miguel.espinoza@correo.test",
                    "+51 978 153 709", false, false),
            new PacienteDemo("PAC-0011", "Mateo Gabriel", "Castro Mejía", "familia.castro@correo.test",
                    "+51 977 264 810", false, true),
            new PacienteDemo("PAC-0012", "Sofía Valentina", "Aguilar Bravo", "familia.aguilar@correo.test",
                    "+51 976 375 921", true, true));
    private static final Set<PacienteDemo> CUENTAS_PRINCIPALES = Set.of(ANA, LUIS, RITA);

    static final UUID USR_CARLA = id("usuario:carla.mendoza");
    static final UUID USR_RENZO = id("usuario:renzo.palacios");
    static final UUID USR_JORGE = id("usuario:jorge.salazar");
    static final UUID USR_ADMIN = id("usuario:admin");
    private static final Actor CARLA = new Actor(USR_CARLA, Rol.OPERADOR, null, "Carla Mendoza Ruiz");
    private static final Actor RENZO = new Actor(USR_RENZO, Rol.OPERADOR, null, "Renzo Palacios Gil");

    // ------------------------------------------------------------------
    // Dependencias
    // ------------------------------------------------------------------

    private final JdbcClient jdbc;
    private final PasswordEncoder encoder;
    private final RelojAjustable reloj;
    private final TransactionTemplate transaccion;
    private final RegistroCitas registro;
    private final ServicioCitasPaciente paciente;
    private final ServicioAtencionOperador operador;
    private final CierreInasistencias cierre;
    private final Notificaciones notificaciones;
    private final String password;
    private final ZoneId zona;
    private int pasosOmitidos;

    DatosDemo(JdbcClient jdbc, PasswordEncoder encoder, RelojAjustable reloj, TransactionTemplate transaccion,
            RegistroCitas registro, ServicioCitasPaciente paciente, ServicioAtencionOperador operador,
            CierreInasistencias cierre, Notificaciones notificaciones,
            @Value("${sigasp.demo.password}") String password,
            @Value("${sigasp.reglas.zona-horaria:America/Lima}") ZoneId zona) {
        this.jdbc = jdbc;
        this.encoder = encoder;
        this.reloj = reloj;
        this.transaccion = transaccion;
        this.registro = registro;
        this.paciente = paciente;
        this.operador = operador;
        this.cierre = cierre;
        this.notificaciones = notificaciones;
        this.password = password;
        this.zona = zona;
    }

    /** Identificadores deterministas: la misma carga siempre produce los mismos IDs. */
    static UUID id(String clave) {
        return UUID.nameUUIDFromBytes(("siga-sp:demo:" + clave).getBytes(StandardCharsets.UTF_8));
    }

    @Override
    public void run(ApplicationArguments args) {
        // Antes que el marcador de «ya cargado»: una BD con datos v1.0 y v1.1 mezclados también se detiene.
        if (tieneDatosV10()) {
            log.error(MENSAJE_DATOS_V1_0);
            throw new DatosAntiguosException(MENSAJE_DATOS_V1_0);
        }
        if (yaCargado()) {
            log.info("Datos de demostración ya presentes; no se vuelven a cargar.");
            return;
        }
        long inicioCarga = System.nanoTime();
        // Si el reloj ya estaba simulado (p. ej., en una prueba), la carga parte de esa hora y la respeta al final.
        Instant previo = reloj.esSimulado() ? reloj.instant() : null;
        Instant real = reloj.instant();
        pasosOmitidos = 0;
        log.info("Cargando datos de demostración ficticios…");
        try {
            transaccion.executeWithoutResult(estado -> {
                catalogos();
                personas(real);
                agendas(real.atZone(zona).toLocalDate());
            });
            Carga carga = new Carga(real);
            carga.planificar();
            carga.ejecutar();
            log.info("Datos de demostración listos en {} ms: {} citas ({} pasos, {} omitidos). Cuentas: {}, "
                            + "luis.ramirez@correo.test, rita.huaman@correo.test, {}, jorge.salazar@siga-sp.test y {}.",
                    Duration.ofNanos(System.nanoTime() - inicioCarga).toMillis(), carga.citas, carga.pasos.size(),
                    pasosOmitidos, EMAIL_ANA, EMAIL_CARLA, EMAIL_ADMIN);
        } finally {
            reloj.fijar(previo);
        }
    }

    /** Pasos que una regla rechazó (solo ocurre en horas extremas, p. ej., cerca de la medianoche). */
    int pasosOmitidos() {
        return pasosOmitidos;
    }

    private boolean tieneDatosV10() {
        return jdbc.sql("SELECT EXISTS (SELECT 1 FROM usuario WHERE lower(email) LIKE :patron)")
                .param("patron", "%" + DOMINIO_V1_0)
                .query(Boolean.class)
                .single();
    }

    /** La BD tiene datos de una versión anterior: el arranque se detiene en vez de cargar encima. */
    static final class DatosAntiguosException extends IllegalStateException {

        private static final long serialVersionUID = 1L;

        DatosAntiguosException(String mensaje) {
            super(mensaje);
        }
    }

    private boolean yaCargado() {
        return jdbc.sql("SELECT count(*) FROM usuario WHERE lower(email) = :email")
                .param("email", EMAIL_ADMIN)
                .query(Long.class)
                .single() > 0;
    }

    // ------------------------------------------------------------------
    // Catálogos, personas y agendas
    // ------------------------------------------------------------------

    private void catalogos() {
        for (SedeDemo sede : List.of(SURCO, SAN_ISIDRO)) {
            jdbc.sql("""
                            INSERT INTO sede (id, codigo, nombre, direccion) VALUES (:id, :codigo, :nombre, :direccion)
                            ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, direccion = EXCLUDED.direccion
                            """)
                    .param("id", sede.id()).param("codigo", sede.codigo()).param("nombre", sede.nombre())
                    .param("direccion", sede.direccion()).update();
        }
        for (EspecialidadDemo especialidad : ESPECIALIDADES) {
            jdbc.sql("""
                            INSERT INTO especialidad (id, codigo, nombre, descripcion)
                            VALUES (:id, :codigo, :nombre, :descripcion)
                            ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, descripcion = EXCLUDED.descripcion
                            """)
                    .param("id", especialidad.id()).param("codigo", especialidad.codigo())
                    .param("nombre", especialidad.nombre()).param("descripcion", especialidad.descripcion()).update();
        }
        for (ProfesionalDemo profesional : PROFESIONALES) {
            jdbc.sql("""
                            INSERT INTO profesional (id, codigo, nombre_visible, especialidad_id)
                            VALUES (:id, :codigo, :nombre, :especialidad)
                            ON CONFLICT (id) DO UPDATE SET nombre_visible = EXCLUDED.nombre_visible,
                                                           especialidad_id = EXCLUDED.especialidad_id
                            """)
                    .param("id", profesional.id()).param("codigo", profesional.codigo())
                    .param("nombre", profesional.nombre()).param("especialidad", profesional.especialidad().id())
                    .update();
        }
    }

    private void personas(Instant ahora) {
        String hash = encoder.encode(password);
        // Las cuentas se crearon semanas antes de la primera cita de la historia.
        Instant alta = ahora.minus(Duration.ofDays(DIAS_PASADOS + 30));
        for (PacienteDemo p : PACIENTES) {
            jdbc.sql("""
                            INSERT INTO paciente (id, codigo, nombres, apellidos, email_contacto, telefono_contacto,
                                                  creado_en, actualizado_en, privacidad_aceptada_en,
                                                  privacidad_version)
                            VALUES (:id, :codigo, :nombres, :apellidos, :email, :telefono, :alta, :alta, :alta, '1.0')
                            ON CONFLICT DO NOTHING
                            """)
                    .param("id", p.id()).param("codigo", p.codigo()).param("nombres", p.nombres())
                    .param("apellidos", p.apellidos()).param("email", p.email()).param("telefono", p.telefono())
                    .param("alta", Timestamp.from(alta)).update();
            usuario(p.usuarioId(), p.email(), p.nombreCompleto(), Rol.PACIENTE, p.id(), hash, alta);
        }
        usuario(USR_CARLA, EMAIL_CARLA, CARLA.nombre(), Rol.OPERADOR, null, hash, alta);
        usuario(USR_RENZO, "renzo.palacios@siga-sp.test", RENZO.nombre(), Rol.OPERADOR, null, hash, alta);
        usuario(USR_JORGE, "jorge.salazar@siga-sp.test", "Jorge Salazar Paz", Rol.RESPONSABLE, null, hash, alta);
        usuario(USR_ADMIN, EMAIL_ADMIN, "Mónica Ríos Valdivia", Rol.ADMINISTRADOR, null, hash, alta);
        for (ProfesionalDemo profesional : PROFESIONALES) {
            jdbc.sql("INSERT INTO operador_profesional (usuario_id, profesional_id) VALUES (:u, :p) "
                            + "ON CONFLICT DO NOTHING")
                    .param("u", operadorDe(profesional).usuarioId()).param("p", profesional.id()).update();
        }
    }

    /** Franjas de 20 minutos de hoy a hoy + 21 según la agenda semanal de cada profesional (una sentencia cada uno). */
    private void agendas(LocalDate hoy) {
        for (ProfesionalDemo profesional : PROFESIONALES) {
            jdbc.sql("""
                            INSERT INTO horario (id, profesional_id, sede_id, inicio, fin)
                            SELECT gen_random_uuid(), :profesional, :sede,
                                   (d::date + CAST(:hora AS time) + k * interval '20 minutes') AT TIME ZONE :zona,
                                   (d::date + CAST(:hora AS time) + (k + 1) * interval '20 minutes') AT TIME ZONE :zona
                            FROM generate_series(CAST(:desde AS timestamp), CAST(:hasta AS timestamp),
                                                 interval '1 day') AS d,
                                 generate_series(0, :franjas - 1) AS k
                            WHERE extract(isodow FROM d) IN (:dias)
                            ON CONFLICT DO NOTHING
                            """)
                    .param("profesional", profesional.id())
                    .param("sede", profesional.sede().id())
                    .param("hora", profesional.turno().inicio)
                    .param("zona", zona.getId())
                    .param("desde", hoy)
                    .param("hasta", hoy.plusDays(DIAS_FUTUROS))
                    .param("franjas", FRANJAS_POR_TURNO)
                    .param("dias", profesional.dias().stream().map(DayOfWeek::getValue).toList())
                    .update();
        }
    }

    /** Crea (si no existe) la franja de 20 minutos que empieza en el instante dado y devuelve su ID. */
    private UUID horario(ProfesionalDemo profesional, Instant inicio) {
        jdbc.sql("""
                        INSERT INTO horario (id, profesional_id, sede_id, inicio, fin)
                        VALUES (:id, :profesional, :sede, :inicio, :fin)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", id("horario:" + profesional.codigo() + ":" + inicio))
                .param("profesional", profesional.id())
                .param("sede", profesional.sede().id())
                .param("inicio", Timestamp.from(inicio))
                .param("fin", Timestamp.from(inicio.plus(FRANJA)))
                .update();
        return jdbc.sql("SELECT id FROM horario WHERE profesional_id = :p AND inicio = :inicio")
                .param("p", profesional.id())
                .param("inicio", Timestamp.from(inicio))
                .query(UUID.class)
                .single();
    }

    private static Actor operadorDe(ProfesionalDemo profesional) {
        return profesional.sede() == SURCO ? CARLA : RENZO;
    }

    private void usuario(UUID id, String email, String nombre, Rol rol, UUID pacienteId, String hash, Instant alta) {
        jdbc.sql("""
                        INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id,
                                             creado_en)
                        VALUES (:id, :email, :hash, :nombre, :rol, TRUE, :paciente, :alta)
                        ON CONFLICT DO NOTHING
                        """)
                .param("id", id).param("email", email).param("hash", hash).param("nombre", nombre)
                .param("rol", rol.name()).param("paciente", pacienteId).param("alta", Timestamp.from(alta))
                .update();
    }

    private int versionAgenda(UUID cita) {
        return jdbc.sql("SELECT version_agenda_vigente FROM cita WHERE id = :id").param("id", cita)
                .query(Integer.class).single();
    }

    private long versionCita(UUID cita) {
        return jdbc.sql("SELECT version FROM cita WHERE id = :id").param("id", cita).query(Long.class).single();
    }

    // ------------------------------------------------------------------
    // Planificación y ejecución de la historia
    // ------------------------------------------------------------------

    private enum Desenlace {
        COMPLETADA, NO_ASISTIO, CANCELADA, REPROGRAMADA_Y_COMPLETADA,
        PENDIENTE, CONFIRMADA, REPROGRAMADA, EN_ATENCION, EN_ESPERA, CHECK_IN
    }

    private record Paso(Instant cuando, int orden, Runnable accion) {
    }

    /** Una carga: planifica todas las citas como pasos con instante y los ejecuta en orden cronológico. */
    private final class Carga {

        private final Instant real;
        private final LocalDate hoy;
        private final Random azar = new Random(SEMILLA);
        private final List<Paso> pasos = new ArrayList<>();
        private final Set<String> franjasUsadas = new HashSet<>();
        private final Map<PacienteDemo, Set<LocalDate>> diasPorPaciente = new HashMap<>();
        private final Map<PacienteDemo, Integer> activas = new HashMap<>();
        private int citas;

        Carga(Instant real) {
            this.real = real;
            this.hoy = real.atZone(zona).toLocalDate();
        }

        void planificar() {
            hoy();
            historiaAna();
            historiaLuis();
            historiaRita();
            relleno();
        }

        void ejecutar() {
            pasos.sort(Comparator.comparing(Paso::cuando).thenComparingInt(Paso::orden));
            for (Paso paso : pasos) {
                reloj.fijar(paso.cuando());
                try {
                    paso.accion().run();
                } catch (ApiException ex) {
                    // Solo en horas extremas (cerca de la medianoche) una ventana del día puede no aplicar.
                    pasosOmitidos++;
                    log.warn("Paso de demostración omitido a las {}: {}", paso.cuando(), ex.getMessage());
                }
            }
        }

        // --------------------------------------------------------------
        // Hoy: el panel del operador lleno, en distintos momentos del recorrido
        // --------------------------------------------------------------

        private void hoy() {
            Instant base = siguienteFranja(real);
            List<PacienteDemo> otros = PACIENTES.stream().filter(p -> !CUENTAS_PRINCIPALES.contains(p)).toList();
            PacienteDemo menor1 = PACIENTES.get(10);
            PacienteDemo menor2 = PACIENTES.get(11);
            hoy(otros.get(0), P01, base, -240, Desenlace.COMPLETADA);
            hoy(otros.get(1), P05, base, -200, Desenlace.COMPLETADA);
            hoy(menor1, P03, base, -160, Desenlace.COMPLETADA);
            hoy(otros.get(2), P04, base, -140, Desenlace.CANCELADA);
            hoy(otros.get(3), P07, base, -120, Desenlace.NO_ASISTIO);
            hoy(otros.get(4), P02, base, -80, Desenlace.COMPLETADA);
            hoy(otros.get(5), P01, base, -40, Desenlace.EN_ATENCION);
            hoy(LUIS, P07, base, -20, Desenlace.EN_ESPERA);
            hoy(otros.get(6), P02, base, 0, Desenlace.CHECK_IN);
            // Ana: confirmada y dentro de la ventana de llegada (puede registrar su llegada desde la app).
            hoy(ANA, P01, base, 20, Desenlace.CONFIRMADA);
            hoy(RITA, P06, base, 60, Desenlace.PENDIENTE);
            hoy(menor2, P03, base, 120, Desenlace.CONFIRMADA);
        }

        private void hoy(PacienteDemo p, ProfesionalDemo prof, Instant base, int minutos, Desenlace desenlace) {
            Instant inicio = base.plus(Duration.ofMinutes(minutos));
            Instant registrada = real.minus(Duration.ofDays(2 + azar.nextInt(10))).minus(minutosAzar(30, 600));
            UUID cita = cita(p, prof, inicio, registrada);
            switch (desenlace) {
                case COMPLETADA -> {
                    confirmar(p, cita, inicio.minus(Duration.ofHours(20 + azar.nextInt(20))));
                    atendida(p, prof, cita, inicio, minutos % 80 == 0);
                }
                case CANCELADA -> cancelar(p, cita, real.minus(Duration.ofHours(18)));
                case NO_ASISTIO -> cierreTrasVentana(inicio);
                case EN_ATENCION -> {
                    Instant llegada = inicio.minus(Duration.ofMinutes(15));
                    operador(prof, cita, llegada, AccionOperador.REGISTRAR_LLEGADA);
                    operador(prof, cita, llegada.plus(Duration.ofMinutes(2)), AccionOperador.PASAR_A_ESPERA);
                    operador(prof, cita, inicio.plus(Duration.ofMinutes(2)), AccionOperador.INICIAR_ATENCION);
                }
                case EN_ESPERA -> {
                    confirmar(p, cita, real.minus(Duration.ofHours(26)));
                    Instant llegada = inicio.minus(Duration.ofMinutes(10));
                    llegadaPaciente(p, cita, llegada);
                    operador(prof, cita, llegada.plus(Duration.ofMinutes(2)), AccionOperador.PASAR_A_ESPERA);
                }
                case CHECK_IN -> operador(prof, cita, real.minus(Duration.ofMinutes(3)),
                        AccionOperador.REGISTRAR_LLEGADA);
                case CONFIRMADA -> {
                    confirmar(p, cita, real.minus(Duration.ofHours(22)));
                    preCheckIn(p, cita, real.minus(Duration.ofHours(3)));
                }
                default -> {
                    // PENDIENTE: registrada y a la espera de confirmación.
                }
            }
            if (EnumSet.of(Desenlace.EN_ATENCION, Desenlace.EN_ESPERA, Desenlace.CHECK_IN, Desenlace.CONFIRMADA,
                    Desenlace.PENDIENTE).contains(desenlace)) {
                activas.merge(p, 1, Integer::sum);
            }
        }

        // --------------------------------------------------------------
        // Historias guionizadas de las cuentas principales
        // --------------------------------------------------------------

        /** Ana: historial rico (completadas, inasistencia, cancelaciones y reprogramaciones) y citas próximas. */
        private void historiaAna() {
            pasada(ANA, P01, dia(P01, -40), 2, Desenlace.COMPLETADA);
            pasada(ANA, P02, dia(P02, -26), 4, Desenlace.COMPLETADA);
            pasada(ANA, P04, dia(P04, -19), 6, Desenlace.NO_ASISTIO);
            pasada(ANA, P05, dia(P05, -12), 3, Desenlace.CANCELADA);
            pasada(ANA, P14, dia(P14, -9), 5, Desenlace.REPROGRAMADA_Y_COMPLETADA);
            pasada(ANA, P13, dia(P13, -3), 1, Desenlace.COMPLETADA);
            futura(ANA, P02, dia(P02, 3), 4, Desenlace.CONFIRMADA);
            futura(ANA, P05, dia(P05, 6), 2, Desenlace.CANCELADA);
            futura(ANA, P04, dia(P04, 8), 5, Desenlace.PENDIENTE);
            futura(ANA, P06, dia(P06, 10), 3, Desenlace.REPROGRAMADA);
        }

        /** Luis: cita reprogramada (versión 2) por confirmar y una en espera hoy. */
        private void historiaLuis() {
            pasada(LUIS, P08, dia(P08, -30), 3, Desenlace.COMPLETADA);
            pasada(LUIS, P09, dia(P09, -15), 2, Desenlace.REPROGRAMADA_Y_COMPLETADA);
            pasada(LUIS, P11, dia(P11, -5), 7, Desenlace.CANCELADA);
            futura(LUIS, P01, dia(P01, 5), 6, Desenlace.REPROGRAMADA);
        }

        /** Rita: varias especialidades, una inasistencia y citas próximas pendientes y confirmadas. */
        private void historiaRita() {
            pasada(RITA, P12, dia(P12, -22), 4, Desenlace.COMPLETADA);
            pasada(RITA, P13, dia(P13, -8), 2, Desenlace.NO_ASISTIO);
            futura(RITA, P09, dia(P09, 2), 5, Desenlace.PENDIENTE);
            futura(RITA, P14, dia(P14, 4), 1, Desenlace.CONFIRMADA);
        }

        // --------------------------------------------------------------
        // Relleno verosímil: más citas pasadas que futuras, con proporciones realistas
        // --------------------------------------------------------------

        private void relleno() {
            for (int d = -DIAS_PASADOS; d <= DIAS_FUTUROS; d++) {
                LocalDate dia = hoy.plusDays(d);
                if (d == 0 || dia.getDayOfWeek() == DayOfWeek.SUNDAY) {
                    continue;
                }
                int cantidad = d < 0 ? 2 + azar.nextInt(2) : 1 + azar.nextInt(2);
                for (int i = 0; i < cantidad; i++) {
                    citaAlAzar(dia, d < 0);
                }
            }
        }

        private void citaAlAzar(LocalDate dia, boolean pasado) {
            List<ProfesionalDemo> disponibles = PROFESIONALES.stream().filter(p -> p.atiende(dia)).toList();
            for (int intento = 0; intento < 20; intento++) {
                ProfesionalDemo prof = disponibles.get(azar.nextInt(disponibles.size()));
                int franja = azar.nextInt(FRANJAS_POR_TURNO);
                if (franjasUsadas.contains(clave(prof, inicio(prof, dia, franja)))) {
                    continue;
                }
                List<PacienteDemo> candidatos = PACIENTES.stream()
                        .filter(p -> atiende(p, prof.especialidad()))
                        .filter(p -> !diasPorPaciente.getOrDefault(p, Set.of()).contains(dia))
                        .filter(p -> pasado || activas.getOrDefault(p, 0) < maximoActivas(p))
                        .toList();
                if (candidatos.isEmpty()) {
                    continue;
                }
                PacienteDemo p = candidatos.get(azar.nextInt(candidatos.size()));
                double r = azar.nextDouble();
                if (pasado) {
                    Desenlace desenlace = r < 0.09 ? Desenlace.NO_ASISTIO
                            : r < 0.19 ? Desenlace.CANCELADA
                            : r < 0.26 ? Desenlace.REPROGRAMADA_Y_COMPLETADA
                            : Desenlace.COMPLETADA;
                    pasada(p, prof, dia, franja, desenlace);
                } else {
                    Desenlace desenlace = r < 0.10 ? Desenlace.CANCELADA
                            : r < 0.20 ? Desenlace.REPROGRAMADA
                            : r < 0.60 ? Desenlace.CONFIRMADA
                            : Desenlace.PENDIENTE;
                    futura(p, prof, dia, franja, desenlace);
                }
                return;
            }
        }

        private int maximoActivas(PacienteDemo p) {
            return CUENTAS_PRINCIPALES.contains(p) ? MAX_ACTIVAS_CUENTAS_PRINCIPALES : MAX_ACTIVAS;
        }

        // --------------------------------------------------------------
        // Recorridos
        // --------------------------------------------------------------

        private void pasada(PacienteDemo p, ProfesionalDemo prof, LocalDate dia, int franja, Desenlace desenlace) {
            Instant inicio = inicio(prof, dia, franja);
            Instant registrada = inicio.minus(Duration.ofDays(4 + azar.nextInt(18))).minus(minutosAzar(30, 600));
            UUID cita = cita(p, prof, inicio, registrada);
            switch (desenlace) {
                case NO_ASISTIO -> {
                    if (azar.nextBoolean()) {
                        confirmar(p, cita, inicio.minus(Duration.ofHours(20 + azar.nextInt(30))));
                    }
                    cierreTrasVentana(inicio);
                }
                case CANCELADA -> cancelar(p, cita, entre(registrada.plus(Duration.ofHours(2)),
                        inicio.minus(Duration.ofHours(6))));
                case REPROGRAMADA_Y_COMPLETADA -> {
                    LocalDate nuevoDia = siguienteDia(prof, dia, 1 + azar.nextInt(4));
                    if (!nuevoDia.isBefore(hoy)) {
                        completada(p, prof, cita, inicio, registrada);
                        return;
                    }
                    Instant nuevoInicio = inicioLibre(prof, nuevoDia, franja);
                    Instant cambio = entre(registrada.plus(Duration.ofHours(2)), inicio.minus(Duration.ofDays(1)));
                    reprogramar(p, prof, cita, cambio, nuevoInicio);
                    diasPorPaciente.computeIfAbsent(p, k -> new HashSet<>()).add(nuevoDia);
                    completada(p, prof, cita, nuevoInicio, cambio);
                }
                default -> completada(p, prof, cita, inicio, registrada);
            }
        }

        private void completada(PacienteDemo p, ProfesionalDemo prof, UUID cita, Instant inicio, Instant desde) {
            if (azar.nextDouble() < 0.7) {
                confirmar(p, cita, entre(desde.plus(Duration.ofHours(1)), inicio.minus(Duration.ofHours(14))));
            }
            if (azar.nextDouble() < 0.35) {
                preCheckIn(p, cita, inicio.minus(Duration.ofHours(2 + azar.nextInt(10))));
            }
            atendida(p, prof, cita, inicio, azar.nextDouble() < 0.4);
        }

        private void futura(PacienteDemo p, ProfesionalDemo prof, LocalDate dia, int franja, Desenlace desenlace) {
            Instant inicio = inicio(prof, dia, franja);
            Instant registrada = real.minus(Duration.ofDays(1 + azar.nextInt(12))).minus(minutosAzar(30, 600));
            UUID cita = cita(p, prof, inicio, registrada);
            Instant cambio = entre(registrada.plus(Duration.ofHours(1)), real.minus(Duration.ofMinutes(30)));
            switch (desenlace) {
                case CONFIRMADA -> {
                    confirmar(p, cita, cambio);
                    if (Duration.between(real, inicio).toDays() < 4) {
                        preCheckIn(p, cita, entre(cambio, real.minus(Duration.ofMinutes(10))));
                    }
                }
                case CANCELADA -> cancelar(p, cita, cambio);
                case REPROGRAMADA -> {
                    LocalDate nuevoDia = siguienteDia(prof, dia, 1 + azar.nextInt(5));
                    reprogramar(p, prof, cita, cambio, inicioLibre(prof, nuevoDia, franja));
                    diasPorPaciente.computeIfAbsent(p, k -> new HashSet<>()).add(nuevoDia);
                }
                default -> {
                    // PENDIENTE: a la espera de que el paciente confirme.
                }
            }
            if (desenlace != Desenlace.CANCELADA) {
                activas.merge(p, 1, Integer::sum);
            }
        }

        /** Llegada (por la app o en recepción), espera, atención y cierre de la atención. */
        private void atendida(PacienteDemo p, ProfesionalDemo prof, UUID cita, Instant inicio, boolean llegaPorApp) {
            Instant llegada = inicio.minus(Duration.ofMinutes(8 + azar.nextInt(23)));
            if (llegaPorApp) {
                llegadaPaciente(p, cita, llegada);
            } else {
                operador(prof, cita, llegada, AccionOperador.REGISTRAR_LLEGADA);
            }
            Instant espera = llegada.plus(Duration.ofMinutes(1 + azar.nextInt(4)));
            operador(prof, cita, espera, AccionOperador.PASAR_A_ESPERA);
            Instant atencion = inicio.plus(Duration.ofMinutes(azar.nextInt(16) - 4));
            if (!atencion.isAfter(espera)) {
                atencion = espera.plus(Duration.ofMinutes(2));
            }
            operador(prof, cita, atencion, AccionOperador.INICIAR_ATENCION);
            operador(prof, cita, atencion.plus(Duration.ofMinutes(12 + azar.nextInt(14))), AccionOperador.COMPLETAR);
        }

        // --------------------------------------------------------------
        // Pasos (cada uno por el caso de uso real, con el reloj en su instante)
        // --------------------------------------------------------------

        private UUID cita(PacienteDemo p, ProfesionalDemo prof, Instant inicio, Instant registrada) {
            UUID citaId = id("cita:" + (++citas));
            UUID horarioId = horario(prof, inicio);
            franjasUsadas.add(clave(prof, inicio));
            diasPorPaciente.computeIfAbsent(p, k -> new HashSet<>()).add(inicio.atZone(zona).toLocalDate());
            paso(registrada, () -> registro.registrar(new NuevaCita(citaId, p.id(), prof.especialidad().id(),
                    horarioId)));
            recordatorio(inicio, registrada);
            return citaId;
        }

        private void confirmar(PacienteDemo p, UUID cita, Instant cuando) {
            paso(cuando, () -> paciente.confirmar(p.actor(), cita, UUID.randomUUID(), versionAgenda(cita)));
        }

        private void preCheckIn(PacienteDemo p, UUID cita, Instant cuando) {
            paso(cuando, () -> paciente.completarPreCheckIn(p.actor(), cita, UUID.randomUUID(), versionAgenda(cita),
                    p.email(), p.telefono(), true));
        }

        private void cancelar(PacienteDemo p, UUID cita, Instant cuando) {
            String motivo = MOTIVOS_CANCELACION.get(azar.nextInt(MOTIVOS_CANCELACION.size()));
            paso(cuando, () -> paciente.cancelar(p.actor(), cita, UUID.randomUUID(), versionAgenda(cita), motivo));
        }

        private void reprogramar(PacienteDemo p, ProfesionalDemo prof, UUID cita, Instant cuando, Instant nuevoInicio) {
            UUID nuevoHorario = horario(prof, nuevoInicio);
            franjasUsadas.add(clave(prof, nuevoInicio));
            String motivo = MOTIVOS_REPROGRAMACION.get(azar.nextInt(MOTIVOS_REPROGRAMACION.size()));
            paso(cuando, () -> paciente.reprogramar(p.actor(), cita, UUID.randomUUID(), versionAgenda(cita),
                    nuevoHorario, motivo));
            recordatorio(nuevoInicio, cuando);
        }

        private void llegadaPaciente(PacienteDemo p, UUID cita, Instant cuando) {
            paso(cuando, () -> paciente.registrarLlegada(p.actor(), cita, UUID.randomUUID(), versionAgenda(cita)));
        }

        private void operador(ProfesionalDemo prof, UUID cita, Instant cuando, AccionOperador accion) {
            Actor op = operadorDe(prof);
            paso(cuando, () -> operador.ejecutar(op, cita, UUID.randomUUID(), accion, versionCita(cita)));
        }

        /** El cierre automático corre cada minuto; aquí, justo después de que vence la ventana de llegada. */
        private void cierreTrasVentana(Instant inicio) {
            paso(inicio.plus(Duration.ofMinutes(31)), cierre::ejecutar);
        }

        /** El proceso de recordatorios corre cada 5 minutos: aquí, en cuanto la cita entra en las 24 h previas. */
        private void recordatorio(Instant inicio, Instant registrada) {
            Instant cuando = inicio.minus(Duration.ofHours(24)).plus(Duration.ofMinutes(1));
            if (!cuando.isAfter(registrada)) {
                cuando = registrada.plus(Duration.ofMinutes(1));
            }
            // Si la ventana del recordatorio aún no se abre, lo generará el proceso programado.
            if (cuando.isBefore(inicio) && !cuando.isAfter(real)) {
                paso(cuando, notificaciones::generarRecordatorios);
            }
        }

        private void paso(Instant cuando, Runnable accion) {
            if (cuando.isAfter(real)) {
                throw new IllegalStateException("Paso de demostración en el futuro: " + cuando);
            }
            pasos.add(new Paso(cuando, pasos.size(), accion));
        }

        // --------------------------------------------------------------
        // Calendario
        // --------------------------------------------------------------

        /** Día más cercano a hoy + {@code dias} en que atiende el profesional (sin cruzar hoy). */
        private LocalDate dia(ProfesionalDemo prof, int dias) {
            LocalDate dia = hoy.plusDays(dias);
            while (!prof.atiende(dia)) {
                dia = dias < 0 ? dia.minusDays(1) : dia.plusDays(1);
            }
            return dia;
        }

        /** Día de atención del profesional al menos {@code dias} después de {@code desde}. */
        private LocalDate siguienteDia(ProfesionalDemo prof, LocalDate desde, int dias) {
            LocalDate dia = desde.plusDays(dias);
            while (!prof.atiende(dia)) {
                dia = dia.plusDays(1);
            }
            return dia;
        }

        private Instant inicio(ProfesionalDemo prof, LocalDate dia, int franja) {
            return dia.atTime(prof.turno().inicio).plus(FRANJA.multipliedBy(franja)).atZone(zona).toInstant();
        }

        /** Primera franja libre del día a partir de {@code franja} (rota dentro del turno). */
        private Instant inicioLibre(ProfesionalDemo prof, LocalDate dia, int franja) {
            for (int i = 0; i < FRANJAS_POR_TURNO; i++) {
                Instant candidato = inicio(prof, dia, (franja + i) % FRANJAS_POR_TURNO);
                if (!franjasUsadas.contains(clave(prof, candidato))) {
                    return candidato;
                }
            }
            return inicio(prof, dia, FRANJAS_POR_TURNO);
        }

        private boolean atiende(PacienteDemo p, EspecialidadDemo especialidad) {
            if (especialidad == PEDIA) {
                return p.menor();
            }
            if (especialidad == GINECO) {
                return p.femenino() && !p.menor();
            }
            return !p.menor() || especialidad == DERMA || especialidad == OFTALMO;
        }

        /** Instante al azar entre dos límites (si el intervalo es vacío, el primero). */
        private Instant entre(Instant desde, Instant hasta) {
            long segundos = Duration.between(desde, hasta).toSeconds();
            if (segundos <= 0) {
                return desde;
            }
            return desde.plusSeconds((long) (segundos * (0.2 + 0.7 * azar.nextDouble())))
                    .truncatedTo(ChronoUnit.MINUTES);
        }

        private Duration minutosAzar(int minimo, int maximo) {
            return Duration.ofMinutes(minimo + azar.nextInt(maximo - minimo));
        }

        private String clave(ProfesionalDemo prof, Instant inicio) {
            return prof.codigo() + "|" + inicio;
        }
    }

    /**
     * Primer inicio de franja (múltiplo de 20 minutos, como la rejilla de la agenda) no anterior al instante:
     * así las citas «de hoy» caen en la misma rejilla que las franjas libres.
     */
    static Instant siguienteFranja(Instant desde) {
        Instant base = desde.truncatedTo(ChronoUnit.HOURS);
        while (base.isBefore(desde)) {
            base = base.plus(FRANJA);
        }
        return base;
    }
}
