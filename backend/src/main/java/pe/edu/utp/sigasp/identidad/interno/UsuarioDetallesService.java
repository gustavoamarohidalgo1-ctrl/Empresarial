package pe.edu.utp.sigasp.identidad.interno;

import java.time.Clock;
import java.time.temporal.ChronoUnit;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import pe.edu.utp.sigasp.compartido.reloj.RelojSeguridad;

@Service
class UsuarioDetallesService implements UserDetailsService {

    private final UsuarioRepository usuarios;
    private final RegistroCredenciales credenciales;
    private final Clock reloj;

    UsuarioDetallesService(UsuarioRepository usuarios, RegistroCredenciales credenciales,
            @RelojSeguridad Clock reloj) {
        this.usuarios = usuarios;
        this.credenciales = credenciales;
        this.reloj = reloj;
    }

    /**
     * Carga el usuario para autenticarlo. El principal lleva la versión de credenciales leída, que también se
     * registra en la caché de {@link RegistroCredenciales}, y el instante real de autenticación (informativo).
     */
    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) {
        Usuario usuario = usuarios.buscarPorEmail(email.trim())
                .orElseThrow(() -> new UsernameNotFoundException("Usuario no encontrado"));
        credenciales.recordar(usuario.getId(), usuario.getVersionCredenciales());
        return new UsuarioAutenticado(usuario, reloj.instant().truncatedTo(ChronoUnit.MICROS));
    }
}
