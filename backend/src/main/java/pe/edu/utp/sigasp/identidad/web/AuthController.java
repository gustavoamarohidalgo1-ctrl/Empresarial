package pe.edu.utp.sigasp.identidad.web;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.identidad.interno.InicioSesion;
import pe.edu.utp.sigasp.identidad.interno.RecuperacionCuentas;
import pe.edu.utp.sigasp.identidad.interno.RegistroCuentas;
import pe.edu.utp.sigasp.identidad.interno.RegistroCuentas.DatosRegistro;
import pe.edu.utp.sigasp.identidad.interno.UsuarioAutenticado;

@RestController
@RequestMapping("/api/v1/auth")
class AuthController {

    private final InicioSesion inicioSesion;
    private final RegistroCuentas registro;
    private final RecuperacionCuentas recuperacion;

    AuthController(InicioSesion inicioSesion, RegistroCuentas registro, RecuperacionCuentas recuperacion) {
        this.inicioSesion = inicioSesion;
        this.registro = registro;
        this.recuperacion = recuperacion;
    }

    /** Emite el token CSRF (y su cookie). El frontend lo llama antes del primer POST. */
    @GetMapping("/csrf")
    TokenCsrf csrf(CsrfToken token) {
        return new TokenCsrf(token.getHeaderName(), token.getToken());
    }

    @PostMapping("/login")
    UsuarioSesion login(@Valid @RequestBody SolicitudLogin solicitud, HttpServletRequest request,
            HttpServletResponse response) {
        return UsuarioSesion.de(inicioSesion.iniciar(solicitud.email(), solicitud.password(), request, response));
    }

    @GetMapping("/sesion")
    UsuarioSesion sesion() {
        Authentication autenticacion = SecurityContextHolder.getContext().getAuthentication();
        if (autenticacion != null && autenticacion.getPrincipal() instanceof UsuarioAutenticado usuario) {
            return UsuarioSesion.de(usuario);
        }
        throw new ApiException(CodigoError.NO_AUTENTICADO);
    }

    /**
     * Crea la cuenta de un paciente y deja la sesión iniciada. Todos los campos se validan en el servicio,
     * que devuelve los errores juntos (incluida la política de contraseñas).
     */
    @PostMapping("/registro")
    @ResponseStatus(HttpStatus.CREATED)
    UsuarioSesion registro(@RequestBody SolicitudRegistro solicitud, HttpServletRequest request,
            HttpServletResponse response) {
        return UsuarioSesion.de(registro.registrar(solicitud.comoDatos(), request.getRemoteAddr(), request, response));
    }

    /**
     * Siempre 202: la respuesta no revela si el correo tiene una cuenta. El origen de la solicitud solo se usa para
     * el enlace del correo cuando no hay {@code sigasp.correo.url-base}.
     */
    @PostMapping("/recuperacion")
    @ResponseStatus(HttpStatus.ACCEPTED)
    void recuperacion(@RequestBody SolicitudRecuperacion solicitud, HttpServletRequest request) {
        recuperacion.solicitar(solicitud.email(), request.getRemoteAddr(),
                ServletUriComponentsBuilder.fromContextPath(request).build().toUriString());
    }

    @PostMapping("/restablecer")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void restablecer(@RequestBody SolicitudRestablecer solicitud) {
        recuperacion.restablecer(solicitud.token(), solicitud.password());
    }

    record SolicitudLogin(
            @NotBlank(message = "Ingresa tu correo") @Size(max = 160) String email,
            @NotBlank(message = "Ingresa tu contraseña") @Size(max = 128) String password) {

        @Override
        public String toString() {
            return "SolicitudLogin[email=" + email + ", password=****]";
        }
    }

    record SolicitudRegistro(String nombres, String apellidos, String email, String telefono, String password,
            Boolean aceptaPrivacidad) {

        DatosRegistro comoDatos() {
            return new DatosRegistro(nombres, apellidos, email, telefono, password, aceptaPrivacidad);
        }

        @Override
        public String toString() {
            return "SolicitudRegistro[datos personales y contraseña omitidos]";
        }
    }

    record SolicitudRecuperacion(String email) {
    }

    record SolicitudRestablecer(String token, String password) {

        @Override
        public String toString() {
            return "SolicitudRestablecer[token y contraseña omitidos]";
        }
    }

    record TokenCsrf(String headerName, String token) {
    }

    record UsuarioSesion(String id, String nombre, String email, String rol) {
        static UsuarioSesion de(UsuarioAutenticado usuario) {
            return new UsuarioSesion(usuario.id().toString(), usuario.nombre(), usuario.getUsername(),
                    usuario.rol().name());
        }
    }
}
