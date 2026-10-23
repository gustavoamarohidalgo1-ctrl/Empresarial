package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_OPERADOR;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.soporte.PruebaApi;

/** S1-R07 · Perfil de contacto: cambios válidos persisten y se auditan; los inválidos no cambian nada. */
@DisplayName("S1-R07 · Perfil del paciente")
class PerfilIntegracionTest extends PruebaApi {

    private static final String PERFIL = "/api/v1/pacientes/me/perfil";

    private MvcTestResult patch(MockHttpSession sesion, String json) {
        return mvc.patch().uri(PERFIL).session(sesion).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content(json).exchange();
    }

    private Map<String, Object> contactoEnBd(java.util.UUID paciente) {
        return jdbc.sql("SELECT email_contacto, telefono_contacto, nombres FROM paciente WHERE id = ?")
                .params(paciente).query().singleRow();
    }

    @Test
    @DisplayName("GET devuelve el perfil del paciente de la sesión")
    void consultar() {
        assertThat(get(login(EMAIL_A), PERFIL)).hasStatusOk().bodyJson().isStrictlyEqualTo("""
                {"nombres":"Ana","apellidos":"Prueba","email":"ana.contacto@ejemplo.invalid",
                 "telefono":"+51 900 000 000"}
                """);
    }

    @Test
    @DisplayName("Un PATCH válido persiste el contacto y audita los campos cambiados sin sus valores")
    void cambioValido() {
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult resultado = patch(sesion,
                "{\"email\":\"ana.nueva@ejemplo.invalid\",\"telefono\":\"+51 911 222 333\"}");

        assertThat(resultado).hasStatusOk().bodyJson().isStrictlyEqualTo("""
                {"nombres":"Ana","apellidos":"Prueba","email":"ana.nueva@ejemplo.invalid","telefono":"+51 911 222 333"}
                """);
        assertThat(contactoEnBd(PACIENTE_A)).containsEntry("email_contacto", "ana.nueva@ejemplo.invalid")
                .containsEntry("telefono_contacto", "+51 911 222 333");
        assertThat(get(sesion, PERFIL)).bodyJson().extractingPath("$.email").isEqualTo("ana.nueva@ejemplo.invalid");
        // El otro paciente no cambia.
        assertThat(contactoEnBd(PACIENTE_B)).containsEntry("email_contacto", "beto.contacto@ejemplo.invalid");

        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'PERFIL_ACTUALIZAR' AND resultado = 'EXITO' "
                + "AND entidad = 'PACIENTE' AND entidad_id = ? AND actor_usuario_id = ?",
                PACIENTE_A.toString(), USUARIO_A)).isEqualTo(1);
        String detalle = jdbc.sql("SELECT detalle::text FROM auditoria WHERE accion = 'PERFIL_ACTUALIZAR'")
                .query(String.class).single();
        assertThat(detalle).contains("email", "telefono").doesNotContain("ana.nueva", "911");
    }

    @Test
    @DisplayName("Un PATCH parcial solo cambia el campo enviado y audita solo ese campo")
    void cambioParcial() {
        MockHttpSession sesion = login(EMAIL_A);

        assertThat(patch(sesion, "{\"telefono\":\"+51 955 666 777\"}")).hasStatusOk();

        assertThat(contactoEnBd(PACIENTE_A)).containsEntry("email_contacto", "ana.contacto@ejemplo.invalid")
                .containsEntry("telefono_contacto", "+51 955 666 777");
        List<String> campos = jdbc.sql("SELECT jsonb_array_elements_text(detalle -> 'campos') FROM auditoria "
                + "WHERE accion = 'PERFIL_ACTUALIZAR'").query(String.class).list();
        assertThat(campos).containsExactly("telefono");
    }

    @Test
    @DisplayName("Un PATCH inválido responde 400 con errores[] y conserva el valor anterior sin auditar cambios")
    void cambioInvalido() {
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult resultado = patch(sesion, "{\"email\":\"no-es-un-correo\",\"telefono\":\"abc\"}");

        esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
        List<String> campos = valor(resultado, "$.errores[*].campo");
        assertThat(campos).containsExactlyInAnyOrder("email", "telefono");
        assertThat((List<String>) valor(resultado, "$.errores[*].mensaje"))
                .contains("Formato de correo inválido", "Formato de teléfono inválido");
        assertThat(contactoEnBd(PACIENTE_A)).containsEntry("email_contacto", "ana.contacto@ejemplo.invalid")
                .containsEntry("telefono_contacto", "+51 900 000 000");
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'PERFIL_ACTUALIZAR'")).isZero();
    }

    @Test
    @DisplayName("Los campos de identidad del cuerpo se ignoran: solo cambian email y teléfono")
    void camposNoEditablesSeIgnoran() {
        MockHttpSession sesion = login(EMAIL_A);

        MvcTestResult resultado = patch(sesion,
                "{\"nombres\":\"Intruso\",\"apellidos\":\"X\",\"email\":\"ana.otra@ejemplo.invalid\"}");

        assertThat(resultado).hasStatusOk().bodyJson().extractingPath("$.nombres").isEqualTo("Ana");
        assertThat(contactoEnBd(PACIENTE_A)).containsEntry("nombres", "Ana")
                .containsEntry("email_contacto", "ana.otra@ejemplo.invalid");
    }

    @Test
    @DisplayName("Un PATCH sin cambios reales no audita nada; un operador no tiene perfil de paciente")
    void sinCambiosYOtroRol() {
        MockHttpSession sesion = login(EMAIL_A);
        assertThat(patch(sesion, "{\"email\":\"ana.contacto@ejemplo.invalid\"}")).hasStatusOk();
        assertThat(contar("SELECT count(*) FROM auditoria WHERE accion = 'PERFIL_ACTUALIZAR'")).isZero();

        esperarError(patch(login(EMAIL_OPERADOR), "{\"telefono\":\"+51 999 999 999\"}"), HttpStatus.FORBIDDEN,
                "ACCESO_DENEGADO");
    }
}
