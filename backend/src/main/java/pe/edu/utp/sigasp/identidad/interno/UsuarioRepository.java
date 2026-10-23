package pe.edu.utp.sigasp.identidad.interno;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

interface UsuarioRepository extends JpaRepository<Usuario, UUID> {

    @Query("select u from Usuario u where lower(u.email) = lower(?1)")
    Optional<Usuario> buscarPorEmail(String email);
}
