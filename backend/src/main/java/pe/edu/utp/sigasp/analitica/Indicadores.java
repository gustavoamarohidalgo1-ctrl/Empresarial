package pe.edu.utp.sigasp.analitica;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import pe.edu.utp.sigasp.analitica.ResumenIndicadores.ConteoEstado;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Dia;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Espera;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Filtros;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Indicador;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.IndicadorInasistencia;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.IndicadorReprogramacion;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Periodo;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.PorEspecialidad;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Tasas;
import pe.edu.utp.sigasp.analitica.interno.EstadoAlCorte;
import pe.edu.utp.sigasp.analitica.interno.PoblacionAlCorte;
import pe.edu.utp.sigasp.analitica.interno.PoblacionAlCorte.Celda;
import pe.edu.utp.sigasp.analitica.interno.PoblacionAlCorte.Parametros;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Indicadores operativos reproducibles (PB20–PB24) según el apartado 13.5 del documento:
 * <ul>
 *   <li><b>Población C(P, t)</b>: citas cuya versión de agenda vigente al corte t tiene su fecha local en P.</li>
 *   <li><b>Estado al corte</b>: el del último evento con {@code ocurrido_en ≤ t}, por secuencia.</li>
 *   <li><b>Confirmación</b>: evento CONFIRMADA hasta t de la versión vigente al corte.</li>
 *   <li><b>Cancelación</b>: estado al corte CANCELADA.</li>
 *   <li><b>Reprogramación</b>: al menos un evento REPROGRAMADA hasta t.</li>
 *   <li><b>Inasistencia</b>: No asistió sobre E = citas no canceladas con {@code inicio + 30 min ≤ t}.</li>
 *   <li><b>Espera</b>: media de (EN_ATENCION − llegada) en minutos, solo con pares válidos.</li>
 * </ul>
 * El corte t es el instante de la consulta. Los filtros se aplican en la población, así que afectan
 * por igual a numeradores y denominadores.
 */
@Service
public class Indicadores {

    /** Rango máximo del periodo, en días locales incluidos ambos extremos. */
    public static final int MAX_DIAS = 366;

    private static final Pattern CODIGO = Pattern.compile("^[A-Za-z0-9_-]{1,20}$");
    private static final BigDecimal CIEN = BigDecimal.valueOf(100);
    private static final BigDecimal SESENTA = BigDecimal.valueOf(60);

    private final PoblacionAlCorte poblacion;
    private final Clock reloj;
    private final ZoneId zona;
    private final Duration tolerancia;

    Indicadores(PoblacionAlCorte poblacion, Clock reloj,
            @Value("${sigasp.reglas.zona-horaria:America/Lima}") ZoneId zona,
            @Value("${sigasp.reglas.llegada-despues:PT30M}") Duration tolerancia) {
        this.poblacion = poblacion;
        this.reloj = reloj;
        this.zona = zona;
        this.tolerancia = tolerancia;
    }

    public ZoneId zona() {
        return zona;
    }

    public ResumenIndicadores resumen(SolicitudIndicadores solicitud) {
        // Precisión de TIMESTAMPTZ: el corte informado es exactamente el que usa la consulta.
        Instant corte = reloj.instant().truncatedTo(ChronoUnit.MICROS);
        LocalDate hoy = LocalDate.ofInstant(corte, zona);
        LocalDate desde = solicitud.desde() != null ? solicitud.desde() : hoy.withDayOfMonth(1);
        LocalDate hasta = solicitud.hasta() != null ? solicitud.hasta() : hoy.with(TemporalAdjusters.lastDayOfMonth());
        validarPeriodo(desde, hasta);
        Filtros filtros = new Filtros(codigo(solicitud.sede(), "sede"),
                codigo(solicitud.especialidad(), "especialidad"),
                codigo(solicitud.profesional(), "profesional"));

        List<Celda> celdas = poblacion.celdas(new Parametros(
                desde.atStartOfDay(zona).toInstant(),
                hasta.plusDays(1).atStartOfDay(zona).toInstant(),
                corte,
                corte.minus(tolerancia),
                zona,
                filtros.sede(), filtros.especialidad(), filtros.profesional()));
        return agregar(new Periodo(desde, hasta), corte, filtros, celdas);
    }

    // ------------------------------------------------------------------
    // Agregación de las celdas (día × especialidad × estado)
    // ------------------------------------------------------------------

