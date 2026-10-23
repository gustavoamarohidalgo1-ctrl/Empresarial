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
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import org.hibernate.annotations.ColumnTransformer;
import org.hibernate.annotations.Immutable;

/**
 * Evento de la línea de tiempo. Inmutable: la BD también rechaza UPDATE y DELETE.
 * Registra acción, actor, instante del servidor, estados, versión de agenda y operación lógica.
 */
@Entity
@Immutable
@Table(name = "cita_evento")
public class EventoCita {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cita_id")
    private Cita cita;

    @Column(nullable = false)
    private long secuencia;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private TipoEventoCita tipo;

    @Column(name = "version_agenda", nullable = false)
    private int versionAgenda;

    @Enumerated(EnumType.STRING)
    @Column(name = "estado_anterior")
    private EstadoCita estadoAnterior;

    @Enumerated(EnumType.STRING)
    @Column(name = "estado_nuevo", nullable = false)
    private EstadoCita estadoNuevo;

    @Enumerated(EnumType.STRING)
    @Column(name = "actor_tipo", nullable = false)
    private TipoActor actorTipo;

    @Column(name = "actor_usuario_id")
    private UUID actorUsuarioId;

    @Column(name = "ocurrido_en", nullable = false)
    private Instant ocurridoEn;

    @Column(name = "motivo_codigo")
    private String motivoCodigo;

    @Column(name = "operacion_id")
    private UUID operacionId;

    @ColumnTransformer(write = "CAST(? AS jsonb)")
    @Column(nullable = false, columnDefinition = "jsonb")
    private String datos;

    @Column(name = "visible_paciente", nullable = false)
    private boolean visiblePaciente;

    protected EventoCita() {
    }

    EventoCita(Cita cita, long secuencia, TipoEventoCita tipo, int versionAgenda, EstadoCita estadoAnterior,
            EstadoCita estadoNuevo, Contexto contexto, String motivoCodigo, String datos, boolean visiblePaciente) {
        this.id = UUID.randomUUID();
        this.cita = cita;
        this.secuencia = secuencia;
        this.tipo = tipo;
        this.versionAgenda = versionAgenda;
        this.estadoAnterior = estadoAnterior;
        this.estadoNuevo = estadoNuevo;
        this.actorTipo = contexto.actor().tipo();
        this.actorUsuarioId = contexto.actor().usuarioId();
        this.ocurridoEn = contexto.ahora();
        this.motivoCodigo = motivoCodigo;
        this.operacionId = contexto.operacionId();
        this.datos = datos;
        this.visiblePaciente = visiblePaciente;
    }

    public UUID id() {
        return id;
    }

    public long secuencia() {
        return secuencia;
    }

    public TipoEventoCita tipo() {
        return tipo;
    }

    public int versionAgenda() {
        return versionAgenda;
    }

    public EstadoCita estadoAnterior() {
        return estadoAnterior;
    }

    public EstadoCita estadoNuevo() {
        return estadoNuevo;
    }

    public TipoActor actorTipo() {
        return actorTipo;
    }

    public UUID actorUsuarioId() {
        return actorUsuarioId;
    }

    public Instant ocurridoEn() {
        return ocurridoEn;
    }

    public String motivoCodigo() {
        return motivoCodigo;
    }

    public UUID operacionId() {
        return operacionId;
    }

    public String datos() {
        return datos;
    }

    public boolean visiblePaciente() {
        return visiblePaciente;
    }
}
