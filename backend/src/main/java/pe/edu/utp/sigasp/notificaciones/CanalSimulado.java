package pe.edu.utp.sigasp.notificaciones;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Adaptador de envío simulado: no envía correos ni SMS reales y lo deja explícito en el log
 * (HU08: el resultado se identifica como simulado, sin afirmar una entrega real).
 */
@Component
class CanalSimulado {

    private static final Logger log = LoggerFactory.getLogger(CanalSimulado.class);

    /** Devuelve true si el envío simulado "se realizó". Sustituible en pruebas para simular fallos. */
    boolean enviar(String contenido) {
        log.debug("[ENVÍO SIMULADO — no se entrega a ningún destinatario real] {}", contenido);
        return true;
    }
}
