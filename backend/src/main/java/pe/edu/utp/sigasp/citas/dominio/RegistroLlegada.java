package pe.edu.utp.sigasp.citas.dominio;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;

/** Llegada del paciente: única por cita (la BD lo garantiza con UNIQUE(cita_id)). */
@Entity
@Table(name = "registro_llegada")
public class RegistroLlegada {

    @Id
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cita_id")
    private Cita cita;

    @Column(name = "version_agenda", nullable = false)
    private int versionAgenda;

    @Column(name = "registrado_en", nullable = false)
    private Instant registradoEn;

    @Column(name = "registrado_por", nullable = false)
    private UUID registradoPor;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TipoActor canal;

    protected RegistroLlegada() {
    }

    RegistroLlegada(Cita cita, int versionAgenda, Contexto contexto) {
        this.id = UUID.randomUUID();
        this.cita = cita;
        this.versionAgenda = versionAgenda;
        this.registradoEn = contexto.ahora();
        this.registradoPor = contexto.actor().usuarioId();
        this.canal = contexto.actor().tipo();
    }

    public Instant registradoEn() {
        return registradoEn;
    }

    public TipoActor canal() {
        return canal;
    }
}
