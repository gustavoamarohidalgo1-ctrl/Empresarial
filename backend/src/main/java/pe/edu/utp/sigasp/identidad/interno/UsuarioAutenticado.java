package pe.edu.utp.sigasp.identidad.interno;

import java.io.Serial;
import java.io.Serializable;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Principal guardado en la sesión HTTP. Solo contiene datos de identidad, la <b>versión de credenciales</b> con la
 * que se autenticó (si después se cambia o restablece la contraseña, la versión del usuario avanza y la sesión deja
 * de valer) y, como dato informativo, el instante real de autenticación. El hash se borra tras autenticar
 * ({@link #eraseCredentials()}).
 */
public final class UsuarioAutenticado implements UserDetails, CredentialsContainer, Serializable {

    @Serial
    private static final long serialVersionUID = 3L;

    private final UUID id;
    private final String email;
    private final String nombre;
    private final Rol rol;
    private final UUID pacienteId;
    private final boolean activo;
    private final int versionCredenciales;
    private final Instant autenticadoEn;
    private String passwordHash;

    UsuarioAutenticado(Usuario usuario, Instant autenticadoEn) {
        this(usuario.getId(), usuario.getEmail(), usuario.getNombreVisible(), usuario.getRol(),
                usuario.getPacienteId(), usuario.isActivo(), usuario.getVersionCredenciales(), autenticadoEn,
                usuario.getPasswordHash());
    }

    private UsuarioAutenticado(UUID id, String email, String nombre, Rol rol, UUID pacienteId, boolean activo,
            int versionCredenciales, Instant autenticadoEn, String passwordHash) {
        this.id = id;
        this.email = email;
        this.nombre = nombre;
        this.rol = rol;
        this.pacienteId = pacienteId;
        this.activo = activo;
        this.versionCredenciales = versionCredenciales;
        this.autenticadoEn = autenticadoEn;
        this.passwordHash = passwordHash;
    }

    /** Principal de una cuenta recién creada (registro): versión de credenciales inicial y sin hash. */
    static UsuarioAutenticado nuevo(UUID id, String email, String nombre, Rol rol, UUID pacienteId,
            Instant autenticadoEn) {
        return new UsuarioAutenticado(id, email, nombre, rol, pacienteId, true, RegistroCredenciales.VERSION_INICIAL,
                autenticadoEn, null);
    }

    /** El mismo usuario con credenciales nuevas (tras cambiar su contraseña en esta sesión). */
    UsuarioAutenticado reautenticado(int nuevaVersion, Instant instante) {
        return new UsuarioAutenticado(id, email, nombre, rol, pacienteId, activo, nuevaVersion, instante, null);
    }

    public UUID id() {
        return id;
    }

    public String nombre() {
        return nombre;
    }

    public Rol rol() {
        return rol;
    }

    /** Versión de credenciales con la que se autenticó esta sesión. */
    public int versionCredenciales() {
        return versionCredenciales;
    }

    /** Instante real (reloj de seguridad) en que se inició esta sesión o se reautenticó; solo informativo. */
    public Instant autenticadoEn() {
        return autenticadoEn;
    }

    public Actor comoActor() {
        return new Actor(id, rol, pacienteId, nombre);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of(new SimpleGrantedAuthority(rol.autoridad()));
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return email;
    }

    @Override
    public boolean isEnabled() {
        return activo;
    }

    @Override
    public void eraseCredentials() {
        passwordHash = null;
    }
}