    private ResumenIndicadores agregar(Periodo periodo, Instant corte, Filtros filtros, List<Celda> celdas) {
        Map<EstadoAlCorte, Long> porEstado = new EnumMap<>(EstadoAlCorte.class);
        Map<LocalDate, long[]> porDia = new LinkedHashMap<>();
        Map<String, Acumulado> porEspecialidad = new LinkedHashMap<>();
        long total = 0;
        long confirmadas = 0;
        long reprogramadas = 0;
        long eventosReprogramacion = 0;
        long vencidas = 0;
        long noAsistioVencidas = 0;
        long pendientes = 0;
        long esperasValidas = 0;
        long esperasExcluidas = 0;
        BigDecimal segundosEspera = BigDecimal.ZERO;

        for (Celda c : celdas) {
            total += c.total();
            porEstado.merge(c.estado(), c.total(), Long::sum);
            confirmadas += c.confirmadas();
            reprogramadas += c.reprogramadas();
            eventosReprogramacion += c.eventosReprogramacion();
            vencidas += c.vencidas();
            if (c.estado() == EstadoAlCorte.NO_ASISTIO) {
                noAsistioVencidas += c.vencidas();
            } else if (c.estado().esPreviaALlegada()) {
                pendientes += c.vencidas();
            }
            esperasValidas += c.esperasValidas();
            esperasExcluidas += c.esperasExcluidas();
            segundosEspera = segundosEspera.add(c.segundosEspera());

            long[] dia = porDia.computeIfAbsent(c.fecha(), f -> new long[4]);
            dia[0] += c.total();
            switch (c.estado()) {
                case COMPLETADA -> dia[1] += c.total();
                case CANCELADA -> dia[2] += c.total();
                case NO_ASISTIO -> dia[3] += c.total();
                default -> {
                    // Los demás estados solo cuentan en el total del día.
                }
            }

            Acumulado especialidad = porEspecialidad.computeIfAbsent(c.especialidadCodigo(),
                    codigo -> new Acumulado(c.especialidadNombre()));
            especialidad.total += c.total();
            especialidad.vencidas += c.vencidas();
            if (c.estado() == EstadoAlCorte.NO_ASISTIO) {
                especialidad.noAsistio += c.vencidas();
            }
        }

        List<ConteoEstado> estados = new ArrayList<>();
        for (EstadoAlCorte estado : EstadoAlCorte.values()) {
            estados.add(new ConteoEstado(estado.name(), estado.etiqueta(), porEstado.getOrDefault(estado, 0L)));
        }

        List<Dia> dias = new ArrayList<>();
        for (LocalDate fecha = periodo.desde(); !fecha.isAfter(periodo.hasta()); fecha = fecha.plusDays(1)) {
            long[] d = porDia.getOrDefault(fecha, new long[4]);
            dias.add(new Dia(fecha, d[0], d[1], d[2], d[3]));
        }

        List<PorEspecialidad> especialidades = porEspecialidad.entrySet().stream()
                .map(e -> new PorEspecialidad(e.getKey(), e.getValue().nombre, e.getValue().total,
                        tasa(e.getValue().noAsistio, e.getValue().vencidas)))
                .sorted(Comparator.comparingLong(PorEspecialidad::total).reversed()
                        .thenComparing(PorEspecialidad::nombre))
                .toList();

        Tasas tasas = new Tasas(
                indicador(confirmadas, total),
                indicador(porEstado.getOrDefault(EstadoAlCorte.CANCELADA, 0L), total),
                new IndicadorReprogramacion(reprogramadas, total, tasa(reprogramadas, total), eventosReprogramacion),
                new IndicadorInasistencia(noAsistioVencidas, vencidas, tasa(noAsistioVencidas, vencidas),
                        pendientes > 0, pendientes),
                new Espera(esperaPromedio(segundosEspera, esperasValidas), esperasValidas, esperasExcluidas));

        return new ResumenIndicadores(periodo, corte, zona.getId(), filtros, total, estados, tasas, dias,
                especialidades);
    }

    private static Indicador indicador(long numerador, long denominador) {
        return new Indicador(numerador, denominador, tasa(numerador, denominador));
    }

    /** 100 × numerador / denominador con un decimal (mitad hacia arriba); {@code null} si no es calculable. */
    static BigDecimal tasa(long numerador, long denominador) {
        if (denominador == 0) {
            return null;
        }
        return BigDecimal.valueOf(numerador).multiply(CIEN)
                .divide(BigDecimal.valueOf(denominador), 1, RoundingMode.HALF_UP);
    }

    private static BigDecimal esperaPromedio(BigDecimal segundos, long observaciones) {
        if (observaciones == 0) {
            return null;
        }
        return segundos.divide(SESENTA.multiply(BigDecimal.valueOf(observaciones)), 1, RoundingMode.HALF_UP);
    }

    // ------------------------------------------------------------------
    // Validación
    // ------------------------------------------------------------------

    private static void validarPeriodo(LocalDate desde, LocalDate hasta) {
        if (desde.isAfter(hasta)) {
            throw new ApiException(CodigoError.VALIDACION,
                    "La fecha inicial del periodo no puede ser posterior a la fecha final.");
        }
        if (ChronoUnit.DAYS.between(desde, hasta) + 1 > MAX_DIAS) {
            throw new ApiException(CodigoError.VALIDACION,
                    "El periodo puede abarcar como máximo " + MAX_DIAS + " días.");
        }
    }

    /** Normaliza un filtro opcional: en blanco equivale a «todos»; si no, debe ser un código de catálogo. */
    private static String codigo(String valor, String campo) {
        if (valor == null || valor.isBlank()) {
            return null;
        }
        String codigo = valor.trim();
        if (!CODIGO.matcher(codigo).matches()) {
            throw new ApiException(CodigoError.VALIDACION, "El filtro de " + campo + " no es un código válido.");
        }
        return codigo;
    }

    private static final class Acumulado {
        private final String nombre;
        private long total;
        private long vencidas;
        private long noAsistio;

        private Acumulado(String nombre) {
            this.nombre = nombre;
        }
    }
}
