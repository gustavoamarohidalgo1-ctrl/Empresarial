package pe.edu.utp.sigasp.identidad.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.identidad.interno.CambioContrasena;
import pe.edu.utp.sigasp.identidad.interno.UsuarioAutenticado;

/** Gestión de la propia cuenta (cualquier rol autenticado). */
@RestController
@RequestMapping("/api/v1/cuenta")
class CuentaController {

    private final CambioContrasena cambio;

    CuentaController(CambioContrasena cambio) {
        this.cambio = cambio;
    }

    /** Cambia la contraseña; la sesión actual continúa y las demás se cierran. */
    @PostMapping("/contrasena")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void cambiarContrasena(@RequestBody SolicitudCambio solicitud, HttpServletRequest request,
            HttpServletResponse response) {
        Authentication autenticacion = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacion == null || !(autenticacion.getPrincipal() instanceof UsuarioAutenticado usuario)) {
            throw new ApiException(CodigoError.NO_AUTENTICADO);
        }
        cambio.cambiar(usuario, solicitud.actual(), solicitud.nueva(), request, response);
    }

    record SolicitudCambio(String actual, String nueva) {

        @Override
        public String toString() {
            return "SolicitudCambio[contraseñas omitidas]";
        }
    }
}
