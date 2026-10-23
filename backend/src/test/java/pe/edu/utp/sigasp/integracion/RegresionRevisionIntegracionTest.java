package pe.edu.utp.sigasp.integracion;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.EMAIL_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.P1;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_A;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.PACIENTE_B;
import static pe.edu.utp.sigasp.soporte.EscenarioPrueba.USUARIO_A;

import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Supplier;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.assertj.MvcTestResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.operaciones.Idempotencia;
import pe.edu.utp.sigasp.operaciones.SolicitudIdempotente;
import pe.edu.utp.sigasp.soporte.PruebaApi;

/** Regresiones de los hallazgos de la revisión independiente del código. */
class RegresionRevisionIntegracionTest extends PruebaApi {

    @Autowired
    private Idempotencia idempotencia;

    @Autowired
    private PlatformTransactionManager transacciones;

    @Test
    @DisplayName("Más rechazos simultáneos que conexiones del pool no bloquean el servicio")
    void rafagaDeRechazosNoAgotaElPool() throws Exception {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);
        int solicitudes = 12; // el pool de Hikari tiene 10 conexiones
        List<Supplier<MvcTestResult>> tareas = new ArrayList<>();
        for (int i = 0; i < solicitudes; i++) {
            tareas.add(() -> confirmar(sesion, cita, 99)); // versión obsoleta: rechazo 409
        }
        long inicio = System.nanoTime();
        @SuppressWarnings("unchecked")
        List<MvcTestResult> resultados = simultaneas(tareas.toArray(Supplier[]::new));
        Duration duracion = Duration.ofNanos(System.nanoTime() - inicio);

        assertThat(resultados).allSatisfy(r -> esperarError(r, HttpStatus.CONFLICT, "VERSION_OBSOLETA"));
        assertThat(duracion).as("sin esperas de 30 s por conexiones").isLessThan(Duration.ofSeconds(15));
        assertThat(contar("SELECT count(*) FROM operacion WHERE estado = 'RECHAZADA'")).isEqualTo(solicitudes);
        assertThat(estado(cita)).isEqualTo("PENDIENTE");
    }

    @Test
    @DisplayName("Una ráfaga de accesos a una cita ajena responde 404 y audita cada intento sin bloquear el pool")
    void rafagaDeAccesosAjenos() throws Exception {
        UUID ajena = escenario.cita(PACIENTE_B, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);
        List<Supplier<MvcTestResult>> tareas = new ArrayList<>();
        for (int i = 0; i < 12; i++) {
            tareas.add(() -> detalle(sesion, ajena));
        }
        @SuppressWarnings("unchecked")
        List<MvcTestResult> resultados = simultaneas(tareas.toArray(Supplier[]::new));

        assertThat(resultados).allSatisfy(r -> esperarError(r, HttpStatus.NOT_FOUND, "CITA_NO_ENCONTRADA"));
        assertThat(auditorias("CITA_ACCESO", "DENEGADO", ajena)).isEqualTo(12);
    }

    @Test
    @DisplayName("La huella de idempotencia no depende del orden de las claves del contenido")
    void huellaCanonica() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        UUID clave = UUID.randomUUID();
        Map<String, Object> ordenUno = new LinkedHashMap<>();
        ordenUno.put("a", 1);
        ordenUno.put("b", "x");
        Map<String, Object> ordenDos = new LinkedHashMap<>();
        ordenDos.put("b", "x");
        ordenDos.put("a", 1);
        TransactionTemplate tx = new TransactionTemplate(transacciones);

        String primero = tx.execute(e -> idempotencia.ejecutar(
                new SolicitudIdempotente(clave, USUARIO_A, "PRUEBA", cita, ordenUno), String.class, () -> "resultado"));
        String repetido = tx.execute(e -> idempotencia.ejecutar(
                new SolicitudIdempotente(clave, USUARIO_A, "PRUEBA", cita, ordenDos), String.class,
                () -> "no debería ejecutarse"));

        assertThat(primero).isEqualTo("resultado");
        assertThat(repetido).as("misma operación con las claves en otro orden").isEqualTo("resultado");
    }

    @Test
    @DisplayName("Método no permitido responde 405 y tipo de contenido no soportado 415, en formato Problem Details")
    void erroresDeProtocolo() {
        MockHttpSession sesion = login(EMAIL_A);
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);

        MvcTestResult metodo = mvc.put().uri(CITAS + "/" + cita + "/confirmacion").session(sesion).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{}").exchange();
        MvcTestResult tipo = mvc.post().uri(CITAS + "/" + cita + "/confirmacion").session(sesion).with(csrf())
                .header("Idempotency-Key", UUID.randomUUID().toString())
                .contentType(MediaType.TEXT_PLAIN).content("versionAgenda=1").exchange();

        esperarError(metodo, HttpStatus.METHOD_NOT_ALLOWED, "METODO_NO_PERMITIDO");
        esperarError(tipo, HttpStatus.UNSUPPORTED_MEDIA_TYPE, "TIPO_NO_SOPORTADO");
    }

    @Test
    @DisplayName("El perfil no acepta un correo vacío ni un teléfono de solo espacios")
    void perfilSinValoresVacios() {
        MockHttpSession sesion = login(EMAIL_A);
        MvcTestResult resultado = mvc.patch().uri("/api/v1/pacientes/me/perfil").session(sesion).with(csrf())
                .contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"\",\"telefono\":\"       \"}").exchange();

        esperarError(resultado, HttpStatus.BAD_REQUEST, "VALIDACION");
        assertThat(jdbc.sql("SELECT email_contacto FROM paciente WHERE id = ?").params(PACIENTE_A)
                .query(String.class).single()).isEqualTo("ana.contacto@ejemplo.invalid");
    }

    @Test
    @DisplayName("Evento y auditoría de un mismo cambio comparten el instante aunque el reloj avance")
    void mismoInstanteSinRelojCongelado() {
        UUID cita = escenario.cita(PACIENTE_A, P1, MIERCOLES_9AM);
        MockHttpSession sesion = login(EMAIL_A);
        reloj.fijar(null); // reloj real: cada lectura devuelve un instante distinto

        assertThat(confirmar(sesion, cita, 1)).hasStatusOk();

        var evento = instante("SELECT ocurrido_en FROM cita_evento WHERE cita_id = ? AND tipo = 'CONFIRMADA'", cita);
        var auditoria = instante("SELECT ocurrido_en FROM auditoria WHERE entidad_id = ? AND accion = 'CITA_CONFIRMAR'",
                cita.toString());
        assertThat(auditoria).isEqualTo(evento);
    }
}
