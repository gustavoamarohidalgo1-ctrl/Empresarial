package pe.edu.utp.sigasp.compartido.reloj;

import java.time.Clock;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

/**
 * Toda la lógica temporal usa un {@link Clock} inyectado y nunca {@code Instant.now()}. Hay dos relojes:
 * <ul>
 *   <li><b>Reloj de negocio</b> (el {@code Clock} principal, sin calificador): citas, recordatorios, ventanas de
 *       llegada, auditoría. Con {@code sigasp.reloj.ajustable=true} (perfil dev y pruebas) se puede simular.</li>
 *   <li><b>Reloj de seguridad</b> ({@link RelojSeguridad @RelojSeguridad}): siempre la hora real. Bloqueos,
 *       límites por ventana y vigencia de enlaces de recuperación no dependen de la hora simulada.</li>
 * </ul>
 */
@Configuration(proxyBeanMethods = false)
class RelojConfig {

    @Bean
    @Primary
    @ConditionalOnProperty(name = "sigasp.reloj.ajustable", havingValue = "true")
    RelojAjustable relojAjustable() {
        return RelojAjustable.delSistema();
    }

    @Bean
    @Primary
    @ConditionalOnProperty(name = "sigasp.reloj.ajustable", havingValue = "false", matchIfMissing = true)
    Clock relojDelSistema() {
        return Clock.systemUTC();
    }

    @Bean(RelojSeguridad.BEAN)
    @RelojSeguridad
    Clock relojSeguridad() {
        return Clock.systemUTC();
    }
}
