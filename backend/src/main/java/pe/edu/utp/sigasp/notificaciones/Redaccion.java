package pe.edu.utp.sigasp.notificaciones;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Locale;
import java.util.Optional;

import pe.edu.utp.sigasp.citas.CitaActualizada;
import pe.edu.utp.sigasp.citas.CitaVigente;

/**
 * Títulos y mensajes de las notificaciones al paciente, en español de Perú y con la fecha en la zona de la
 * sede. Nunca incluyen el nombre del paciente ni datos clínicos: solo la cita, la especialidad, el
 * profesional, la sede y la hora.
 */
final class Redaccion {

    static final String TITULO_RECORDATORIO = "Recordatorio de tu cita";
    private static final int MAX_CONTENIDO = 500;

    private final ZoneId zona;
    private final DateTimeFormatter fecha;
    private final DateTimeFormatter hora;

    Redaccion(ZoneId zona) {
        Locale peru = Locale.forLanguageTag("es-PE");
        this.zona = zona;
        this.fecha = DateTimeFormatter.ofPattern("EEEE dd/MM/yyyy", peru).withZone(zona);
        this.hora = DateTimeFormatter.ofPattern("HH:mm", peru).withZone(zona);
    }

    /** Título visible según el tipo de notificación y el evento que la originó (columna {@code ventana}). */
    static String titulo(String tipo, String ventana) {
        if ("RECORDATORIO".equals(tipo)) {
            return TITULO_RECORDATORIO;
        }
        return switch (ventana == null ? "" : ventana) {
            case "CREADA" -> "Reserva registrada";
            case "CONFIRMADA" -> "Asistencia confirmada";
            case "REPROGRAMADA" -> "Cita reprogramada";
            case "CANCELADA" -> "Cita cancelada";
            default -> "Actualización de tu cita";
        };
    }

    /**
     * Aviso de un cambio confirmado. La hora es la del evento (la vigente tras el cambio); especialidad,
     * profesional y sede se toman de la cita si está disponible.
     */
    String aviso(CitaActualizada evento, Optional<CitaVigente> cita) {
        String codigo = evento.codigo();
        String especialidad = cita.map(c -> " de " + c.especialidad()).orElse("");
        String profesional = cita.map(c -> ", con " + c.profesional()).orElse("");
        String sede = cita.map(c -> " en " + c.sede()).orElse("");
        String cuando = fecha.format(evento.inicio()) + " a las " + hora.format(evento.inicio());
        String texto = switch (evento.tipoEvento()) {
            case "CREADA" -> "Tu cita " + codigo + especialidad + " quedó registrada para el " + cuando + sede
                    + profesional + ". Te enviaremos un recordatorio un día antes.";
            case "CONFIRMADA" -> "Confirmaste tu asistencia a la cita " + codigo + especialidad + " del " + cuando
                    + sede + ". Al llegar, registra tu llegada en la aplicación o en recepción.";
            case "REPROGRAMADA" -> "Tu cita " + codigo + especialidad + " se reprogramó para el " + cuando + sede
                    + profesional + ". Confírmala para asegurar tu atención.";
            case "CANCELADA" -> "Tu cita " + codigo + especialidad + " del " + cuando
                    + " fue cancelada y el horario quedó libre. Si lo necesitas, puedes reservar una nueva cita.";
            default -> "Tu cita " + codigo + especialidad + " del " + cuando + " tiene una actualización.";
        };
        return recortar(texto);
    }

    /** Recordatorio previo: «hoy», «mañana, jueves 05/11/2026,» o «el jueves 05/11/2026», según cuándo se envía. */
    String recordatorio(CitaVigente cita, Instant enviadoEn) {
        LocalDate diaEnvio = enviadoEn.atZone(zona).toLocalDate();
        LocalDate diaCita = cita.inicio().atZone(zona).toLocalDate();
        long dias = ChronoUnit.DAYS.between(diaEnvio, diaCita);
        String cuando;
        if (dias == 0) {
            cuando = "hoy a las " + hora.format(cita.inicio());
        } else if (dias == 1) {
            cuando = "mañana, " + fecha.format(cita.inicio()) + ", a las " + hora.format(cita.inicio());
        } else {
            cuando = "el " + fecha.format(cita.inicio()) + " a las " + hora.format(cita.inicio());
        }
        return recortar("Tienes la cita " + cita.codigo() + " de " + cita.especialidad() + " " + cuando + " en "
                + cita.sede() + ", con " + cita.profesional()
                + ". Te recomendamos llegar con anticipación y registrar tu llegada al ingresar.");
    }

    private static String recortar(String texto) {
        return texto.length() > MAX_CONTENIDO ? texto.substring(0, MAX_CONTENIDO - 1) + "…" : texto;
    }
}
