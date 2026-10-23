package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P2;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * v1.1 · Reserva de citas por el paciente: catálogos, disponibilidad por especialidad y alta idempotente con
 * código SP-AAAA-NNNNNN, límites (5 activas, sin cruces de horario, una por especialidad y día), anticipación
 * mínima de 2 horas, especialidad coherente con el horario y carrera por el mismo horario.
 */
@DisplayName("v1.1 · Reserva de citas")
class ReservaCitasIntegracionTest extends PruebaApi {

    private static final String DISPONIBILIDAD = "/api/v1/pacientes/me/disponibilidad";

    private MockHttpSession sesionA;

    @BeforeEach
    void sesion() {
        sesionA = login(EMAIL_A);
    }

    private MvcTestResult reservar(MockHttpSession sesion, UUID horario, String especialidad) {
        return reservar(sesion, horario, especialidad, UUID.randomUUID());
    }

    private MvcTestResult reservar(MockHttpSession sesion, UUID horario, String especialidad, UUID clave) {
        return post(sesion, CITAS, "{\"horarioId\":\"" + horario + "\",\"especialidadCodigo\":\"" + especialidad
                + "\"}", clave);
    }

    // ------------------------------------------------------------------
    // Catálogos y disponibilidad
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Los catálogos de especialidades, profesionales y sedes siguen el contrato y se cachean en el navegador")
    void catalogos() {
        jdbc.sql("UPDATE especialidad SET descripcion = 'Corazón y sistema circulatorio' WHERE codigo = 'ESP-2'")
                .update();
        jdbc.sql("UPDATE sede SET direccion = 'Av. Primavera 1450, Santiago de Surco' WHERE codigo = 'SEDE-T'")
                .update();

        MvcTestResult especialidades = get(sesionA, "/api/v1/catalogos/especialidades");
        assertThat(especialidades).hasStatusOk().bodyJson().isStrictlyEqualTo("""
                [{"codigo":"ESP-2","nombre":"Cardiología","descripcion":"Corazón y sistema circulatorio"},
                 {"codigo":"ESP-1","nombre":"Medicina general","descripcion":null}]""");
        assertThat(especialidades.getResponse().getHeader(HttpHeaders.CACHE_CONTROL))
                .isEqualTo("max-age=300, private");
        assertThat(get(sesionA, "/api/v1/catalogos/profesionales?especialidad=ESP-2")).hasStatusOk().bodyJson()
                .isStrictlyEqualTo("""
                        [{"codigo":"P2","nombre":"Profesional P2",
                          "especialidad":{"codigo":"ESP-2","nombre":"Cardiología"}}]""");
        assertThat(get(sesionA, "/api/v1/catalogos/profesionales")).hasStatusOk().bodyJson()
                .extractingPath("$[*].codigo").asArray().containsExactly("P1", "P2");
        assertThat(get(sesionA, "/api/v1/catalogos/profesionales?especialidad=NO-EXISTE")).hasStatusOk().bodyJson()
                .isStrictlyEqualTo("[]");
        assertThat(get(sesionA, "/api/v1/catalogos/sedes")).hasStatusOk().bodyJson().isStrictlyEqualTo("""
                [{"codigo":"SEDE-T","nombre":"Sede de prueba","direccion":"Av. Primavera 1450, Santiago de Surco"}]""");
        esperarError(mvc.get().uri("/api/v1/catalogos/sedes").exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
    }

    @Test
    @DisplayName("La disponibilidad lista solo franjas libres y futuras de la especialidad, por inicio, en el rango pedido")
    void disponibilidad() {
        UUID pasada = escenario.horario(P1, AHORA.minus(Duration.ofHours(1)));
        UUID manana = escenario.horario(P1, AHORA.plus(Duration.ofDays(1)));
        UUID miercoles = escenario.horario(P1, MIERCOLES_9AM);
        UUID ocupada = horarioDe(escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofHours(1))));
        UUID otraEspecialidad = escenario.horario(P2, MIERCOLES_9AM);
        UUID lejana = escenario.horario(P1, AHORA.plus(Duration.ofDays(20)));

