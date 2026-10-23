package pe.edu.utp.sigasp.correo.interno;

import java.sql.Timestamp;
import java.time.Clock;
import java.util.Objects;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.correo.Correo;

/**
 * Canal de correo simulado: registra el mensaje en {@code correo_simulado} y deja constancia en el log de que
 * <b>no</b> se entregó a ningún destinatario real.
 * <ul>
 *   <li><b>Con el buzón de desarrollo</b> ({@code sigasp.dev.buzon-correos=true}, solo perfil dev) guarda el
 *       mensaje completo: destinatario, asunto, cuerpo y enlace, para completar la recuperación en local.</li>
 *   <li><b>Sin él</b> (producción) guarda solo el asunto y el destinatario enmascarado ({@code a***@correo.test});
 *       el cuerpo y el enlace quedan nulos. Ambos llevan el token de un solo uso: guardarlos anularía la protección
 *       de guardar solo su hash en {@code token_recuperacion}.</li>
 * </ul>
 * El log nunca incluye el cuerpo, el enlace ni el correo completo del destinatario.
 */
@Component
class CorreoSimulado implements Correo {

    private static final Logger log = LoggerFactory.getLogger(CorreoSimulado.class);
    private static final int MAX_ASUNTO = 200;
    private static final int MAX_ENLACE = 500;

    private final JdbcClient jdbc;
    private final Clock reloj;
    private final boolean guardarContenido;

    CorreoSimulado(JdbcClient jdbc, Clock reloj,
            @Value("${sigasp.dev.buzon-correos:false}") boolean guardarContenido) {
        this.jdbc = jdbc;
        this.reloj = reloj;
        this.guardarContenido = guardarContenido;
    }

    @Override
    public void enviar(String destinatario, String asunto, String cuerpo, String enlace) {
        Objects.requireNonNull(destinatario, "destinatario");
        Objects.requireNonNull(asunto, "asunto");
        Objects.requireNonNull(cuerpo, "cuerpo");
        if (asunto.length() > MAX_ASUNTO || (enlace != null && enlace.length() > MAX_ENLACE)) {
            throw new IllegalArgumentException("Asunto o enlace demasiado largos para el correo simulado");
        }
        jdbc.sql("""
                        INSERT INTO correo_simulado (id, destinatario, asunto, cuerpo, enlace, enviado_en)
                        VALUES (:id, :destinatario, :asunto, :cuerpo, :enlace, :enviado)
                        """)
                .param("id", UUID.randomUUID())
                .param("destinatario", guardarContenido ? destinatario : enmascarar(destinatario))
                .param("asunto", asunto)
                .param("cuerpo", guardarContenido ? cuerpo : null)
                .param("enlace", guardarContenido ? enlace : null)
                .param("enviado", Timestamp.from(reloj.instant()))
                .update();
        log.info("[CORREO SIMULADO: no se envió ningún correo real] Para: {} · Asunto: {}",
                enmascarar(destinatario), asunto);
    }

    /** {@code lucia.paredes@correo.test} → {@code l***@correo.test}. */
    static String enmascarar(String correo) {
        int arroba = correo.indexOf('@');
        if (arroba <= 0) {
            return "***";
        }
        return correo.charAt(0) + "***" + correo.substring(arroba);
    }
}
