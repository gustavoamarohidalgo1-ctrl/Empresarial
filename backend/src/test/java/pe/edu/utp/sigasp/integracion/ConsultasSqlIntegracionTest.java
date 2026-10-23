package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.ContadorSentencias;
import pe.edu.utp.sigasp.soporte.ContadorSentencias.Medicion;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Rendimiento de las lecturas: el número de sentencias SQL de cada consulta de la API no crece
 * con el número de citas (sin N+1). Se cuentan todas las sentencias del hilo de la solicitud,
 * tanto de Hibernate como de JDBC ({@link ContadorSentencias}).
 */
@DisplayName("Rendimiento · sentencias SQL por consulta (sin N+1)")
class ConsultasSqlIntegracionTest extends PruebaApi {

    /** Miércoles 04/11/2026, 08:00 en Lima: primera cita del día. */
    private static final Instant MIERCOLES_8AM = Instant.parse("2026-11-04T13:00:00Z");
    /** 08:10 en Lima: dentro de la ventana de llegada de las citas de 08:00 a 09:00. */
    private static final Instant MIERCOLES_810 = MIERCOLES_8AM.plus(Duration.ofMinutes(10));

    /** Modelo de lectura + citas con su llegada + versiones (lote) + eventos (lote). */
    private static final int TOPE_PANEL_OPERADOR = 4;
    /** Solo el modelo de lectura. */
    private static final int TOPE_LISTA_PACIENTE = 1;
    /** Cita con su llegada + modelo de lectura + versiones + eventos + pre-check-ins. */
    private static final int TOPE_DETALLE_PACIENTE = 5;
    /** Cita con su llegada + eventos + cada motivo distinto (aquí, uno). */
    private static final int TOPE_LINEA_TIEMPO = 3;

    private int siguiente;

    @Test
    @DisplayName("Panel del operador: las mismas sentencias con 4 citas que con 20, y no más de 4")
    void panelOperadorSinNMasUno() {
        // Cuatro citas avanzadas por el operador: Check-in, En espera, En atención y Completada.
        List<UUID> avanzadas = citasDelDia(4);
        reloj.fijar(MIERCOLES_810);
        MockHttpSession operador = login(EMAIL_OPERADOR);
        String[] recorrido = {"REGISTRAR_LLEGADA", "PASAR_A_ESPERA", "INICIAR_ATENCION", "COMPLETAR"};
        for (int i = 0; i < avanzadas.size(); i++) {
            for (int paso = 0; paso <= i; paso++) {
                UUID cita = avanzadas.get(i);
                assertThat(transicion(operador, cita, recorrido[paso], versionCita(cita))).hasStatusOk();
            }
        }
        Medicion<MvcTestResult> conCuatro = panel(operador);
        assertThat(conCuatro.valor()).hasStatusOk().bodyJson().extractingPath("$[*].estado").asArray()
                .containsExactly("CHECK_IN", "EN_ESPERA", "EN_ATENCION", "COMPLETADA");

        // Dieciséis más, pendientes y confirmadas por el paciente.
        List<UUID> nuevas = citasDelDia(16);
        MockHttpSession pacienteA = login(EMAIL_A);
        for (int i = 0; i < nuevas.size(); i += 4) {
            assertThat(confirmar(pacienteA, nuevas.get(i), 1)).hasStatusOk();
        }
        Medicion<MvcTestResult> conVeinte = panel(operador);

        assertThat(conVeinte.valor()).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(20);
        assertThat(conVeinte.total()).as("sentencias con 20 citas:%s", conVeinte.detalle())
                .isEqualTo(conCuatro.total())
                .isLessThanOrEqualTo(TOPE_PANEL_OPERADOR);
    }

    @Test
    @DisplayName("Mis citas del paciente: una sola sentencia, con 1 cita o con 15")
    void listaPacienteConstante() {
        citasDelDia(1);
        MockHttpSession sesion = login(EMAIL_A);
        Medicion<MvcTestResult> conUna = ContadorSentencias.medir(() -> get(sesion, CITAS));
        citasDelDia(28); // la mitad son de A
        Medicion<MvcTestResult> conQuince = ContadorSentencias.medir(() -> get(sesion, CITAS));

        assertThat(conQuince.valor()).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(15);
        assertThat(conQuince.total()).as("sentencias:%s", conQuince.detalle())
                .isEqualTo(conUna.total())
                .isLessThanOrEqualTo(TOPE_LISTA_PACIENTE);
    }

    @Test
    @DisplayName("Detalle y línea de tiempo: acotados aunque la cita tenga historial (reprogramada, pre-check-in)")
    void detallePacienteAcotado() {
        UUID nueva = citasDelDia(1).getFirst();
        UUID conHistorial = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        MockHttpSession sesion = login(EMAIL_A);
        for (int i = 1; i <= 3; i++) {
            UUID horario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)).plus(Duration.ofHours(i)));
            assertThat(confirmar(sesion, conHistorial, i)).hasStatusOk();
            assertThat(reprogramar(sesion, conHistorial, i, horario, "REP-LABORAL")).hasStatusOk();
        }
        assertThat(preCheckIn(sesion, conHistorial, 4, true)).hasStatusOk();

        Medicion<MvcTestResult> simple = ContadorSentencias.medir(() -> detalle(sesion, nueva));
        Medicion<MvcTestResult> compleja = ContadorSentencias.medir(() -> detalle(sesion, conHistorial));
        Medicion<MvcTestResult> linea = ContadorSentencias.medir(
                () -> get(sesion, CITAS + "/" + conHistorial + "/linea-tiempo"));

        assertThat(compleja.valor()).hasStatusOk().bodyJson().extractingPath("$.versionAgenda").isEqualTo(4);
        assertThat(compleja.total()).as("sentencias del detalle:%s", compleja.detalle())
                .isEqualTo(simple.total())
                .isLessThanOrEqualTo(TOPE_DETALLE_PACIENTE);
        assertThat(linea.valor()).hasStatusOk().bodyJson().extractingPath("$.length()").isEqualTo(8);
        assertThat(linea.total()).as("sentencias de la línea de tiempo:%s", linea.detalle())
                .isLessThanOrEqualTo(TOPE_LINEA_TIEMPO);
    }

    private Medicion<MvcTestResult> panel(MockHttpSession operador) {
        return ContadorSentencias.medir(() -> get(operador, OPERADOR + "?fecha=2026-11-04"));
    }

    /** Citas de P1 cada 20 minutos desde las 08:00 del miércoles, alternando pacientes A y B. */
    private List<UUID> citasDelDia(int cantidad) {
        List<UUID> citas = new ArrayList<>();
        for (int i = 0; i < cantidad; i++, siguiente++) {
            citas.add(escenario.cita(siguiente % 2 == 0 ? PACIENTE_A : PACIENTE_B, P1,
                    MIERCOLES_8AM.plus(Duration.ofMinutes(20L * siguiente))));
        }
        return citas;
    }
}
