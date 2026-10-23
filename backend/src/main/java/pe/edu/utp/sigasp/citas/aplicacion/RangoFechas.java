package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Rango de fechas locales de las consultas de horarios (disponibilidad para reservar y horarios para
 * reprogramar): {@code desde} y {@code hasta} se incluyen, y el rango abarca como máximo {@value #MAX_DIAS}
 * días (igual que el periodo de los indicadores, que también cuenta los días incluidos).
 */
final class RangoFechas {

    /** Días que puede abarcar una consulta, contando {@code desde} y {@code hasta}. */
    static final int MAX_DIAS = 31;
    /** Por defecto, de hoy a hoy + 14 (15 días incluidos). */
    static final int DIAS_DESPUES_POR_DEFECTO = 14;

    private RangoFechas() {
    }

    /** Fecha final efectiva: la pedida o {@code desde + 14}. */
    static LocalDate hasta(LocalDate desde, LocalDate hasta) {
        return hasta == null ? desde.plusDays(DIAS_DESPUES_POR_DEFECTO) : hasta;
    }

    /** 400 {@code VALIDACION} si {@code hasta < desde} o si el rango abarca más de {@value #MAX_DIAS} días. */
    static void validar(LocalDate desde, LocalDate hasta) {
        if (hasta.isBefore(desde)) {
            throw new ApiException(CodigoError.VALIDACION,
                    "La fecha final no puede ser anterior a la fecha inicial.");
        }
        if (ChronoUnit.DAYS.between(desde, hasta) + 1 > MAX_DIAS) {
            throw new ApiException(CodigoError.VALIDACION,
                    "El rango de fechas puede abarcar como máximo " + MAX_DIAS + " días.");
        }
    }
}
