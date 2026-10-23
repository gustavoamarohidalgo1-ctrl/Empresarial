package pe.edu.utp.sigasp;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.modulith.Modulithic;

/**
 * SIGA-SP · Sistema Integrado de Gestión de Atención Ambulatoria y Seguimiento del Paciente.
 * Monolito modular: cada paquete de primer nivel es un módulo (ver docs/arquitectura.md).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
@Modulithic(systemName = "SIGA-SP", sharedModules = "compartido")
public class SigaSpBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(SigaSpBackendApplication.class, args);
    }
}
