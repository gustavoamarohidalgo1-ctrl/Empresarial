package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_B;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/**
 * S1-R02 · Un paciente no puede consultar citas de otro: la respuesta es la misma que para una
 * cita inexistente (no revela que existe) y el intento queda auditado como acceso denegado.
 */
@DisplayName("S1-R02 · Consulta de una cita ajena")
class AccesoCitaAjenaIntegracionTest extends PruebaApi {

    private UUID citaA;
    private UUID citaB;
    private MockHttpSession sesionA;

    @BeforeEach
    void citas() {
        citaA = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        citaB = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM.plus(Duration.ofHours(1)));
        sesionA = login(EMAIL_A);
    }

    private long denegados(UUID cita) {
        return contar("SELECT count(*) FROM auditoria WHERE accion = 'CITA_ACCESO' AND resultado = 'DENEGADO' "
                + "AND codigo = 'CITA_NO_ENCONTRADA' AND entidad_id = ? AND actor_usuario_id = ?",
                cita.toString(), USUARIO_A);
    }

    @Test
    @DisplayName("A pide el detalle de la cita de B: 404 CITA_NO_ENCONTRADA sin datos de B y auditoría DENEGADO")
    void detalleDeCitaAjena() {
        MvcTestResult resultado = detalle(sesionA, citaB);

        esperarError(resultado, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA");
        assertThat(cuerpo(resultado)).doesNotContain("SP-2026-000002", "Beto", "Profesional P1", "Medicina general",
                PACIENTE_B.toString(), USUARIO_B.toString(), "2026-11-04T15:00", "PENDIENTE", "versionAgenda");
        assertThat(denegados(citaB)).isEqualTo(1);
        // La cita de B no cambia y B la sigue viendo.
        assertThat(estado(citaB)).isEqualTo("PENDIENTE");
        assertThat(detalle(login(EMAIL_B), citaB)).hasStatusOk();
    }

    @Test
    @DisplayName("La respuesta para una cita ajena es idéntica a la de una inexistente; solo la ajena se audita")
    void ajenaEIndistinguibleDeInexistente() {
        UUID inexistente = UUID.randomUUID();
        MvcTestResult ajena = detalle(sesionA, citaB);
        MvcTestResult noExiste = detalle(sesionA, inexistente);

        esperarError(noExiste, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA");
        for (String campo : List.of("$.type", "$.title", "$.detail", "$.status", "$.codigo")) {
            assertThat((Object) valor(ajena, campo)).as(campo).isEqualTo(valor(noExiste, campo));
        }
        assertThat(denegados(citaB)).isEqualTo(1);
        assertThat(contar("SELECT count(*) FROM auditoria WHERE entidad_id = ?", inexistente.toString())).isZero();
    }

    @Test
    @DisplayName("La línea de tiempo y los horarios disponibles de la cita de B también responden 404 auditado")
    void otrasConsultasDeCitaAjena() {
        MvcTestResult linea = get(sesionA, CITAS + "/" + citaB + "/linea-tiempo");
        MvcTestResult horarios = get(sesionA, CITAS + "/" + citaB + "/horarios-disponibles");

        esperarError(linea, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA");
        esperarError(horarios, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA");
        assertThat(cuerpo(linea)).doesNotContain("Cita registrada", "secuencia");
        assertThat(denegados(citaB)).isEqualTo(2);
    }

    @Test
    @DisplayName("La lista de A solo contiene sus citas")
    void listaSoloPropia() {
        MvcTestResult lista = get(sesionA, CITAS);

        assertThat(lista).hasStatusOk();
        List<String> ids = valor(lista, "$[*].id");
        assertThat(ids).containsExactly(citaA.toString());
        assertThat(cuerpo(lista)).doesNotContain(citaB.toString());
    }
}
