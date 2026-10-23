package pe.edu.utp.sigasp.pacientes.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import pe.edu.utp.sigasp.pacientes.Perfiles;
import pe.edu.utp.sigasp.pacientes.Perfiles.Perfil;

@RestController
@RequestMapping("/api/v1/pacientes/me/perfil")
class PerfilController {

    private final Perfiles perfiles;
    private final ActorActual actorActual;

    PerfilController(Perfiles perfiles, ActorActual actorActual) {
        this.perfiles = perfiles;
        this.actorActual = actorActual;
    }

    @GetMapping
    Perfil consultar() {
        return perfiles.consultar(actorActual.requerido());
    }

    @PatchMapping
    Perfil actualizar(@Valid @RequestBody CambioPerfil cambio) {
        return perfiles.actualizar(actorActual.requerido(), cambio.email(), cambio.telefono());
    }

    /**
     * Solo campos de contacto; cualquier otro campo del cuerpo se ignora. Un campo ausente no cambia;
     * uno presente no puede quedar vacío (los patrones rechazan cadenas vacías o con solo espacios).
     */
    record CambioPerfil(
            @Pattern(regexp = "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", message = "Formato de correo inválido")
            @Size(max = 160) String email,
            @Pattern(regexp = "^\\+?[0-9](?: ?[0-9]){6,19}$", message = "Formato de teléfono inválido")
            @Size(max = 30) String telefono) {
    }
}
