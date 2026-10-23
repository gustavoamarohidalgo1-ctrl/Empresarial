package pe.edu.utp.sigasp.analitica.web;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ExportacionCsvTest {

    @Test
    @DisplayName("Celdas: escapa «;», comillas y saltos (RFC 4180) y neutraliza fórmulas de hoja de cálculo")
    void celdas() {
        assertThat(ExportacionCsv.celda("Cardiología")).isEqualTo("Cardiología");
        assertThat(ExportacionCsv.celda("Sede; Norte")).isEqualTo("\"Sede; Norte\"");
        assertThat(ExportacionCsv.celda("Dice \"hola\"")).isEqualTo("\"Dice \"\"hola\"\"\"");
        assertThat(ExportacionCsv.celda("dos\nlíneas")).isEqualTo("\"dos\nlíneas\"");
        assertThat(ExportacionCsv.celda("=HYPERLINK(\"x\")")).isEqualTo("\"'=HYPERLINK(\"\"x\"\")\"");
        assertThat(ExportacionCsv.celda("+51")).isEqualTo("'+51");
        assertThat(ExportacionCsv.celda("@SUM(A1)")).isEqualTo("'@SUM(A1)");
        assertThat(ExportacionCsv.celda(-3L)).isEqualTo("-3");
        assertThat(ExportacionCsv.celda(null)).isEmpty();
    }
}
