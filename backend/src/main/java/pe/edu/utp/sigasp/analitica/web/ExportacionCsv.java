package pe.edu.utp.sigasp.analitica.web;

import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;

import pe.edu.utp.sigasp.analitica.ResumenIndicadores;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.ConteoEstado;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Dia;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Espera;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.Indicador;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.IndicadorInasistencia;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.IndicadorReprogramacion;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores.PorEspecialidad;

/**
 * Exportación del resumen de indicadores a CSV para hojas de cálculo:
 * <ul>
 *   <li>UTF-8 con BOM, para que Excel reconozca las tildes y la «ñ».</li>
 *   <li>Separador «;» y punto decimal (formato regional es-PE); saltos de línea CRLF (RFC 4180).</li>
 *   <li>La primera línea describe periodo, corte y filtros; después vienen secciones separadas por una
 *       línea en blanco: indicadores, espera, estados, días y especialidades.</li>
 *   <li>Solo conteos agregados: ningún nombre, documento, correo ni código de cita o paciente.</li>
 *   <li>Los textos que empiezan con {@code = + - @} se neutralizan (inyección de fórmulas).</li>
 * </ul>
 */
final class ExportacionCsv {

    private static final byte[] BOM = {(byte) 0xEF, (byte) 0xBB, (byte) 0xBF};
    private static final String SEPARADOR = ";";
    private static final String FIN_LINEA = "\r\n";
    private static final String NO_CALCULABLE = "No calculable";
    private static final DateTimeFormatter HORA_LOCAL = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private ExportacionCsv() {
    }

    static String nombreArchivo(ResumenIndicadores resumen) {
        return "indicadores-" + resumen.periodo().desde() + "_" + resumen.periodo().hasta() + ".csv";
    }

    static byte[] generar(ResumenIndicadores r, ZoneId zona) {
        StringBuilder csv = new StringBuilder();
        linea(csv, "Indicadores operativos SIGA-SP",
                "Periodo", r.periodo().desde() + " a " + r.periodo().hasta(),
                "Corte", HORA_LOCAL.format(r.corte().atZone(zona)) + " (" + r.zonaHoraria() + ")",
                "Corte UTC", r.corte().truncatedTo(ChronoUnit.SECONDS).toString(),
                "Sede", filtro(r.filtros().sede(), "Todas"),
                "Especialidad", filtro(r.filtros().especialidad(), "Todas"),
                "Profesional", filtro(r.filtros().profesional(), "Todos"));
        csv.append(FIN_LINEA);

        var t = r.indicadores();
        linea(csv, "Indicador", "Numerador", "Denominador", "Tasa (%)", "Nota");
        indicador(csv, "Confirmación", t.confirmacion(), "Confirmada para la versión de agenda vigente al corte");
        indicador(csv, "Cancelación", t.cancelacion(), "Estado Cancelada al corte");
        IndicadorReprogramacion rep = t.reprogramacion();
        linea(csv, "Reprogramación", rep.numerador(), rep.denominador(), tasa(rep.tasa()),
                "Eventos de reprogramación: " + rep.eventos());
        IndicadorInasistencia ina = t.inasistencia();
        linea(csv, "Inasistencia", ina.numerador(), ina.denominador(), tasa(ina.tasa()),
                ina.provisional()
                        ? "Provisional: " + ina.pendientesDeClasificar() + " cita(s) pendientes de clasificar"
                        : "Definitiva");
        csv.append(FIN_LINEA);

        Espera espera = t.esperaPromedioMinutos();
        linea(csv, "Espera promedio (min)", "Observaciones válidas", "Excluidas");
        linea(csv, espera.valor() == null ? NO_CALCULABLE : espera.valor().toPlainString(),
                espera.observaciones(), espera.excluidas());
        csv.append(FIN_LINEA);

        linea(csv, "Estado", "Citas");
        for (ConteoEstado estado : r.porEstado()) {
            linea(csv, estado.etiqueta(), estado.total());
        }
        linea(csv, "Total", r.totalCitas());
        csv.append(FIN_LINEA);

        linea(csv, "Fecha", "Citas", "Completadas", "Canceladas", "No asistió");
        for (Dia dia : r.porDia()) {
            linea(csv, dia.fecha().toString(), dia.total(), dia.completadas(), dia.canceladas(), dia.noAsistio());
        }
        csv.append(FIN_LINEA);

        linea(csv, "Especialidad", "Código", "Citas", "Tasa de inasistencia (%)");
        List<PorEspecialidad> especialidades = r.porEspecialidad();
        for (PorEspecialidad e : especialidades) {
            linea(csv, e.nombre(), e.codigo(), e.total(), tasa(e.tasaInasistencia()));
        }

        ByteArrayOutputStream salida = new ByteArrayOutputStream();
        salida.writeBytes(BOM);
        salida.writeBytes(csv.toString().getBytes(StandardCharsets.UTF_8));
        return salida.toByteArray();
    }

    private static void indicador(StringBuilder csv, String nombre, Indicador indicador, String nota) {
        linea(csv, nombre, indicador.numerador(), indicador.denominador(), tasa(indicador.tasa()), nota);
    }

    private static String tasa(BigDecimal tasa) {
        return tasa == null ? NO_CALCULABLE : tasa.toPlainString();
    }

    private static String filtro(String codigo, String todos) {
        return codigo == null ? todos : codigo;
    }

    private static void linea(StringBuilder csv, Object... celdas) {
        for (int i = 0; i < celdas.length; i++) {
            if (i > 0) {
                csv.append(SEPARADOR);
            }
            csv.append(celda(celdas[i]));
        }
        csv.append(FIN_LINEA);
    }

    /** Escapa según RFC 4180 y neutraliza fórmulas en los textos (los números se escriben tal cual). */
    static String celda(Object valor) {
        if (valor == null) {
            return "";
        }
        if (valor instanceof Number numero) {
            return numero.toString();
        }
        String texto = valor.toString();
        if (!texto.isEmpty() && "=+-@\t\r".indexOf(texto.charAt(0)) >= 0) {
            texto = "'" + texto;
        }
        if (texto.contains(SEPARADOR) || texto.contains("\"") || texto.contains("\n") || texto.contains("\r")) {
            texto = "\"" + texto.replace("\"", "\"\"") + "\"";
        }
        return texto;
    }
}
