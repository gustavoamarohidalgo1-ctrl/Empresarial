package pe.edu.utp.sigasp.citas.dominio;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

/**
 * Versión de agenda: el horario conocido de la cita durante un intervalo de vigencia.
 * Permite reconstruir qué horario tenía la cita en cualquier corte temporal.
 */
@Entity
@Table(name = "cita_version_agenda")
public class VersionAgenda {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cita_id")
    private Cita cita;

    @Column(nullable = false)
    private int numero;

    @Column(name = "horario_id")
    private UUID horarioId;

    @Column(name = "profesional_id", nullable = false)
    private UUID profesionalId;

    @Column(name = "sede_id", nullable = false)
    private UUID sedeId;

    @Column(nullable = false)
    private Instant inicio;

    @Column(nullable = false)
    private Instant fin;

    @Column(name = "vigente_desde", nullable = false)
    private Instant vigenteDesde;

    @Column(name = "vigente_hasta")
    private Instant vigenteHasta;

    protected VersionAgenda() {
    }

    VersionAgenda(Cita cita, int numero, HorarioAsignado horario, Instant vigenteDesde) {
        this.id = UUID.randomUUID();
        this.cita = cita;
        this.numero = numero;
        this.horarioId = horario.horarioId();
        this.profesionalId = horario.profesionalId();
        this.sedeId = horario.sedeId();
        this.inicio = horario.inicio();
        this.fin = horario.fin();
        this.vigenteDesde = vigenteDesde;
    }

    void cerrar(Instant ahora) {
        this.vigenteHasta = ahora;
    }

    public boolean esVigente() {
        return vigenteHasta == null;
    }

    public int numero() {
        return numero;
    }

    public UUID horarioId() {
        return horarioId;
    }

    public UUID profesionalId() {
        return profesionalId;
    }

    public UUID sedeId() {
        return sedeId;
    }

    public Instant inicio() {
        return inicio;
    }

    public Instant fin() {
        return fin;
    }

    public Instant vigenteDesde() {
        return vigenteDesde;
    }

    public Instant vigenteHasta() {
        return vigenteHasta;
    }
}
