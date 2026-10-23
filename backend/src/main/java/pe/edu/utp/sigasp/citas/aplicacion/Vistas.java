package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Modelos de lectura que expone la API de citas (ver docs/api.md). */
public final class Vistas {

    private Vistas() {
    }

    public record Referencia(String codigo, String nombre) {
    }

    public record CitaResumen(UUID id, String codigo, String estado, String estadoEtiqueta, Instant inicio,
            Instant fin, int versionAgenda, Referencia sede, Referencia especialidad, Referencia profesional) {
    }

    public record VentanaLlegada(Instant desde, Instant hasta) {
    }

    public record MotivoVista(String codigo, String descripcion) {
    }

    public record CitaDetalle(UUID id, String codigo, String estado, String estadoEtiqueta, Instant inicio,
            Instant fin, int versionAgenda, Referencia sede, Referencia especialidad, Referencia profesional,
            String zonaHoraria, List<String> accionesPermitidas, VentanaLlegada ventanaLlegada,
            Instant confirmadaEn, Instant preCheckInCompletadoEn, Instant llegadaRegistradaEn,
            MotivoVista motivoCancelacion) {
    }

    public record EventoLineaTiempo(long secuencia, String tipo, Instant ocurridoEn, String titulo,
            String descripcion) {
    }

    public record HorarioDisponible(UUID id, Instant inicio, Instant fin, Referencia sede, Referencia profesional) {
    }

    /** Horario libre para reservar una cita nueva (GET /pacientes/me/disponibilidad). */
    public record HorarioReservable(UUID horarioId, Instant inicio, Instant fin, Referencia profesional,
            Referencia sede) {
    }

    public record CitaOperador(UUID id, String codigo, Instant inicio, String estado, String estadoEtiqueta,
            String pacienteNombre, Referencia profesional, Referencia especialidad, long versionCita,
            List<String> accionesPermitidas, Instant llegadaRegistradaEn) {
    }

    public enum Alcance {
        PROXIMAS,
        HISTORIAL
    }
}
