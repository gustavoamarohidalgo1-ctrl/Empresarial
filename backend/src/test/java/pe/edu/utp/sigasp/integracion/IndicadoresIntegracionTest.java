package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.CLAVE;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_ADMIN;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.ESPECIALIDAD;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.ESPECIALIDAD_2;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P2;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.SEDE;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_OPERADOR;

import java.nio.charset.StandardCharsets;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.citas.aplicacion.CierreInasistencias;
import pe.edu.utp.sigasp.soporte.ContadorSentencias;
import pe.edu.utp.sigasp.soporte.ContadorSentencias.Medicion;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * PB20–PB24 · Indicadores reproducibles (apartado 13.5 y conjunto mínimo de 13.5.1) con la API y la
 * BD reales. El corte t es el instante de la consulta: cada prueba fija el reloj antes de consultar,
 * así que un corte histórico es simplemente un reloj en el pasado.
 */
@DisplayName("PB20–PB24 · Indicadores")
class IndicadoresIntegracionTest extends PruebaApi {

    static final String RESUMEN = "/api/v1/analitica/resumen";
    static final String RESUMEN_CSV = "/api/v1/analitica/resumen.csv";
    static final String EMAIL_RESPONSABLE = "responsable@ejemplo.invalid";
    static final UUID USUARIO_RESPONSABLE = UUID.fromString("00000000-0000-0000-0000-00000000ee01");
    static final ZoneId LIMA = ZoneId.of("America/Lima");
    /** Semana del lunes 02/11/2026 al domingo 08/11/2026 (fechas locales de Lima). */
    static final String SEMANA = "?desde=2026-11-02&hasta=2026-11-08";
    static final List<String> ESTADOS = List.of("PENDIENTE", "CONFIRMADA", "CHECK_IN", "EN_ESPERA", "EN_ATENCION",
            "COMPLETADA", "CANCELADA", "NO_ASISTIO");

    @Autowired
    private PasswordEncoder encoder;

    @Autowired
    private CierreInasistencias cierre;

    @BeforeEach
    void crearResponsable() {
        jdbc.sql("INSERT INTO usuario (id, email, password_hash, nombre_visible, rol, activo, paciente_id, creado_en) "
                        + "VALUES (?, ?, ?, 'Responsable Prueba', 'RESPONSABLE', TRUE, NULL, ?)")
                .params(USUARIO_RESPONSABLE, EMAIL_RESPONSABLE, encoder.encode(CLAVE), Timestamp.from(AHORA))
                .update();
    }

    // ------------------------------------------------------------------
    // 13.5.1 · Conjunto mínimo de comprobación
    // ------------------------------------------------------------------

