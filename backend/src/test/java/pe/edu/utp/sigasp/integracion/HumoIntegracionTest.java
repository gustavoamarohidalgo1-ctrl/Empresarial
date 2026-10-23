package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;

import pe.edu.utp.sigasp.soporte.EscenarioPrueba;
import pe.edu.utp.sigasp.soporte.PruebaIntegracion;

/** Prueba de humo: el contexto arranca, las migraciones aplican y el flujo básico funciona. */
class HumoIntegracionTest extends PruebaIntegracion {

    @Test
    void elPacienteIniciaSesionYVeSusCitas() {
        UUID cita = escenario.cita(EscenarioPrueba.PACIENTE_A, EscenarioPrueba.P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EscenarioPrueba.EMAIL_A);

        assertThat(get(sesion, "/api/v1/pacientes/me/citas"))
                .hasStatusOk()
                .bodyJson().extractingPath("$[0].id").isEqualTo(cita.toString());
    }
}
