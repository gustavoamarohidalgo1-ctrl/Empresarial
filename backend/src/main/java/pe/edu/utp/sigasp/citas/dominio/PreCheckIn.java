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
 * Datos previos confirmados por el paciente para una versión de agenda. Preparar no acredita
 * presencia: la llegada es una entidad distinta. Reprogramar invalida el de la versión anterior.
 */
@Entity
@Table(name = "pre_check_in")
public class PreCheckIn {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "cita_id")
    private Cita cita;

    @Column(name = "version_agenda", nullable = false)
    private int versionAgenda;

    @Column(name = "email_contacto", nullable = false)
    private String emailContacto;

    @Column(name = "telefono_contacto", nullable = false)
    private String telefonoContacto;

    @Column(name = "completado_en", nullable = false)
    private Instant completadoEn;

    @Column(name = "invalidado_en")
    private Instant invalidadoEn;

    protected PreCheckIn() {
    }

    PreCheckIn(Cita cita, int versionAgenda, String emailContacto, String telefonoContacto, Instant completadoEn) {
        this.id = UUID.randomUUID();
        this.cita = cita;
        this.versionAgenda = versionAgenda;
        this.emailContacto = emailContacto;
        this.telefonoContacto = telefonoContacto;
        this.completadoEn = completadoEn;
    }

    void invalidar(Instant ahora) {
        if (invalidadoEn == null) {
            invalidadoEn = ahora;
        }
    }

    public boolean esValidoPara(int version) {
        return versionAgenda == version && invalidadoEn == null;
    }

    public int versionAgenda() {
        return versionAgenda;
    }

    public Instant completadoEn() {
        return completadoEn;
    }

    public Instant invalidadoEn() {
        return invalidadoEn;
    }
}
