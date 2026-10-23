package pe.edu.utp.sigasp;

import org.junit.jupiter.api.Test;
import org.springframework.modulith.core.ApplicationModules;
import org.springframework.modulith.docs.Documenter;

import com.tngtech.archunit.base.DescribedPredicate;
import com.tngtech.archunit.core.domain.JavaClass;

/**
 * Verifica las fronteras del monolito modular (RNF16): sin ciclos entre módulos y sin acceso a
 * paquetes internos de otro módulo. Además genera la documentación de módulos (diagramas
 * PlantUML y lienzos) en target/spring-modulith-docs.
 */
class ModularidadTest {

    /**
     * Excluye las clases compiladas de las pruebas aunque el directorio de compilación no sea {@code target}
     * ({@code -Dsigasp.build.dir=…}): la opción por defecto de ArchUnit solo reconoce {@code /target/test-classes/}.
     */
    private static final DescribedPredicate<JavaClass> CLASES_DE_PRUEBA = DescribedPredicate.describe(
            "clases de las pruebas", clase -> clase.getSource()
                    .map(fuente -> fuente.getUri().toString().contains("/test-classes/"))
                    .orElse(false));

    private final ApplicationModules modulos = ApplicationModules.of(SigaSpBackendApplication.class, CLASES_DE_PRUEBA);

    @Test
    void lasFronterasEntreModulosSeRespetan() {
        modulos.verify();
    }

    @Test
    void generaDocumentacionDeModulos() {
        new Documenter(modulos)
                .writeModulesAsPlantUml()
                .writeIndividualModulesAsPlantUml()
                .writeModuleCanvases();
    }
}
