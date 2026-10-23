package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Instant;

import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.citas.persistencia.ConsultasReserva;

/**
 * Códigos de cita con el formato {@code SP-AAAA-NNNNNN}: año local (zona de la sede) de creación y una
 * secuencia global de la BD ({@code cita_codigo_seq}). Toda cita nueva lo recibe, la registre el paciente,
 * la agenda o los datos de demostración.
 */
@Component
class CodigosCita {

    private final ConsultasReserva consultas;
    private final Ensamblador ensamblador;

    CodigosCita(ConsultasReserva consultas, Ensamblador ensamblador) {
        this.consultas = consultas;
        this.ensamblador = ensamblador;
    }

    /** Debe llamarse dentro de la transacción que crea la cita. */
    String siguiente(Instant ahora) {
        return formatear(ahora.atZone(ensamblador.reglas().zona()).getYear(), consultas.siguienteNumeroCodigo());
    }

    static String formatear(int anio, long numero) {
        return "SP-%04d-%06d".formatted(anio, numero);
    }
}
