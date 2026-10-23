package pe.edu.utp.sigasp.compartido.reloj;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.beans.factory.annotation.Qualifier;

/**
 * Calificador del <b>reloj de seguridad</b> (bean {@value #BEAN}): la hora real ({@code Clock.systemUTC()}),
 * independiente del reloj de negocio, que en desarrollo se puede simular con {@code PUT /api/v1/dev/reloj}.
 * <p>
 * Lo usan los plazos que protegen cuentas: bloqueo por intentos de inicio de sesión, límites de registro y de
 * recuperación, y vigencia de los enlaces de recuperación. Así, adelantar o detener el reloj de negocio no
 * levanta un bloqueo ni mantiene vivo un enlace vencido. Las pruebas lo sustituyen por un reloj ajustable
 * propio (con el mismo nombre de bean).
 * <pre>{@code
 * Servicio(@RelojSeguridad Clock reloj) { ... }
 * }</pre>
 */
@Target({ElementType.PARAMETER, ElementType.FIELD, ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Qualifier(RelojSeguridad.BEAN)
public @interface RelojSeguridad {

    /** Nombre del bean del reloj de seguridad. */
    String BEAN = "relojSeguridad";
}
