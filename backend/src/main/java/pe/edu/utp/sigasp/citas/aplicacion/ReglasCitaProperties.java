package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Duration;
import java.time.ZoneId;

import org.springframework.boot.context.properties.ConfigurationProperties;

import pe.edu.utp.sigasp.citas.dominio.ReglasTiempo;

/**
 * Parámetros documentados de las reglas (HU08: antes de PB26 se usa configuración, sin pantalla).
 *
 * @param llegadaAntes        apertura de la ventana de llegada antes de la hora prevista
 * @param llegadaDespues      cierre de la ventana (y elegibilidad de No asistió) tras la hora prevista
 * @param zonaHoraria         zona de la sede para el "mismo día local" y los textos
 * @param intervaloCierre     cada cuánto se ejecuta el cierre automático por inasistencia
 * @param anticipacionReserva anticipación mínima para reservar una cita nueva: la disponibilidad no ofrece y la
 *                            reserva rechaza los horarios que empiezan antes de {@code ahora + anticipacionReserva}
 */
@ConfigurationProperties("sigasp.reglas")
public record ReglasCitaProperties(Duration llegadaAntes, Duration llegadaDespues, ZoneId zonaHoraria,
        Duration intervaloCierre, Duration anticipacionReserva) {

    /** Valor por defecto de {@code sigasp.reglas.anticipacion-reserva}. */
    public static final Duration ANTICIPACION_RESERVA_POR_DEFECTO = Duration.ofHours(2);

    public ReglasCitaProperties {
        llegadaAntes = llegadaAntes == null ? Duration.ofMinutes(60) : llegadaAntes;
        llegadaDespues = llegadaDespues == null ? Duration.ofMinutes(30) : llegadaDespues;
        zonaHoraria = zonaHoraria == null ? ZoneId.of("America/Lima") : zonaHoraria;
        intervaloCierre = intervaloCierre == null ? Duration.ofMinutes(1) : intervaloCierre;
        anticipacionReserva = anticipacionReserva == null ? ANTICIPACION_RESERVA_POR_DEFECTO : anticipacionReserva;
        if (anticipacionReserva.isNegative()) {
            throw new IllegalArgumentException("sigasp.reglas.anticipacion-reserva no puede ser negativa.");
        }
    }

    public ReglasTiempo reglas() {
        return new ReglasTiempo(llegadaAntes, llegadaDespues, zonaHoraria);
    }
}