    @Test
    @DisplayName("13.5.1: A completada y confirmada, B cancelada, C reprogramada sin reconfirmar y D No asistió")
    void conjuntoMinimo() {
        UUID a = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00"));
        UUID b = escenario.cita(PACIENTE_B, P1, lima("2026-11-04T11:00"));
        UUID c = escenario.cita(PACIENTE_A, P1, lima("2026-11-05T09:00"));
        UUID d = escenario.cita(PACIENTE_B, P1, lima("2026-11-04T10:00"));
        MockHttpSession pacienteA = login(EMAIL_A);
        MockHttpSession pacienteB = login(EMAIL_B);
        MockHttpSession operador = login(EMAIL_OPERADOR);

        ok(confirmar(pacienteA, a, 1));
        ok(cancelar(pacienteB, b, 1, "CAN-PERSONAL"));
        // C se confirma en su versión 1; la reprogramación la deja sin confirmación vigente.
        ok(confirmar(pacienteA, c, 1));
        en("2026-11-02T09:00", () -> reprogramar(pacienteA, c, 1,
                escenario.horario(P1, lima("2026-11-06T10:00")), "REP-DISPONIBILIDAD"));
        // A: llegada 08:50, atención 09:05 (espera de 15 min) y completada 09:25.
        en("2026-11-04T08:50", () -> llegada(pacienteA, a, 1));
        en("2026-11-04T08:55", () -> transicion(operador, a, "PASAR_A_ESPERA", versionCita(a)));
        en("2026-11-04T09:05", () -> transicion(operador, a, "INICIAR_ATENCION", versionCita(a)));
        en("2026-11-04T09:25", () -> transicion(operador, a, "COMPLETAR", versionCita(a)));
        // D: cierre automático a las 10:30.
        reloj.fijar(lima("2026-11-04T10:30"));
        assertThat(cierre.ejecutar()).isEqualTo(1);
        assertThat(estado(d)).isEqualTo("NO_ASISTIO");

        // Corte: miércoles 12:00. A y D vencidas no canceladas; C es futura (viernes).
        reloj.fijar(lima("2026-11-04T12:00"));
        MvcTestResult r = resumen(login(EMAIL_RESPONSABLE), SEMANA);

        assertThat(r).hasStatusOk();
        assertThat((String) valor(r, "$.periodo.desde")).isEqualTo("2026-11-02");
        assertThat((String) valor(r, "$.periodo.hasta")).isEqualTo("2026-11-08");
        assertThat((String) valor(r, "$.corte")).isEqualTo("2026-11-04T17:00:00Z");
        assertThat((String) valor(r, "$.zonaHoraria")).isEqualTo("America/Lima");
        assertThat(numero(r, "$.totalCitas")).isEqualTo(4);
        Map<String, Long> estados = porEstado(r);
        assertThat(estados.keySet()).containsExactlyElementsOf(ESTADOS);
        assertThat(estados).containsEntry("COMPLETADA", 1L).containsEntry("CANCELADA", 1L)
                .containsEntry("PENDIENTE", 1L).containsEntry("NO_ASISTIO", 1L).containsEntry("CONFIRMADA", 0L);
        assertThat(estados.values().stream().mapToLong(Long::longValue).sum()).isEqualTo(4);
        assertThat((String) valor(r, "$.porEstado[2].etiqueta")).isEqualTo("Llegada registrada");

        tasa(r, "confirmacion", 1, 4, 25.0);
        tasa(r, "cancelacion", 1, 4, 25.0);
        tasa(r, "reprogramacion", 1, 4, 25.0);
        assertThat(numero(r, "$.indicadores.reprogramacion.eventos")).isEqualTo(1);
        tasa(r, "inasistencia", 1, 2, 50.0);
        assertThat((Boolean) valor(r, "$.indicadores.inasistencia.provisional")).isFalse();
        assertThat(numero(r, "$.indicadores.inasistencia.pendientesDeClasificar")).isZero();
        assertThat((Double) valor(r, "$.indicadores.esperaPromedioMinutos.valor")).isEqualTo(15.0);
        assertThat(numero(r, "$.indicadores.esperaPromedioMinutos.observaciones")).isEqualTo(1);
        assertThat(numero(r, "$.indicadores.esperaPromedioMinutos.excluidas")).isZero();

        // porDia: los 7 días, sin huecos; el miércoles tiene A, B y D; el viernes, C.
        assertThat((List<String>) valor(r, "$.porDia[*].fecha")).containsExactly("2026-11-02", "2026-11-03",
                "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08");
        assertThat((Map<String, Object>) valor(r, "$.porDia[2]")).containsEntry("total", 3)
                .containsEntry("completadas", 1).containsEntry("canceladas", 1).containsEntry("noAsistio", 1);
        assertThat(numero(r, "$.porDia[3].total")).isZero();
        assertThat(numero(r, "$.porDia[4].total")).isEqualTo(1);
        assertThat((List<Object>) valor(r, "$.porEspecialidad")).hasSize(1);
        assertThat((Map<String, Object>) valor(r, "$.porEspecialidad[0]")).containsEntry("codigo", "ESP-1")
                .containsEntry("nombre", "Medicina general").containsEntry("total", 4)
                .containsEntry("tasaInasistencia", 50.0);
        // Sin datos personales ni identificadores de citas.
        assertThat(cuerpo(r)).doesNotContain("Ana", "Beto", "@", "SP-20", a.toString(), b.toString());
    }

    // ------------------------------------------------------------------
    // Corte histórico
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Corte histórico: un evento posterior a t no cuenta, y una cita creada después de t no existe")
    void corteHistorico() {
        UUID cita = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00")); // creada lunes 08:00
        MockHttpSession paciente = login(EMAIL_A);
        en("2026-11-02T10:00", () -> confirmar(paciente, cita, 1));
        en("2026-11-03T10:00", () -> cancelar(paciente, cita, 1, "CAN-LABORAL"));
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);

        reloj.fijar(lima("2026-11-02T07:59"));
        MvcTestResult antesDeCrear = resumen(responsable, SEMANA);
        assertThat(numero(antesDeCrear, "$.totalCitas")).isZero();
        assertThat((Object) valor(antesDeCrear, "$.indicadores.confirmacion.tasa")).isNull();

        reloj.fijar(lima("2026-11-02T09:00"));
        MvcTestResult pendiente = resumen(responsable, SEMANA);
        assertThat(porEstado(pendiente)).containsEntry("PENDIENTE", 1L).containsEntry("CANCELADA", 0L);
        tasa(pendiente, "confirmacion", 0, 1, 0.0);
        tasa(pendiente, "cancelacion", 0, 1, 0.0);

