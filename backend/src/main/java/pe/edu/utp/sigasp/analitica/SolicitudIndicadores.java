package pe.edu.utp.sigasp.analitica;

import java.time.LocalDate;

/**
 * Parámetros de una consulta de indicadores. Todo es opcional: sin fechas se usa el mes en curso
 * (en la zona de la sede) y un filtro vacío o en blanco equivale a «todos».
 *
 * @param desde        primer día local del periodo (incluido)
 * @param hasta        último día local del periodo (incluido)
 * @param sede         código de la sede de la versión de agenda vigente al corte
 * @param especialidad código de la especialidad de la cita
 * @param profesional  código del profesional de la versión de agenda vigente al corte
 */
public record SolicitudIndicadores(LocalDate desde, LocalDate hasta, String sede, String especialidad,
        String profesional) {
}
