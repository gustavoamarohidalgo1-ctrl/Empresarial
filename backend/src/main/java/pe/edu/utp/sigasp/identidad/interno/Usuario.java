package pe.edu.utp.sigasp.identidad.interno;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/** Cuenta de acceso. Las contraseñas se guardan solo como hash (BCrypt con sal). */
@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String email;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    @Column(name = "nombre_visible", nullable = false)
    private String nombreVisible;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Rol rol;

    @Column(nullable = false)
    private boolean activo;

    @Column(name = "paciente_id")
    private UUID pacienteId;

    @Column(name = "creado_en", nullable = false)
    private Instant creadoEn;

    /**
     * Versión de las credenciales: avanza al cambiar o restablecer la contraseña. Una sesión autenticada con una
     * versión anterior deja de valer.
     */
    @Column(name = "version_credenciales", nullable = false)
    private int versionCredenciales;

    /** Instante real del último cambio o restablecimiento de la contraseña (solo informativo). */
    @Column(name = "credenciales_cambiadas_en")
    private Instant credencialesCambiadasEn;

    protected Usuario() {
    }

    public int getVersionCredenciales() {
        return versionCredenciales;
    }

    public Instant getCredencialesCambiadasEn() {
        return credencialesCambiadasEn;
    }

    public UUID getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public String getNombreVisible() {
        return nombreVisible;
    }

    public Rol getRol() {
        return rol;
    }

    public boolean isActivo() {
        return activo;
    }

    public UUID getPacienteId() {
        return pacienteId;
    }
}
