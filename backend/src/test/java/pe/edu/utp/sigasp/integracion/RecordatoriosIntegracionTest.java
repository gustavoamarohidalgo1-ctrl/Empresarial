package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockHttpSession;

import pe.edu.utp.sigasp.notificaciones.Notificaciones;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S2-R07 · Recordatorios simulados: uno por cita y versión de agenda dentro de las 24 h previas,
 * sin duplicados al reprocesar, nunca para citas canceladas, e invalidados al reprogramar.
 */
@DisplayName("S2-R07 · Recordatorios")
class RecordatoriosIntegracionTest extends PruebaApi {

    /** Martes 03/11/2026 10:00 en Lima: 23 h antes de MIERCOLES_9AM. */
    private static final Instant MARTES_10AM = Instant.parse("2026-11-03T15:00:00Z");
    private static final Instant JUEVES_9AM = Instant.parse("2026-11-05T14:00:00Z");

    @Autowired
    private Notificaciones notificaciones;

    private long recordatorios(UUID cita) {
        return contar("SELECT count(*) FROM notificacion WHERE cita_id = ? AND tipo = 'RECORDATORIO'", cita);
    }

    private void recordatorioPendienteManual(UUID cita, int version, Instant inicio) {
        jdbc.sql("INSERT INTO notificacion (id, cita_id, version_agenda, tipo, ventana, estado, canal, contenido, "
                        + "programada_para, creada_en) VALUES (?, ?, ?, 'RECORDATORIO', '24H', 'PENDIENTE', 'SIMULADO', "
                        + "'Recordatorio pendiente de prueba', ?, ?)")
                .params(UUID.randomUUID(), cita, version, Timestamp.from(inicio.minus(Duration.ofHours(24))),
                        Timestamp.from(reloj.instant()))
                .update();
    }

    @Test
    @DisplayName("Fuera de las 24 h no se genera; dentro se genera uno solo aunque el proceso corra dos veces")
    void unSoloRecordatorio() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);

        assertThat(notificaciones.generarRecordatorios()).isZero();
        assertThat(recordatorios(cita)).isZero();

        reloj.fijar(MARTES_10AM);
        assertThat(notificaciones.generarRecordatorios()).isEqualTo(1);
        assertThat(notificaciones.generarRecordatorios()).isZero();

        Map<String, Object> fila = jdbc.sql("SELECT version_agenda, ventana, estado, canal, contenido, programada_para "
                + "FROM notificacion WHERE cita_id = ? AND tipo = 'RECORDATORIO'").params(cita).query().singleRow();
        assertThat(fila).containsEntry("version_agenda", 1).containsEntry("ventana", "24H")
                .containsEntry("estado", "ENVIADA_SIMULADA").containsEntry("canal", "SIMULADO");
        assertThat(((Timestamp) fila.get("programada_para")).toInstant())
                .isEqualTo(MIERCOLES_9AM.minus(Duration.ofHours(24)));
        assertThat((String) fila.get("contenido")).isEqualTo("Tienes la cita SP-2026-000001 de Medicina general "
                + "mañana, miércoles 04/11/2026, a las 09:00 en Sede de prueba, con Profesional P1. Te recomendamos "
                + "llegar con anticipación y registrar tu llegada al ingresar.")
                .doesNotContain("Ana", PACIENTE_A.toString());
    }

    @Test
    @DisplayName("Una cita cancelada no genera recordatorio y uno pendiente previo queda INVALIDADO")
    void canceladaSinRecordatorio() {
        UUID cancelada = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        // 14:30Z, dentro de [MARTES_10AM, MARTES_10AM + 24 h): el límite superior es exclusivo.
        UUID vigente = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM.plus(Duration.ofMinutes(30)));
        recordatorioPendienteManual(cancelada, 1, MIERCOLES_9AM);
        assertThat(cancelar(login(EMAIL_A), cancelada, 1, "CAN-PERSONAL")).hasStatusOk();
        esperarOyentes();

        assertThat(contar("SELECT count(*) FROM notificacion WHERE cita_id = ? AND tipo = 'RECORDATORIO' "
                + "AND estado = 'INVALIDADA' AND procesada_en IS NOT NULL", cancelada)).isEqualTo(1);

        reloj.fijar(MARTES_10AM);
        assertThat(notificaciones.generarRecordatorios()).isEqualTo(1);
        assertThat(recordatorios(cancelada)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM notificacion WHERE cita_id = ? AND tipo = 'RECORDATORIO' "
                + "AND estado <> 'INVALIDADA'", cancelada)).isZero();
        assertThat(recordatorios(vigente)).isEqualTo(1);
    }

    @Test
    @DisplayName("Al reprogramar, el recordatorio pendiente de la versión anterior se invalida y la nueva recibe el suyo")
    void reprogramarInvalidaYGeneraNuevo() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID nuevo = escenario.horario(P1, JUEVES_9AM);
        recordatorioPendienteManual(cita, 1, MIERCOLES_9AM);

        assertThat(reprogramar(login(EMAIL_A), cita, 1, nuevo, "REP-DISPONIBILIDAD")).hasStatusOk();
        esperarOyentes();

        assertThat(jdbc.sql("SELECT estado FROM notificacion WHERE cita_id = ? AND tipo = 'RECORDATORIO' "
                + "AND version_agenda = 1").params(cita).query(String.class).single()).isEqualTo("INVALIDADA");

        // A 23 h de la hora anterior ya no corresponde recordatorio (la cita se movió al jueves).
        reloj.fijar(MARTES_10AM);
        assertThat(notificaciones.generarRecordatorios()).isZero();

        reloj.fijar(JUEVES_9AM.minus(Duration.ofHours(23)));
        assertThat(notificaciones.generarRecordatorios()).isEqualTo(1);
        assertThat(notificaciones.generarRecordatorios()).isZero();
        assertThat(jdbc.sql("SELECT estado FROM notificacion WHERE cita_id = ? AND tipo = 'RECORDATORIO' "
                + "AND version_agenda = 2").params(cita).query(String.class).single()).isEqualTo("ENVIADA_SIMULADA");
        assertThat(recordatorios(cita)).isEqualTo(2);
    }

    @Test
    @DisplayName("Una cita con la llegada ya registrada no genera recordatorio")
    void conLlegadaSinRecordatorio() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        reloj.fijar(MIERCOLES_9AM.minus(Duration.ofMinutes(30)));
        assertThat(llegada(login(EMAIL_A), cita, 1)).hasStatusOk();

        assertThat(notificaciones.generarRecordatorios()).isZero();
        assertThat(recordatorios(cita)).isZero();
    }
}
