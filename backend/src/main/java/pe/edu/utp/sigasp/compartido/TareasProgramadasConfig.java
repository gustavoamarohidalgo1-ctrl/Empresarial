package pe.edu.utp.sigasp.compartido;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * Activa las tareas programadas (cierre por inasistencia, recordatorios). Las pruebas las
 * desactivan con {@code sigasp.tareas.habilitadas=false} y ejecutan cada proceso de forma explícita.
 * Los oyentes de eventos entre módulos son asíncronos siempre: Spring Modulith habilita la ejecución
 * asíncrona por su cuenta, también en las pruebas (que esperan a que terminen los eventos pendientes).
 */
@Configuration(proxyBeanMethods = false)
@EnableAsync
@ConditionalOnProperty(name = "sigasp.tareas.habilitadas", havingValue = "true", matchIfMissing = true)
@EnableScheduling
class TareasProgramadasConfig {
}
