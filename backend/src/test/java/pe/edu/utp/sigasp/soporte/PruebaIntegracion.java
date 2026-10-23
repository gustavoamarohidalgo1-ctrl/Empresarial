package pe.edu.utp.sigasp.soporte;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;

import java.time.Clock;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.convention.TestBean;
import org.springframework.test.web.servlet.assertj.MockMvcTester;
import org.springframework.test.web.servlet.assertj.MvcTestResult;

import pe.edu.utp.sigasp.compartido.reloj.RelojAjustable;
import pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad;

/**
 * Base de las pruebas de integración: contexto completo, PostgreSQL embebido, MockMvc y reloj
 * fijo. Antes de cada prueba se vacía la BD, se fija el reloj en {@link #AHORA} y se cargan los
 * datos base de {@link EscenarioPrueba}.
 * <p>
 * El reloj de seguridad (bloqueos, límites, vigencia de enlaces) es independiente del de negocio: aquí se
 * sustituye por {@link #relojSeguridad}, que empieza cada prueba en la hora real y solo lo mueven las pruebas que
 * lo necesitan.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class PruebaIntegracion {

    /** Lunes 02/11/2026, 08:00 en Lima. */
    public static final Instant AHORA = Instant.parse("2026-11-02T13:00:00Z");
    /** Miércoles 04/11/2026, 09:00 en Lima: hora típica de una cita futura. */
    public static final Instant MIERCOLES_9AM = Instant.parse("2026-11-04T14:00:00Z");

    @DynamicPropertySource
    static void baseDeDatos(DynamicPropertyRegistry propiedades) {
        PostgresEmbebido.registrar(propiedades);
    }

    @Autowired
    protected MockMvcTester mvc;

    @Autowired
    protected JdbcClient jdbc;

    @Autowired
    protected RelojAjustable reloj;

    @Autowired
    protected EscenarioPrueba escenario;

    /** Sustituye al reloj de seguridad real (bean {@code relojSeguridad}) por uno ajustable, propio de las pruebas. */
    @TestBean(name = RelojSeguridad.BEAN, methodName = "relojSeguridadDePrueba")
    @RelojSeguridad
    private Clock relojSeguridadDelContexto;

    /** Reloj de seguridad del contexto (independiente de {@link #reloj}); cada prueba empieza en la hora real. */
    protected RelojAjustable relojSeguridad;

    static Clock relojSeguridadDePrueba() {
        return RelojAjustable.delSistema();
    }

    @BeforeEach
    void prepararEscenario() {
        relojSeguridad = (RelojAjustable) relojSeguridadDelContexto;
        reloj.fijar(AHORA);
        relojSeguridad.fijar(null);
        escenario.limpiar();
        escenario.base();
    }

    @AfterEach
    void liberarReloj() {
        reloj.fijar(null);
        relojSeguridad.fijar(null);
    }

    /** Inicia sesión por la API real y devuelve la sesión HTTP resultante. */
    protected MockHttpSession login(String email) {
        MvcTestResult resultado = mvc.post().uri("/api/v1/auth/login")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"" + email + "\",\"password\":\"" + EscenarioPrueba.CLAVE + "\"}")
                .exchange();
        if (resultado.getResponse().getStatus() != 200) {
            throw new IllegalStateException("Login fallido para " + email + ": "
                    + resultado.getResponse().getStatus());
        }
        return (MockHttpSession) resultado.getRequest().getSession(false);
    }

    /** POST JSON autenticado con CSRF y una clave de idempotencia nueva. */
    protected MvcTestResult post(MockHttpSession sesion, String uri, String json) {
        return post(sesion, uri, json, UUID.randomUUID());
    }

    protected MvcTestResult post(MockHttpSession sesion, String uri, String json, UUID clave) {
        return mvc.post().uri(uri)
                .session(sesion)
                .with(csrf())
                .header("Idempotency-Key", clave.toString())
                .contentType(MediaType.APPLICATION_JSON)
                .content(json)
                .exchange();
    }

    protected MvcTestResult get(MockHttpSession sesion, String uri) {
        return mvc.get().uri(uri).session(sesion).exchange();
    }

    protected long contar(String sql, Object... parametros) {
        return jdbc.sql(sql).params(parametros).query(Long.class).single();
    }
}
