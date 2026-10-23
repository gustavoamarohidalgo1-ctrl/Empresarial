package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.SEDE;

import java.sql.Timestamp;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * Integridad garantizada por la propia BD, no solo por el código: auditoría y línea de tiempo de
 * solo inserción (triggers), una única versión de agenda vigente por cita (restricción de
 * exclusión diferible) y unicidad de ocupación y llegada.
 */
@DisplayName("Integridad de la base de datos")
class IntegridadBaseDatosIntegracionTest extends PruebaApi {

    @Autowired
    private PlatformTransactionManager transacciones;

    private UUID cita;

    @BeforeEach
    void citaConfirmada() {
        cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        assertThat(confirmar(login(EMAIL_A), cita, 1)).hasStatusOk();
        assertThat(contar("SELECT count(*) FROM auditoria")).isGreaterThanOrEqualTo(2);
    }

    private void rechazadaPorTrigger(String sql) {
        assertThatThrownBy(() -> jdbc.sql(sql).update())
                .isInstanceOf(DataAccessException.class)
                .rootCause().hasMessageContaining("solo inser");
    }

    @Test
    @DisplayName("UPDATE y DELETE sobre auditoria fallan por el trigger y las filas no cambian")
    void auditoriaSoloInsercion() {
        long antes = contar("SELECT count(*) FROM auditoria");

        rechazadaPorTrigger("UPDATE auditoria SET accion = 'MANIPULADA'");
        rechazadaPorTrigger("DELETE FROM auditoria");

        assertThat(contar("SELECT count(*) FROM auditoria")).isEqualTo(antes);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'MANIPULADA'")).isZero();
    }

    @Test
    @DisplayName("UPDATE y DELETE sobre cita_evento fallan por el trigger y la línea de tiempo no cambia")
    void lineaTiempoSoloInsercion() {
        rechazadaPorTrigger("UPDATE cita_evento SET tipo = 'CANCELADA' WHERE tipo = 'CONFIRMADA'");
        rechazadaPorTrigger("DELETE FROM cita_evento WHERE tipo = 'CONFIRMADA'");

        assertThat(tiposEvento(cita)).containsExactly("CREADA", "CONFIRMADA");
    }

    @Test
    @DisplayName("Dos versiones vigentes de la misma cita: la exclusión diferible falla al confirmar la transacción")
    void unaSolaVersionVigente() {
        UUID horario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));
        AtomicBoolean insertada = new AtomicBoolean();

        assertThatThrownBy(() -> new TransactionTemplate(transacciones).executeWithoutResult(estado -> {
            jdbc.sql("INSERT INTO cita_version_agenda (id, cita_id, numero, horario_id, profesional_id, sede_id, "
                            + "inicio, fin, vigente_desde) VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)")
                    .params(UUID.randomUUID(), cita, horario, P1, SEDE,
                            Timestamp.from(MIERCOLES_9AM.plus(Duration.ofDays(1))),
                            Timestamp.from(MIERCOLES_9AM.plus(Duration.ofDays(1)).plus(Duration.ofMinutes(20))),
                            Timestamp.from(AHORA))
                    .update();
            // La violación todavía no aparece: la restricción es diferible.
            insertada.set(true);
        })).rootCause().hasMessageContaining("ex_version_vigente");

        assertThat(insertada).isTrue();
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ?", cita)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ? AND vigente_hasta IS NULL",
                cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Cerrar la vigente y abrir otra en la misma transacción sí es válido (lo que hace reprogramar)")
    void reemplazoDentroDeLaTransaccion() {
        UUID horario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));

        new TransactionTemplate(transacciones).executeWithoutResult(estado -> {
            jdbc.sql("INSERT INTO cita_version_agenda (id, cita_id, numero, horario_id, profesional_id, sede_id, "
                            + "inicio, fin, vigente_desde) VALUES (?, ?, 2, ?, ?, ?, ?, ?, ?)")
                    .params(UUID.randomUUID(), cita, horario, P1, SEDE,
                            Timestamp.from(MIERCOLES_9AM.plus(Duration.ofDays(1))),
                            Timestamp.from(MIERCOLES_9AM.plus(Duration.ofDays(1)).plus(Duration.ofMinutes(20))),
                            Timestamp.from(AHORA))
                    .update();
            jdbc.sql("UPDATE cita_version_agenda SET vigente_hasta = ? WHERE cita_id = ? AND numero = 1")
                    .params(Timestamp.from(AHORA), cita).update();
        });

        assertThat(contar("SELECT count(*) FROM cita_version_agenda WHERE cita_id = ? AND vigente_hasta IS NULL "
                + "AND numero = 2", cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una cita no puede ocupar dos horarios ni tener dos registros de llegada")
    void unicidadDeOcupacionYLlegada() {
        UUID otroHorario = escenario.horario(P1, MIERCOLES_9AM.plus(Duration.ofDays(1)));

        assertThatThrownBy(() -> jdbc.sql("UPDATE horario SET cita_id = ? WHERE id = ?").params(cita, otroHorario)
                .update()).isInstanceOf(DataAccessException.class);
        assertThat(ocupanteDe(otroHorario)).isNull();

        String insertarLlegada = "INSERT INTO registro_llegada (id, cita_id, version_agenda, registrado_en, "
                + "registrado_por, canal) VALUES (?, ?, 1, ?, ?, 'PACIENTE')";
        jdbc.sql(insertarLlegada).params(UUID.randomUUID(), cita, Timestamp.from(AHORA),
                pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A).update();
        assertThatThrownBy(() -> jdbc.sql(insertarLlegada).params(UUID.randomUUID(), cita, Timestamp.from(AHORA),
                pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A).update())
                .isInstanceOf(DataAccessException.class);
        assertThat(contar("SELECT count(*) FROM registro_llegada WHERE cita_id = ?", cita)).isEqualTo(1);
    }

    @Test
    @DisplayName("Una cita Cancelada exige motivo y una no cancelada no puede tenerlo")
    void motivoDeCancelacionCoherente() {
        assertThatThrownBy(() -> jdbc.sql("UPDATE cita SET estado = 'CANCELADA' WHERE id = ?").params(cita).update())
                .isInstanceOf(DataAccessException.class).rootCause()
                .hasMessageContaining("ck_cita_motivo_cancelacion");
        assertThatThrownBy(() -> jdbc.sql("UPDATE cita SET motivo_cancelacion = 'CAN-OTRO' WHERE id = ?")
                .params(cita).update()).isInstanceOf(DataAccessException.class);
        assertThat(estado(cita)).isEqualTo("CONFIRMADA");
    }
}
