package pe.edu.utp.sigasp.identidad.interno;

import java.time.Clock;
import java.time.Duration;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.compartido.error.DemasiadosIntentosException;
import pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad;

/**
 * Límites de las operaciones públicas de cuenta (mitigan abuso y enumeración de correos):
 * <ul>
 *   <li>registro: 5 por hora desde la misma IP;</li>
 *   <li>recuperación: 5 cada 15 minutos para el mismo correo y 5 cada 15 minutos desde la misma IP.</li>
 * </ul>
 * Los máximos se configuran con {@code sigasp.seguridad.registro.max-por-ip} y
 * {@code sigasp.seguridad.recuperacion.max-solicitudes} (5 en producción; el perfil dev los sube porque con
 * {@code ng serve} todas las solicitudes llegan desde 127.0.0.1). Las ventanas usan el reloj de seguridad (hora
 * real), no el reloj de negocio simulable.
 * <p>
 * La IP es {@code getRemoteAddr()} tal como la resuelve Spring según {@code server.forward-headers-strategy}:
 * sin estrategia, la dirección de la conexión; con {@code native}, Tomcat toma la IP original de
 * {@code X-Forwarded-For} solo si la conexión viene de un proxy de confianza (redes internas). Detrás de un proxy
 * inverso la estrategia es obligatoria: si no, todos los clientes comparten la IP del proxy (docs/despliegue.md).
 */
@Component
class LimitesCuenta {

    private final LimitadorVentana registroPorIp;
    private final LimitadorVentana recuperacionPorIp;
    private final LimitadorVentana recuperacionPorCorreo;

    LimitesCuenta(@RelojSeguridad Clock reloj,
            @Value("${sigasp.seguridad.registro.max-por-ip:5}") int registrosPorIp,
            @Value("${sigasp.seguridad.registro.ventana:PT1H}") Duration ventanaRegistro,
            @Value("${sigasp.seguridad.recuperacion.max-solicitudes:5}") int recuperaciones,
            @Value("${sigasp.seguridad.recuperacion.ventana:PT15M}") Duration ventanaRecuperacion) {
        this.registroPorIp = new LimitadorVentana(registrosPorIp, ventanaRegistro, reloj);
        this.recuperacionPorIp = new LimitadorVentana(recuperaciones, ventanaRecuperacion, reloj);
        this.recuperacionPorCorreo = new LimitadorVentana(recuperaciones, ventanaRecuperacion, reloj);
    }

    /** Registra un intento de registro; lanza 429 si la IP ya alcanzó el máximo. */
    void registro(String ip) {
        registroPorIp.intentar(ip).ifPresent(espera -> {
            throw new DemasiadosIntentosException("registro", espera);
        });
    }

    /** Registra una solicitud de recuperación; lanza 429 si la IP o el correo ya alcanzaron el máximo. */
    void recuperacion(String ip, String email) {
        recuperacionPorIp.intentar(ip).ifPresent(espera -> {
            throw new DemasiadosIntentosException("recuperación de contraseña", espera);
        });
        recuperacionPorCorreo.intentar(email.trim().toLowerCase(Locale.ROOT)).ifPresent(espera -> {
            throw new DemasiadosIntentosException("recuperación de contraseña", espera);
        });
    }
}
