package pe.edu.utp.sigasp.compartido.web;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

/** Metadatos de la especificación OpenAPI (solo cuando la documentación está habilitada: perfil dev). */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(name = "springdoc.api-docs.enabled", havingValue = "true")
class DocumentacionApiConfig {

    @Bean
    OpenAPI especificacion() {
        return new OpenAPI()
                .info(new Info()
                        .title("SIGA-SP API")
                        .version("v1")
                        .description("""
                                Sistema Integrado de Gestión de Atención Ambulatoria y Seguimiento del Paciente.
                                Autenticación por sesión (cookie SIGASP_SESSION) y protección CSRF (cookie
                                XSRF-TOKEN + cabecera X-XSRF-TOKEN). Las operaciones que cambian una cita exigen
                                la cabecera Idempotency-Key. Errores en formato RFC 9457 con la propiedad
                                `codigo`. Contrato completo en docs/api.md. Solo datos sintéticos."""))
                .components(new Components().addSecuritySchemes("sesion", new SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .in(SecurityScheme.In.COOKIE)
                        .name("SIGASP_SESSION")))
                .addSecurityItem(new SecurityRequirement().addList("sesion"));
    }
}