        MvcTestResult resultado = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1");

        assertThat(resultado).hasStatusOk();
        assertThat((List<String>) valor(resultado, "$[*].horarioId"))
                .containsExactly(manana.toString(), miercoles.toString())
                .doesNotContain(pasada.toString(), ocupada.toString(), otraEspecialidad.toString(), lejana.toString());
        assertThat(resultado).bodyJson().isLenientlyEqualTo("""
                [{"horarioId":"%s","inicio":"2026-11-03T13:00:00Z","fin":"2026-11-03T13:20:00Z",
                  "profesional":{"codigo":"P1","nombre":"Profesional P1"},
                  "sede":{"codigo":"SEDE-T","nombre":"Sede de prueba"}},
                 {"horarioId":"%s","inicio":"2026-11-04T14:00:00Z","fin":"2026-11-04T14:20:00Z",
                  "profesional":{"codigo":"P1","nombre":"Profesional P1"},
                  "sede":{"codigo":"SEDE-T","nombre":"Sede de prueba"}}]""".formatted(manana, miercoles));
        assertThat((List<String>) valor(get(sesionA, DISPONIBILIDAD
                + "?especialidad=ESP-1&profesional=P1&desde=2026-11-22&hasta=2026-11-22"), "$[*].horarioId"))
                .containsExactly(lejana.toString());
    }

    @Test
    @DisplayName("La disponibilidad valida la especialidad, el profesional y el rango (400 con el campo)")
    void disponibilidadInvalida() {
        MvcTestResult sinEspecialidad = get(sesionA, DISPONIBILIDAD);
        MvcTestResult inexistente = get(sesionA, DISPONIBILIDAD + "?especialidad=NO-EXISTE");
        MvcTestResult profesionalAjeno = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&profesional=P2");
        MvcTestResult rangoLargo = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&desde=2026-11-01&hasta=2026-12-15");
        MvcTestResult rangoInvertido = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&desde=2026-11-10&hasta=2026-11-09");
        MvcTestResult fechaIlegible = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&desde=10-11-2026");

        esperarError(sinEspecialidad, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((String) valor(sinEspecialidad, "$.errores[0].campo")).isEqualTo("especialidad");
        esperarError(inexistente, HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(profesionalAjeno, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((String) valor(profesionalAjeno, "$.errores[0].campo")).isEqualTo("profesional");
        esperarError(rangoLargo, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((String) valor(rangoLargo, "$.detail"))
                .isEqualTo("El rango de fechas puede abarcar como máximo 31 días.");
        esperarError(rangoInvertido, HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(fechaIlegible, HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(get(login(EMAIL_OPERADOR), DISPONIBILIDAD + "?especialidad=ESP-1"), HttpStatus.FORBIDDEN,
                "ACCESO_DENEGADO");
    }

    @Test
    @DisplayName("El rango de la disponibilidad incluye desde y hasta: 31 días se aceptan y 32 responden 400")
    void rangoDeDiasIncluidos() {
        UUID ultimoDia = escenario.horario(P1, Instant.parse("2026-12-02T14:00:00Z"));

        MvcTestResult treintaYUno = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&desde=2026-11-02&hasta=2026-12-02");
        MvcTestResult treintaYDos = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&desde=2026-11-02&hasta=2026-12-03");

        assertThat(treintaYUno).hasStatusOk();
        assertThat((List<String>) valor(treintaYUno, "$[*].horarioId")).containsExactly(ultimoDia.toString());
        esperarError(treintaYDos, HttpStatus.BAD_REQUEST, "VALIDACION");
        // La reprogramación usa la misma regla de días incluidos.
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        assertThat(get(sesionA, CITAS + "/" + cita + "/horarios-disponibles?desde=2026-11-02&hasta=2026-12-02"))
                .hasStatusOk();
        esperarError(get(sesionA, CITAS + "/" + cita + "/horarios-disponibles?desde=2026-11-02&hasta=2026-12-03"),
                HttpStatus.BAD_REQUEST, "VALIDACION");
    }

    // ------------------------------------------------------------------
    // Reserva
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Reservar responde 201 con la cita Pendiente (versión 1, código SP-AAAA-NNNNNN), evento, auditoría y aviso")
    void reservaFeliz() {
        UUID horario = escenario.horario(P1, MIERCOLES_9AM);
        UUID clave = UUID.randomUUID();

        MvcTestResult resultado = reservar(sesionA, horario, "ESP-1", clave);

        assertThat(resultado).hasStatus(HttpStatus.CREATED).bodyJson().isLenientlyEqualTo("""
                {"codigo":"SP-2026-000001","estado":"PENDIENTE","estadoEtiqueta":"Pendiente","versionAgenda":1,
                 "inicio":"2026-11-04T14:00:00Z","fin":"2026-11-04T14:20:00Z","zonaHoraria":"America/Lima",
                 "sede":{"codigo":"SEDE-T"},"especialidad":{"codigo":"ESP-1","nombre":"Medicina general"},
                 "profesional":{"codigo":"P1"},"confirmadaEn":null,"motivoCancelacion":null}""");
        UUID cita = UUID.fromString(valor(resultado, "$.id"));
        assertThat((List<String>) valor(resultado, "$.accionesPermitidas"))
                .contains("CONFIRMAR", "CANCELAR", "REPROGRAMAR", "PRE_CHECK_IN");
        assertThat(resultado.getResponse().getHeader(HttpHeaders.LOCATION)).isEqualTo(CITAS + "/" + cita);

        assertThat(ocupanteDe(horario)).isEqualTo(cita);
        assertThat(jdbc.sql("SELECT paciente_id FROM cita WHERE id = ?").params(cita).query(UUID.class).single())
                .isEqualTo(PACIENTE_A);
        Map<String, Object> evento = jdbc.sql("SELECT tipo, actor_tipo, actor_usuario_id, operacion_id "
                + "FROM cita_evento WHERE cita_id = ?").params(cita).query().singleRow();
        assertThat(evento).containsEntry("tipo", "CREADA").containsEntry("actor_tipo", "PACIENTE")
                .containsEntry("actor_usuario_id", USUARIO_A).containsEntry("operacion_id", clave);
        assertThat(auditorias("CITA_RESERVAR", "EXITO", cita)).isEqualTo(1);
        assertThat(jdbc.sql("SELECT http_status FROM operacion WHERE clave = ?").params(clave).query(Integer.class)
                .single()).isEqualTo(201);
        assertThat(get(sesionA, "/api/v1/operaciones/" + clave)).hasStatusOk().bodyJson()
                .isLenientlyEqualTo("{\"tipo\":\"CITA_RESERVAR\",\"recursoId\":\"" + cita
                        + "\",\"estado\":\"COMPLETADA\",\"httpStatus\":201}");
        assertThat(get(sesionA, CITAS)).hasStatusOk().bodyJson().extractingPath("$[0].id").isEqualTo(cita.toString());

        esperarOyentes();
        assertThat(jdbc.sql("SELECT contenido FROM notificacion WHERE cita_id = ? AND tipo = 'CAMBIO' "
                + "AND ventana = 'CREADA' AND estado = 'ENVIADA_SIMULADA'").params(cita).query(String.class).single())
                .startsWith("Tu cita SP-2026-000001 de Medicina general quedó registrada para el miércoles 04/11/2026");
    }

    @Test
    @DisplayName("Repetir con la misma clave devuelve la misma cita; otra solicitud con la misma clave responde 409")
    void idempotencia() {
        UUID horario = escenario.horario(P1, MIERCOLES_9AM);
        UUID otroHorario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        UUID clave = UUID.randomUUID();

        MvcTestResult primera = reservar(sesionA, horario, "ESP-1", clave);
        reloj.fijar(AHORA.plus(Duration.ofMinutes(2)));
        MvcTestResult repetida = reservar(sesionA, horario, "ESP-1", clave);
        MvcTestResult otroContenido = reservar(sesionA, otroHorario, "ESP-1", clave);

        assertThat(primera).hasStatus(HttpStatus.CREATED);
        assertThat(repetida).hasStatus(HttpStatus.CREATED);
        assertThat(cuerpo(repetida)).isEqualTo(cuerpo(primera));
        esperarError(otroContenido, HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");
        assertThat(contar("SELECT count(*) FROM cita")).isEqualTo(1);
        assertThat(ocupanteDe(otroHorario)).isNull();
        // La misma clave usada por otro paciente tampoco crea nada.
        esperarError(reservar(login(EMAIL_B), horario, "ESP-1", clave), HttpStatus.CONFLICT, "IDEMPOTENCIA_CONFLICTO");
        assertThat(contar("SELECT count(*) FROM cita")).isEqualTo(1);
    }

    @RepeatedTest(3)
    @DisplayName("Dos pacientes reservan el mismo horario a la vez: uno 201 y el otro 409 HORARIO_NO_DISPONIBLE")
    void carreraPorElMismoHorario() throws Exception {
        UUID horario = escenario.horario(P1, MIERCOLES_9AM);
        MockHttpSession sesionB = login(EMAIL_B);

        List<MvcTestResult> resultados = simultaneas(
                () -> reservar(sesionA, horario, "ESP-1"),
                () -> reservar(sesionB, horario, "ESP-1"));

        List<Integer> estados = resultados.stream().map(r -> r.getResponse().getStatus()).toList();
        assertThat(estados).containsExactlyInAnyOrder(201, 409);
        MvcTestResult perdedora = resultados.get(estados.indexOf(409));
        assertThat((String) valor(perdedora, "$.codigo")).isEqualTo("HORARIO_NO_DISPONIBLE");
        assertThat(contar("SELECT count(*) FROM cita")).isEqualTo(1);
        assertThat(ocupanteDe(horario)).isEqualTo(jdbc.sql("SELECT id FROM cita").query(UUID.class).single());
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_RESERVAR' AND resultado = 'RECHAZO' "
                + "AND codigo = 'HORARIO_NO_DISPONIBLE'")).isEqualTo(1);
    }

    @Test
    @DisplayName("Con 5 citas activas responde 422 LIMITE_CITAS; al cancelar una vuelve a permitirse")
    void limiteDeCitasActivas() {
        UUID primera = null;
        for (int i = 1; i <= 5; i++) {
            UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofDays(i)));
            primera = primera == null ? cita : primera;
        }
        UUID horario = escenario.horario(P2, MIERCOLES_9AM);

        MvcTestResult sexta = reservar(sesionA, horario, "ESP-2");

        esperarError(sexta, HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        assertThat((String) valor(sexta, "$.detail")).isEqualTo("Ya tienes 5 citas activas (pendientes, confirmadas "
                + "o en curso), que es el máximo permitido. Para reservar otra, cancela alguna de tus próximas citas "
                + "o espera a que se complete una.");
        assertThat(ocupanteDe(horario)).isNull();
        assertThat(cancelar(sesionA, primera, 1, "CAN-PERSONAL")).hasStatusOk();
        assertThat(reservar(sesionA, horario, "ESP-2")).hasStatus(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("Una sola cita activa por especialidad y día local; otra especialidad u otro día sí se permiten")
    void unaPorEspecialidadYDia() {
        escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID mismoDia = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofHours(8)));
        UUID otraEspecialidad = escenario.horario(P2, MIERCOLES_9AM.plus(Duration.ofHours(2)));
        UUID otroDia = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));

        MvcTestResult rechazada = reservar(sesionA, mismoDia, "ESP-1");

        esperarError(rechazada, HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        assertThat((String) valor(rechazada, "$.detail"))
                .isEqualTo("Ya tienes una cita de Medicina general el 04/11/2026 a las 09:00. "
                        + "Solo se permite una cita por especialidad al día.");
        assertThat(reservar(sesionA, otraEspecialidad, "ESP-2")).hasStatus(HttpStatus.CREATED);
        assertThat(reservar(sesionA, otroDia, "ESP-1")).hasStatus(HttpStatus.CREATED);
    }

    @RepeatedTest(3)
    @DisplayName("Dos reservas simultáneas del mismo paciente no superan juntas el límite de 5 activas")
    void limiteConcurrente() throws Exception {
        for (int i = 1; i <= 4; i++) {
            escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofDays(i)));
        }
        UUID uno = escenario.horario(P2, MIERCOLES_9AM);
        UUID dos = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        MockHttpSession otraPestana = login(EMAIL_A);

        List<MvcTestResult> resultados = simultaneas(
                () -> reservar(sesionA, uno, "ESP-2"),
                () -> reservar(otraPestana, dos, "ESP-1"));

        assertThat(resultados.stream().map(r -> r.getResponse().getStatus()).toList())
                .containsExactlyInAnyOrder(201, 422);
        assertThat(resultados.stream().filter(r -> r.getResponse().getStatus() == 422)
                .map(r -> (String) valor(r, "$.detail")).toList())
                .singleElement().asString().startsWith("Ya tienes 5 citas activas");
        assertThat(contar("SELECT count(*) FROM cita WHERE paciente_id = ? AND estado = 'PENDIENTE'", PACIENTE_A))
                .isEqualTo(5);
    }

    @Test
    @DisplayName("La especialidad debe coincidir con la del profesional del horario (400 con el campo especialidadCodigo)")
    void especialidadIncorrecta() {
        UUID horarioCardiologia = escenario.horario(P2, MIERCOLES_9AM);

        MvcTestResult distinta = reservar(sesionA, horarioCardiologia, "ESP-1");
        MvcTestResult inexistente = reservar(sesionA, horarioCardiologia, "NO-EXISTE");
        MvcTestResult sinDatos = post(sesionA, CITAS, "{}");

        esperarError(distinta, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(distinta, "$.errores[*].campo")).containsExactly("especialidadCodigo");
        esperarError(inexistente, HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(sinDatos, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat((List<String>) valor(sinDatos, "$.errores[*].campo"))
                .containsExactlyInAnyOrder("horarioId", "especialidadCodigo");
        assertThat(ocupanteDe(horarioCardiologia)).isNull();
        assertThat(contar("SELECT count(*) FROM cita")).isZero();
        assertThat(contar("SELECT count(*) FROM operacion")).as("un 400 no se guarda como operación").isZero();
    }

    @Test
    @DisplayName("Un horario inexistente, pasado u ocupado responde 409 HORARIO_NO_DISPONIBLE")
    void horarioNoDisponible() {
        UUID pasado = escenario.horario(P1, AHORA.minus(Duration.ofMinutes(20)));
        UUID ocupado = horarioDe(escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM));

        esperarError(reservar(sesionA, UUID.randomUUID(), "ESP-1"), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        esperarError(reservar(sesionA, pasado, "ESP-1"), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        esperarError(reservar(sesionA, ocupado, "ESP-1"), HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        assertThat(contar("SELECT count(*) FROM cita WHERE paciente_id = ?", PACIENTE_A)).isZero();
    }

    @Test
    @DisplayName("Sin Idempotency-Key responde 400; el operador no puede reservar (403)")
    void proteccion() {
        UUID horario = escenario.horario(P1, MIERCOLES_9AM);

        MvcTestResult sinClave = mvc.post().uri(CITAS).session(sesionA).with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"horarioId\":\"" + horario + "\",\"especialidadCodigo\":\"ESP-1\"}").exchange();

        esperarError(sinClave, HttpStatus.BAD_REQUEST, "IDEMPOTENCY_KEY_REQUERIDA");
        esperarError(reservar(login(EMAIL_OPERADOR), horario, "ESP-1"), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        assertThat(ocupanteDe(horario)).isNull();
    }

    // ------------------------------------------------------------------
    // Sin solapamiento
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Una cita activa que se cruza con el horario responde 422 LIMITE_CITAS con la cita concreta")
    void sinSolapamiento() {
        escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM); // Medicina general, [09:00, 09:20) en Lima
        UUID cruzaInicio = escenario.horario(P2, MIERCOLES_9AM.minus(Duration.ofMinutes(10))); // [08:50, 09:10)
        UUID cruzaFin = escenario.horario(P2, MIERCOLES_9AM.plus(Duration.ofMinutes(10))); // [09:10, 09:30)
        UUID contiguo = escenario.horario(P2, MIERCOLES_9AM.plus(Duration.ofMinutes(20))); // [09:20, 09:40)

        MvcTestResult rechazada = reservar(sesionA, cruzaFin, "ESP-2");

        esperarError(rechazada, HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        assertThat((String) valor(rechazada, "$.detail")).isEqualTo(
                "Ya tienes una cita de Medicina general el 04/11/2026 a las 09:00 que se cruza con este horario.");
        esperarError(reservar(sesionA, cruzaInicio, "ESP-2"), HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        assertThat(ocupanteDe(cruzaFin)).isNull();
        assertThat(ocupanteDe(cruzaInicio)).isNull();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_RESERVAR' AND resultado = 'RECHAZO' "
                + "AND codigo = 'LIMITE_CITAS'")).isEqualTo(2);
        // Intervalos semiabiertos: la que empieza justo cuando termina la otra no se cruza.
        assertThat(reservar(sesionA, contiguo, "ESP-2")).hasStatus(HttpStatus.CREATED);
        // La cita de otro paciente a la misma hora no afecta.
        assertThat(reservar(login(EMAIL_B), cruzaFin, "ESP-2")).hasStatus(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("Solo cuentan las citas no terminales y su horario vigente: cancelada o reprogramada ya no se cruzan")
    void solapamientoSoloConCitasActivasYVigentes() {
        UUID cancelada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID reprogramada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        UUID nuevoHorario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)).plus(Duration.ofHours(3)));
        assertThat(cancelar(sesionA, cancelada, 1, "CAN-PERSONAL")).hasStatusOk();
        assertThat(reprogramar(sesionA, reprogramada, 1, nuevoHorario, "REP-DISPONIBILIDAD")).hasStatusOk();

        assertThat(reservar(sesionA, escenario.horario(P2, MIERCOLES_9AM), "ESP-2"))
                .as("a la hora de la cita cancelada").hasStatus(HttpStatus.CREATED);
        assertThat(reservar(sesionA, escenario.horario(P2, MIERCOLES_9AM.plus(Duration.ofDays(1))), "ESP-2"))
                .as("a la hora anterior de la cita reprogramada").hasStatus(HttpStatus.CREATED);
        MvcTestResult conLaVigente = reservar(sesionA,
                escenario.horario(P2, MIERCOLES_9AM.plus(Duration.ofDays(1)).plus(Duration.ofHours(3))), "ESP-2");
        esperarError(conLaVigente, HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        assertThat((String) valor(conLaVigente, "$.detail")).isEqualTo(
                "Ya tienes una cita de Medicina general el 05/11/2026 a las 12:00 que se cruza con este horario.");
    }

    @Test
    @DisplayName("Repetir una reserva rechazada por cruce con la misma clave devuelve el mismo 422")
    void rechazoPorCruceIdempotente() {
        escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID horario = escenario.horario(P2, MIERCOLES_9AM);
        UUID clave = UUID.randomUUID();

        MvcTestResult primera = reservar(sesionA, horario, "ESP-2", clave);
        MvcTestResult repetida = reservar(sesionA, horario, "ESP-2", clave);

        esperarError(primera, HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        esperarError(repetida, HttpStatus.UNPROCESSABLE_CONTENT, "LIMITE_CITAS");
        assertThat(get(sesionA, "/api/v1/operaciones/" + clave)).hasStatusOk().bodyJson()
                .isLenientlyEqualTo("{\"tipo\":\"CITA_RESERVAR\",\"estado\":\"RECHAZADA\",\"httpStatus\":422,"
                        + "\"codigoError\":\"LIMITE_CITAS\"}");
    }

    // ------------------------------------------------------------------
    // Anticipación mínima (sigasp.reglas.anticipacion-reserva = PT2H)
    // ------------------------------------------------------------------

    @Test
    @DisplayName("La disponibilidad no ofrece horarios que empiezan antes de ahora + 2 h; el de ahora + 2 h exacto, sí")
    void disponibilidadConAnticipacion() {
        UUID enUnaHora = escenario.horario(P1, AHORA.plus(Duration.ofHours(1)));
        UUID casiDosHoras = escenario.horario(P1, AHORA.plus(Duration.ofMinutes(119)));
        UUID dosHorasExactas = escenario.horario(P1, AHORA.plus(Duration.ofHours(2)));
        UUID tarde = escenario.horario(P1, AHORA.plus(Duration.ofHours(6)));

        MvcTestResult hoy = get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1&desde=2026-11-02&hasta=2026-11-02");

        assertThat((List<String>) valor(hoy, "$[*].horarioId"))
                .containsExactly(dosHorasExactas.toString(), tarde.toString())
                .doesNotContain(enUnaHora.toString(), casiDosHoras.toString());
        assertThat((List<String>) valor(get(sesionA, DISPONIBILIDAD + "?especialidad=ESP-1"), "$[*].horarioId"))
                .as("también en el rango por defecto").containsExactly(dosHorasExactas.toString(), tarde.toString());
    }

    @Test
    @DisplayName("Reservar un horario que empieza antes de ahora + 2 h responde 409 HORARIO_NO_DISPONIBLE")
    void reservaConAnticipacion() {
        UUID casiDosHoras = escenario.horario(P1, AHORA.plus(Duration.ofMinutes(119)));
        UUID dosHorasExactas = escenario.horario(P1, AHORA.plus(Duration.ofHours(2)));

        MvcTestResult rechazada = reservar(sesionA, casiDosHoras, "ESP-1");

        esperarError(rechazada, HttpStatus.CONFLICT, "HORARIO_NO_DISPONIBLE");
        assertThat((String) valor(rechazada, "$.detail")).isEqualTo("Las citas se reservan con al menos 2 horas de "
                + "anticipación. Elige un horario desde el 02/11/2026 a las 10:00.");
        assertThat(ocupanteDe(casiDosHoras)).isNull();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_RESERVAR' AND resultado = 'RECHAZO' "
                + "AND codigo = 'HORARIO_NO_DISPONIBLE'")).isEqualTo(1);
        assertThat(reservar(sesionA, dosHorasExactas, "ESP-1")).hasStatus(HttpStatus.CREATED);
    }

    @Test
    @DisplayName("Toda cita nueva recibe un código SP-AAAA-NNNNNN correlativo, la registre el paciente o el sistema")
    void codigosCorrelativos() {
        UUID registrada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MvcTestResult reservada = reservar(sesionA, escenario.horario(P2, MIERCOLES_9AM.plus(Duration.ofHours(1))),
                "ESP-2");
        reloj.fijar(Instant.parse("2027-01-02T15:00:00Z"));
        UUID delAnioSiguiente = escenario.cita(PACIENTE_A, P1, Instant.parse("2027-01-05T14:00:00Z"));

        assertThat(jdbc.sql("SELECT codigo FROM cita WHERE id = ?").params(registrada).query(String.class).single())
                .isEqualTo("SP-2026-000001");
        assertThat((String) valor(reservada, "$.codigo")).isEqualTo("SP-2026-000002");
        assertThat(jdbc.sql("SELECT codigo FROM cita WHERE id = ?").params(delAnioSiguiente).query(String.class)
                .single()).isEqualTo("SP-2027-000003");
    }
}