        reloj.fijar(lima("2026-11-02T12:00"));
        MvcTestResult confirmada = resumen(responsable, SEMANA);
        assertThat(porEstado(confirmada)).containsEntry("CONFIRMADA", 1L);
        tasa(confirmada, "confirmacion", 1, 1, 100.0);
        tasa(confirmada, "cancelacion", 0, 1, 0.0);

        reloj.fijar(lima("2026-11-03T12:00"));
        MvcTestResult cancelada = resumen(responsable, SEMANA);
        assertThat(porEstado(cancelada)).containsEntry("CANCELADA", 1L).containsEntry("CONFIRMADA", 0L);
        // Confirmación y cancelación no son excluyentes: la confirmación de la versión vigente se conserva.
        tasa(cancelada, "confirmacion", 1, 1, 100.0);
        tasa(cancelada, "cancelacion", 1, 1, 100.0);
        // Cancelada: no entra en E aunque su hora ya haya pasado.
        reloj.fijar(lima("2026-11-05T12:00"));
        tasa(resumen(responsable, SEMANA), "inasistencia", 0, 0, null);
    }

    @Test
    @DisplayName("Reprogramación entre periodos: la cita cuenta en el periodo de su versión vigente al corte")
    void reprogramacionEntrePeriodos() {
        UUID cita = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00"));
        MockHttpSession paciente = login(EMAIL_A);
        en("2026-11-03T10:00", () -> reprogramar(paciente, cita, 1,
                escenario.horario(P1, lima("2026-11-10T09:00")), "REP-LABORAL"));
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);
        String siguienteSemana = "?desde=2026-11-09&hasta=2026-11-15";

        // Antes de reprogramar: está en la primera semana y aún no cuenta como reprogramada.
        reloj.fijar(lima("2026-11-03T09:00"));
        MvcTestResult antes = resumen(responsable, SEMANA);
        tasa(antes, "reprogramacion", 0, 1, 0.0);
        assertThat(numero(antes, "$.porDia[2].total")).isEqualTo(1);
        assertThat(numero(resumen(responsable, siguienteSemana), "$.totalCitas")).isZero();

        // Después: sale de la primera semana y entra en la siguiente, una sola vez.
        reloj.fijar(lima("2026-11-03T12:00"));
        MvcTestResult primera = resumen(responsable, SEMANA);
        assertThat(numero(primera, "$.totalCitas")).isZero();
        tasa(primera, "reprogramacion", 0, 0, null);
        MvcTestResult segunda = resumen(responsable, siguienteSemana);
        assertThat(numero(segunda, "$.totalCitas")).isEqualTo(1);
        tasa(segunda, "reprogramacion", 1, 1, 100.0);
        assertThat(numero(segunda, "$.porDia[1].total")).isEqualTo(1);
        // Un periodo que abarca ambas semanas la cuenta una vez, aunque tenga dos versiones.
        assertThat(numero(resumen(responsable, "?desde=2026-11-02&hasta=2026-11-15"), "$.totalCitas"))
                .isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Filtros, denominador cero, inasistencia provisional y espera
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Los filtros por sede, especialidad y profesional afectan por igual numerador y denominador")
    void filtros() {
        UUID sede2 = UUID.randomUUID();
        jdbc.sql("INSERT INTO sede (id, codigo, nombre) VALUES (?, 'SEDE-2', 'Sede Norte')").params(sede2).update();
        UUID c1 = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00"));
        UUID c2 = escenario.cita(PACIENTE_B, P2, lima("2026-11-04T09:00"));
        UUID c3 = escenario.cita(PACIENTE_A, P2, lima("2026-11-04T10:00"));
        // c2 se atiende en la otra sede.
        jdbc.sql("UPDATE horario SET sede_id = ? WHERE cita_id = ?").params(sede2, c2).update();
        jdbc.sql("UPDATE cita_version_agenda SET sede_id = ? WHERE cita_id = ?").params(sede2, c2).update();
        ok(confirmar(login(EMAIL_A), c1, 1));
        ok(cancelar(login(EMAIL_B), c2, 1, "CAN-TRASLADO"));
        reloj.fijar(lima("2026-11-04T10:30"));
        assertThat(cierre.ejecutar()).isEqualTo(2); // c1 y c3
        reloj.fijar(lima("2026-11-04T12:00"));
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);

        MvcTestResult todas = resumen(responsable, SEMANA);
        assertThat(numero(todas, "$.totalCitas")).isEqualTo(3);
        tasa(todas, "confirmacion", 1, 3, 33.3);
        tasa(todas, "cancelacion", 1, 3, 33.3);
        tasa(todas, "inasistencia", 2, 2, 100.0);
        assertThat((Map<String, Object>) valor(todas, "$.filtros")).containsEntry("sede", null)
                .containsEntry("especialidad", null).containsEntry("profesional", null);
        assertThat((List<String>) valor(todas, "$.porEspecialidad[*].codigo")).containsExactly("ESP-2", "ESP-1");

        MvcTestResult cardio = resumen(responsable, SEMANA + "&especialidad=ESP-2");
        assertThat(numero(cardio, "$.totalCitas")).isEqualTo(2);
        tasa(cardio, "confirmacion", 0, 2, 0.0);
        tasa(cardio, "cancelacion", 1, 2, 50.0);
        tasa(cardio, "inasistencia", 1, 1, 100.0);
        assertThat((String) valor(cardio, "$.filtros.especialidad")).isEqualTo("ESP-2");
        assertThat((List<String>) valor(cardio, "$.porEspecialidad[*].codigo")).containsExactly("ESP-2");

        MvcTestResult profesional = resumen(responsable, SEMANA + "&profesional=P1");
        assertThat(numero(profesional, "$.totalCitas")).isEqualTo(1);
        tasa(profesional, "confirmacion", 1, 1, 100.0);
        tasa(profesional, "cancelacion", 0, 1, 0.0);
        tasa(profesional, "inasistencia", 1, 1, 100.0);

        MvcTestResult norte = resumen(responsable, SEMANA + "&sede=SEDE-2");
        assertThat(numero(norte, "$.totalCitas")).isEqualTo(1);
        tasa(norte, "cancelacion", 1, 1, 100.0);
        tasa(norte, "inasistencia", 0, 0, null);

        MvcTestResult combinados = resumen(responsable, SEMANA + "&sede=SEDE-T&especialidad=ESP-2&profesional=");
        assertThat(numero(combinados, "$.totalCitas")).isEqualTo(1);
        tasa(combinados, "cancelacion", 0, 1, 0.0);
        tasa(combinados, "inasistencia", 1, 1, 100.0);
        assertThat((Object) valor(combinados, "$.filtros.profesional")).isNull();

        MvcTestResult inexistente = resumen(responsable, SEMANA + "&especialidad=NO-EXISTE");
        assertThat(numero(inexistente, "$.totalCitas")).isZero();
        esperarError(resumen(responsable, SEMANA + "&sede=SEDE%3BDROP"), HttpStatus.BAD_REQUEST, "VALIDACION");
    }

    @Test
    @DisplayName("Denominador 0: las tasas y la espera son null (No calculable); porEstado y porDia completos")
    void denominadorCero() {
        escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00"));
        MvcTestResult r = resumen(login(EMAIL_RESPONSABLE), "?desde=2026-12-01&hasta=2026-12-31");

        assertThat(r).hasStatusOk();
        assertThat(numero(r, "$.totalCitas")).isZero();
        for (String indicador : List.of("confirmacion", "cancelacion", "reprogramacion", "inasistencia")) {
            tasa(r, indicador, 0, 0, null);
        }
        assertThat((Boolean) valor(r, "$.indicadores.inasistencia.provisional")).isFalse();
        assertThat((Object) valor(r, "$.indicadores.esperaPromedioMinutos.valor")).isNull();
        assertThat(numero(r, "$.indicadores.esperaPromedioMinutos.observaciones")).isZero();
        assertThat(porEstado(r).keySet()).containsExactlyElementsOf(ESTADOS);
        assertThat(porEstado(r).values()).containsOnly(0L);
        assertThat((List<Object>) valor(r, "$.porDia")).hasSize(31);
        assertThat((List<Object>) valor(r, "$.porEspecialidad")).isEmpty();
    }

    @Test
    @DisplayName("Inasistencia provisional: vencidas aún sin cerrar (Pendiente o Confirmada) quedan pendientes de clasificar")
    void inasistenciaProvisional() {
        UUID temprana = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T08:00"));
        escenario.cita(PACIENTE_B, P1, lima("2026-11-04T09:00"));
        UUID frontera = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:30"));
        escenario.cita(PACIENTE_B, P1, lima("2026-11-04T10:00"));
        ok(confirmar(login(EMAIL_A), frontera, 1));
        reloj.fijar(lima("2026-11-04T08:30"));
        assertThat(cierre.ejecutar()).isEqualTo(1);
        assertThat(estado(temprana)).isEqualTo("NO_ASISTIO");
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);

        // 10:00: vencen la de 08:00 (cerrada), la de 09:00 y la de 09:30 (frontera exacta, inicio + 30 = t),
        // ambas sin cerrar. La de 10:00 aún no vence.
        reloj.fijar(lima("2026-11-04T10:00"));
        MvcTestResult provisional = resumen(responsable, SEMANA);
        tasa(provisional, "inasistencia", 1, 3, 33.3);
        assertThat((Boolean) valor(provisional, "$.indicadores.inasistencia.provisional")).isTrue();
        assertThat(numero(provisional, "$.indicadores.inasistencia.pendientesDeClasificar")).isEqualTo(2);

        assertThat(cierre.ejecutar()).isEqualTo(2);
        MvcTestResult definitiva = resumen(responsable, SEMANA);
        tasa(definitiva, "inasistencia", 3, 3, 100.0);
        assertThat((Boolean) valor(definitiva, "$.indicadores.inasistencia.provisional")).isFalse();
        assertThat(numero(definitiva, "$.indicadores.inasistencia.pendientesDeClasificar")).isZero();
    }

    @Test
    @DisplayName("Espera: media de inicio de atención − llegada solo con pares válidos; informa observaciones y excluidas")
    void espera() {
        UUID e1 = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00"));
        UUID e2 = escenario.cita(PACIENTE_B, P1, lima("2026-11-04T09:20"));
        UUID e3 = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:40"));
        UUID e4 = escenario.cita(PACIENTE_B, P1, lima("2026-11-04T10:00"));
        MockHttpSession operador = login(EMAIL_OPERADOR);
        // e1: 20 min (08:40 → 09:00), completada.
        paso(operador, e1, "REGISTRAR_LLEGADA", "2026-11-04T08:40");
        paso(operador, e1, "PASAR_A_ESPERA", "2026-11-04T08:45");
        paso(operador, e1, "INICIAR_ATENCION", "2026-11-04T09:00");
        paso(operador, e1, "COMPLETAR", "2026-11-04T09:20");
        // e2: 10 min (09:00 → 09:10), sigue en atención.
        paso(operador, e2, "REGISTRAR_LLEGADA", "2026-11-04T09:00");
        paso(operador, e2, "PASAR_A_ESPERA", "2026-11-04T09:01");
        paso(operador, e2, "INICIAR_ATENCION", "2026-11-04T09:10");
        // e3: sigue esperando; no es observación ni exclusión.
        paso(operador, e3, "REGISTRAR_LLEGADA", "2026-11-04T09:30");
        paso(operador, e3, "PASAR_A_ESPERA", "2026-11-04T09:31");
        // e4: completada, pero su marca de llegada quedó posterior al inicio de atención (dato inconsistente).
        paso(operador, e4, "REGISTRAR_LLEGADA", "2026-11-04T09:00");
        paso(operador, e4, "PASAR_A_ESPERA", "2026-11-04T09:05");
        paso(operador, e4, "INICIAR_ATENCION", "2026-11-04T09:20");
        paso(operador, e4, "COMPLETAR", "2026-11-04T09:40");
        jdbc.sql("UPDATE registro_llegada SET registrado_en = ? WHERE cita_id = ?")
                .params(Timestamp.from(lima("2026-11-04T09:30")), e4).update();
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);

        reloj.fijar(lima("2026-11-04T11:00"));
        MvcTestResult r = resumen(responsable, SEMANA);
        assertThat((Double) valor(r, "$.indicadores.esperaPromedioMinutos.valor")).isEqualTo(15.0);
        assertThat(numero(r, "$.indicadores.esperaPromedioMinutos.observaciones")).isEqualTo(2);
        assertThat(numero(r, "$.indicadores.esperaPromedioMinutos.excluidas")).isEqualTo(1);
        // La cita excluida se conserva en la población y en su estado.
        assertThat(numero(r, "$.totalCitas")).isEqualTo(4);
        assertThat(porEstado(r)).containsEntry("COMPLETADA", 2L).containsEntry("EN_ATENCION", 1L)
                .containsEntry("EN_ESPERA", 1L);

        // Al corte de las 09:05 solo e1 había iniciado atención.
        reloj.fijar(lima("2026-11-04T09:05"));
        MvcTestResult temprano = resumen(responsable, SEMANA);
        assertThat((Double) valor(temprano, "$.indicadores.esperaPromedioMinutos.valor")).isEqualTo(20.0);
        assertThat(numero(temprano, "$.indicadores.esperaPromedioMinutos.observaciones")).isEqualTo(1);
        assertThat(numero(temprano, "$.indicadores.esperaPromedioMinutos.excluidas")).isZero();
    }

    // ------------------------------------------------------------------
    // Periodo, validaciones y CSV
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Sin fechas usa el mes en curso; rango de hasta 366 días; desde ≤ hasta")
    void periodoYValidaciones() {
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);

        MvcTestResult mes = resumen(responsable, "");
        assertThat((String) valor(mes, "$.periodo.desde")).isEqualTo("2026-11-01");
        assertThat((String) valor(mes, "$.periodo.hasta")).isEqualTo("2026-11-30");
        assertThat((List<Object>) valor(mes, "$.porDia")).hasSize(30);

        assertThat(resumen(responsable, "?desde=2026-01-01&hasta=2027-01-01")).hasStatusOk();
        esperarError(resumen(responsable, "?desde=2026-01-01&hasta=2027-01-02"), HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(resumen(responsable, "?desde=2026-11-09&hasta=2026-11-08"), HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(resumen(responsable, "?desde=09/11/2026"), HttpStatus.BAD_REQUEST, "VALIDACION");
        esperarError(get(responsable, RESUMEN_CSV + "?desde=2026-11-09&hasta=2026-11-08"), HttpStatus.BAD_REQUEST,
                "VALIDACION");
    }

    @Test
    @DisplayName("CSV: UTF-8 con BOM, separador «;», cabecera con periodo, corte y filtros, y sin datos personales")
    void csv() {
        UUID a = escenario.cita(PACIENTE_A, P1, lima("2026-11-04T09:00"));
        escenario.cita(PACIENTE_B, P1, lima("2026-11-05T09:00"));
        ok(confirmar(login(EMAIL_A), a, 1));
        reloj.fijar(lima("2026-11-04T12:00"));
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);

        MvcTestResult r = get(responsable, RESUMEN_CSV + SEMANA + "&especialidad=ESP-1");

        assertThat(r).hasStatusOk();
        assertThat(r.getResponse().getContentType()).isEqualTo("text/csv;charset=UTF-8");
        assertThat(r.getResponse().getHeader(HttpHeaders.CONTENT_DISPOSITION))
                .isEqualTo("attachment; filename=\"indicadores-2026-11-02_2026-11-08.csv\"");
        byte[] bytes = r.getResponse().getContentAsByteArray();
        assertThat(Arrays.copyOf(bytes, 3)).containsExactly(0xEF, 0xBB, 0xBF);
        String texto = new String(bytes, 3, bytes.length - 3, StandardCharsets.UTF_8);
        List<String> lineas = texto.lines().toList();
        assertThat(texto).contains("\r\n");
        assertThat(lineas.getFirst()).startsWith("Indicadores operativos SIGA-SP;Periodo;2026-11-02 a 2026-11-08;")
                .contains(";Corte;2026-11-04 12:00:00 (America/Lima);Corte UTC;2026-11-04T17:00:00Z;")
                .contains(";Sede;Todas;Especialidad;ESP-1;Profesional;Todos");
        assertThat(lineas).contains("Indicador;Numerador;Denominador;Tasa (%);Nota",
                "Confirmación;1;2;50.0;Confirmada para la versión de agenda vigente al corte",
                "Cancelación;0;2;0.0;Estado Cancelada al corte",
                "Reprogramación;0;2;0.0;Eventos de reprogramación: 0",
                "Inasistencia;0;1;0.0;Provisional: 1 cita(s) pendientes de clasificar",
                "Espera promedio (min);Observaciones válidas;Excluidas",
                "No calculable;0;0",
                "Estado;Citas", "Pendiente;1", "Confirmada;1", "Llegada registrada;0", "No asistió;0", "Total;2",
                "Fecha;Citas;Completadas;Canceladas;No asistió", "2026-11-04;1;0;0;0", "2026-11-08;0;0;0;0",
                "Especialidad;Código;Citas;Tasa de inasistencia (%)", "Medicina general;ESP-1;2;0.0");
        assertThat(texto).doesNotContain("Ana", "Beto", "@", "SP-20", "+51", a.toString());
        // Cada exportación queda en la bitácora, con el periodo y los filtros (no el contenido).
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'INDICADORES_EXPORTAR' AND resultado = 'EXITO' "
                + "AND actor_usuario_id = ? AND detalle ->> 'especialidad' = 'ESP-1' "
                + "AND detalle ->> 'desde' = '2026-11-02'", USUARIO_RESPONSABLE)).isEqualTo(1);
    }

    // ------------------------------------------------------------------
    // Autorización
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Autorización: RESPONSABLE y ADMINISTRADOR consultan y exportan; PACIENTE y OPERADOR, 403; sin sesión, 401")
    void autorizacionPorRol() {
        for (String email : List.of(EMAIL_RESPONSABLE, EMAIL_ADMIN)) {
            MockHttpSession sesion = login(email);
            assertThat(get(sesion, RESUMEN + SEMANA)).as(email).hasStatusOk();
            assertThat(get(sesion, RESUMEN_CSV + SEMANA)).as(email).hasStatusOk();
        }
        for (String email : List.of(EMAIL_A, EMAIL_OPERADOR)) {
            MockHttpSession sesion = login(email);
            esperarError(get(sesion, RESUMEN + SEMANA), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
            esperarError(get(sesion, RESUMEN_CSV + SEMANA), HttpStatus.FORBIDDEN, "ACCESO_DENEGADO");
        }
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'ACCESO_RUTA' AND resultado = 'DENEGADO' "
                + "AND actor_usuario_id = ?", USUARIO_OPERADOR)).isEqualTo(2);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'INDICADORES_EXPORTAR'")).isEqualTo(2);
        esperarError(mvc.get().uri(RESUMEN).exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
        esperarError(mvc.get().uri(RESUMEN_CSV).exchange(), HttpStatus.UNAUTHORIZED, "NO_AUTENTICADO");
    }

    // ------------------------------------------------------------------
    // Rendimiento
    // ------------------------------------------------------------------

    @Test
    @DisplayName("Rendimiento: 1000 citas se resumen con las mismas sentencias SQL que 0, en menos de 2 s")
    void milCitas() {
        MockHttpSession responsable = login(EMAIL_RESPONSABLE);
        reloj.fijar(lima("2026-11-09T12:00"));
        Medicion<MvcTestResult> vacio = ContadorSentencias.medir(() -> resumen(responsable, SEMANA));
        assertThat(numero(vacio.valor(), "$.totalCitas")).isZero();

        cargarCitasMasivas(1000);
        resumen(responsable, SEMANA); // calentamiento
        long inicio = System.nanoTime();
        Medicion<MvcTestResult> lleno = ContadorSentencias.medir(() -> resumen(responsable, SEMANA));
        long milisegundos = (System.nanoTime() - inicio) / 1_000_000;

        MvcTestResult r = lleno.valor();
        assertThat(numero(r, "$.totalCitas")).isEqualTo(1000);
        assertThat(porEstado(r)).containsEntry("PENDIENTE", 250L).containsEntry("CONFIRMADA", 250L)
                .containsEntry("COMPLETADA", 250L).containsEntry("NO_ASISTIO", 250L);
        tasa(r, "confirmacion", 250, 1000, 25.0);
        tasa(r, "inasistencia", 250, 1000, 25.0);
        assertThat(numero(r, "$.indicadores.inasistencia.pendientesDeClasificar")).isEqualTo(500);
        assertThat((Double) valor(r, "$.indicadores.esperaPromedioMinutos.valor")).isEqualTo(15.0);
        assertThat(numero(r, "$.indicadores.esperaPromedioMinutos.observaciones")).isEqualTo(250);
        assertThat(lleno.total()).as("sentencias con 1000 citas:%s", lleno.detalle())
                .isEqualTo(vacio.total()).isLessThanOrEqualTo(4);
        assertThat(milisegundos).as("milisegundos con 1000 citas").isLessThan(2000);
    }

    // ------------------------------------------------------------------
    // Apoyo
    // ------------------------------------------------------------------

    static Instant lima(String fechaHoraLocal) {
        return LocalDateTime.parse(fechaHoraLocal).atZone(LIMA).toInstant();
    }

    private MvcTestResult resumen(MockHttpSession sesion, String consulta) {
        return get(sesion, RESUMEN + consulta);
    }

    /** Ejecuta la acción con el reloj en esa hora local y exige 200. */
    private void en(String horaLocal, Supplier<MvcTestResult> accion) {
        reloj.fijar(lima(horaLocal));
        ok(accion.get());
    }

    private void paso(MockHttpSession operador, UUID cita, String accion, String horaLocal) {
        en(horaLocal, () -> transicion(operador, cita, accion, versionCita(cita)));
    }

    private static void ok(MvcTestResult resultado) {
        assertThat(resultado).as(cuerpo(resultado)).hasStatusOk();
    }

    private static void tasa(MvcTestResult r, String indicador, long numerador, long denominador, Double tasa) {
        String base = "$.indicadores." + indicador;
        assertThat(numero(r, base + ".numerador")).as(indicador + ".numerador").isEqualTo(numerador);
        assertThat(numero(r, base + ".denominador")).as(indicador + ".denominador").isEqualTo(denominador);
        Object valor = valor(r, base + ".tasa");
        if (tasa == null) {
            assertThat(valor).as(indicador + ".tasa").isNull();
        } else {
            assertThat(((Number) valor).doubleValue()).as(indicador + ".tasa").isEqualTo(tasa);
        }
    }

    private static Map<String, Long> porEstado(MvcTestResult r) {
        List<Map<String, Object>> filas = valor(r, "$.porEstado");
        Map<String, Long> conteos = new LinkedHashMap<>();
        for (Map<String, Object> fila : filas) {
            conteos.put((String) fila.get("estado"), ((Number) fila.get("total")).longValue());
        }
        return conteos;
    }

    /**
     * Inserta citas directamente en SQL (sin el dominio), repartidas en la semana: un cuarto Pendiente,
     * un cuarto Confirmada, un cuarto Completada (espera de 15 min) y un cuarto No asistió.
     */
    private void cargarCitasMasivas(int cantidad) {
        Map<String, Object> p = new HashMap<>();
        p.put("cantidad", cantidad);
        p.put("pa", PACIENTE_A);
        p.put("pb", PACIENTE_B);
        p.put("e1", ESPECIALIDAD);
        p.put("e2", ESPECIALIDAD_2);
        p.put("p1", P1);
        p.put("p2", P2);
        p.put("sede", SEDE);
        p.put("operador", USUARIO_OPERADOR);
        p.put("creada", lima("2026-10-26T08:00").atOffset(java.time.ZoneOffset.UTC));
        p.put("base", lima("2026-11-02T08:00").atOffset(java.time.ZoneOffset.UTC));
        jdbc.sql("""
                INSERT INTO cita (id, codigo, paciente_id, especialidad_id, estado, version_agenda_vigente,
                                  siguiente_secuencia, creado_en, actualizado_en)
                SELECT md5('cita-' || n)::uuid, 'MAS' || lpad(n::text, 6, '0'),
                       CASE WHEN n % 2 = 0 THEN :pa ELSE :pb END,
                       CASE WHEN n % 3 = 0 THEN :e2 ELSE :e1 END,
                       (ARRAY['PENDIENTE', 'CONFIRMADA', 'COMPLETADA', 'NO_ASISTIO'])[n % 4 + 1],
                       1, 10, CAST(:creada AS timestamptz), CAST(:creada AS timestamptz)
                FROM generate_series(1, :cantidad) n
                """).params(p).update();
        jdbc.sql("""
                INSERT INTO cita_version_agenda (id, cita_id, numero, horario_id, profesional_id, sede_id, inicio, fin,
                                                 vigente_desde, vigente_hasta)
                SELECT md5('version-' || n)::uuid, md5('cita-' || n)::uuid, 1, NULL,
                       CASE WHEN n % 3 = 0 THEN :p2 ELSE :p1 END, :sede,
                       CAST(:base AS timestamptz) + (n % 7) * INTERVAL '1 day' + (n % 30) * INTERVAL '20 minutes',
                       CAST(:base AS timestamptz) + (n % 7) * INTERVAL '1 day' + (n % 30) * INTERVAL '20 minutes' + INTERVAL '20 minutes',
                       CAST(:creada AS timestamptz), NULL
                FROM generate_series(1, :cantidad) n
                """).params(p).update();
        // CREADA para todas; luego el recorrido según el estado (secuencias consecutivas por cita).
        jdbc.sql("""
                INSERT INTO cita_evento (id, cita_id, secuencia, tipo, version_agenda, estado_anterior, estado_nuevo,
                                         actor_tipo, ocurrido_en)
                SELECT gen_random_uuid(), md5('cita-' || n)::uuid, paso.secuencia, paso.tipo, 1, paso.anterior,
                       paso.nuevo, 'SISTEMA', CASE WHEN paso.minutos IS NULL THEN CAST(:creada AS timestamptz) ELSE v.inicio + paso.minutos * INTERVAL '1 minute' END
                FROM generate_series(1, :cantidad) n
                JOIN cita_version_agenda v ON v.cita_id = md5('cita-' || n)::uuid
                JOIN (VALUES
                        (0, 1, 'CREADA', NULL, 'PENDIENTE', NULL),
                        (1, 1, 'CREADA', NULL, 'PENDIENTE', NULL),
                        (1, 2, 'CONFIRMADA', 'PENDIENTE', 'CONFIRMADA', -1440),
                        (2, 1, 'CREADA', NULL, 'PENDIENTE', NULL),
                        (2, 2, 'LLEGADA_REGISTRADA', 'PENDIENTE', 'CHECK_IN', -10),
                        (2, 3, 'EN_ESPERA', 'CHECK_IN', 'EN_ESPERA', -8),
                        (2, 4, 'EN_ATENCION', 'EN_ESPERA', 'EN_ATENCION', 5),
                        (2, 5, 'COMPLETADA', 'EN_ATENCION', 'COMPLETADA', 25),
                        (3, 1, 'CREADA', NULL, 'PENDIENTE', NULL),
                        (3, 2, 'NO_ASISTIO', 'PENDIENTE', 'NO_ASISTIO', 30))
                     AS paso (resto, secuencia, tipo, anterior, nuevo, minutos) ON paso.resto = n % 4
                """).params(p).update();
        jdbc.sql("""
                INSERT INTO registro_llegada (id, cita_id, version_agenda, registrado_en, registrado_por, canal)
                SELECT gen_random_uuid(), v.cita_id, 1, v.inicio - INTERVAL '10 minutes', :operador, 'OPERADOR'
                FROM generate_series(1, :cantidad) n
                JOIN cita_version_agenda v ON v.cita_id = md5('cita-' || n)::uuid
                WHERE n % 4 = 2
                """).params(p).update();
    }
}
