package pe.edu.utp.sigasp.analitica;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/**
 * Resultado de {@code GET /api/v1/analitica/resumen} (contrato v1.1, docs/api.md). Solo contiene
 * conteos agregados: ningún dato personal ni identificador de cita o paciente.
 *
 * @param periodo        días locales consultados, ambos incluidos
 * @param corte          instante t al que se reconstruye cada cita (el de la consulta)
 * @param zonaHoraria    zona en la que se interpretan los días del periodo
 * @param filtros        filtros aplicados por igual a numeradores y denominadores
 * @param totalCitas     |C(P, t)|
 * @param porEstado      los 8 estados, siempre presentes y en el orden del recorrido
 * @param indicadores    tasas del apartado 13.5
 * @param porDia         cada día del periodo, sin huecos
 * @param porEspecialidad especialidades con al menos una cita en C(P, t)
 */
public record ResumenIndicadores(
        Periodo periodo,
        Instant corte,
        String zonaHoraria,
        Filtros filtros,
        long totalCitas,
        List<ConteoEstado> porEstado,
        Tasas indicadores,
        List<Dia> porDia,
        List<PorEspecialidad> porEspecialidad) {

    public record Periodo(LocalDate desde, LocalDate hasta) {
    }

    /** Códigos de los filtros aplicados; {@code null} significa «todos». */
    public record Filtros(String sede, String especialidad, String profesional) {
    }

    public record ConteoEstado(String estado, String etiqueta, long total) {
    }

    public record Tasas(
            Indicador confirmacion,
            Indicador cancelacion,
            IndicadorReprogramacion reprogramacion,
            IndicadorInasistencia inasistencia,
            Espera esperaPromedioMinutos) {
    }

    /** {@code tasa} = 100 × numerador / denominador con un decimal, o {@code null} si el denominador es 0. */
    public record Indicador(long numerador, long denominador, BigDecimal tasa) {
    }

    /**
     * Como {@link Indicador}; además {@code eventos} cuenta todos los eventos de reprogramación
     * (una cita reprogramada varias veces suma una sola vez en la tasa, apartado 13.5).
     */
    public record IndicadorReprogramacion(long numerador, long denominador, BigDecimal tasa, long eventos) {
    }

    /**
     * Inasistencia sobre E (citas vencidas no canceladas). Es provisional mientras haya citas de E
     * en Pendiente o Confirmada, que el cierre automático aún no clasificó.
     */
    public record IndicadorInasistencia(long numerador, long denominador, BigDecimal tasa, boolean provisional,
            long pendientesDeClasificar) {
    }

    /**
     * Media de (inicio de atención − llegada) en minutos sobre los pares válidos. {@code excluidas}
     * cuenta las citas que ya iniciaron atención sin un par válido de marcas; nunca se eliminan.
     */
    public record Espera(BigDecimal valor, long observaciones, long excluidas) {
    }

    public record Dia(LocalDate fecha, long total, long completadas, long canceladas, long noAsistio) {
    }

    public record PorEspecialidad(String codigo, String nombre, long total, BigDecimal tasaInasistencia) {
    }
}
