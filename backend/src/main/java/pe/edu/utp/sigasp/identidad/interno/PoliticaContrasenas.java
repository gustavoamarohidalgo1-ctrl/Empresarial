package pe.edu.utp.sigasp.identidad.interno;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.compartido.error.Problemas.ErrorCampo;

/**
 * Política de contraseñas (docs/api.md, «Ampliación v1.1»):
 * <ul>
 *   <li>de 10 a 128 caracteres;</li>
 *   <li>al menos una letra y un número;</li>
 *   <li>distinta del correo (y de la parte anterior a la arroba);</li>
 *   <li>fuera de la lista local de contraseñas comunes ({@code seguridad/contrasenas-comunes.txt}).</li>
 * </ul>
 * Devuelve todos los incumplimientos a la vez, en el campo que indique quien llama ({@code password} o
 * {@code nueva}), para que la persona los corrija en un solo intento.
 */
@Component
public class PoliticaContrasenas {

    public static final int MINIMO = 10;
    public static final int MAXIMO = 128;
    static final String RECURSO = "seguridad/contrasenas-comunes.txt";

    private final Set<String> comunes;

    PoliticaContrasenas() {
        this.comunes = cargar();
    }

    /** Incumplimientos de la política; vacío si la contraseña es aceptable. */
    public List<ErrorCampo> evaluar(String campo, String password, String email) {
        List<ErrorCampo> errores = new ArrayList<>();
        if (password == null || password.isEmpty()) {
            errores.add(new ErrorCampo(campo, "Ingresa una contraseña."));
            return errores;
        }
        int largo = password.codePointCount(0, password.length());
        if (largo < MINIMO || largo > MAXIMO) {
            errores.add(new ErrorCampo(campo,
                    "La contraseña debe tener entre " + MINIMO + " y " + MAXIMO + " caracteres."));
        }
        boolean tieneLetra = password.codePoints().anyMatch(Character::isLetter);
        boolean tieneNumero = password.codePoints().anyMatch(Character::isDigit);
        if (!tieneLetra || !tieneNumero) {
            errores.add(new ErrorCampo(campo, "La contraseña debe incluir al menos una letra y un número."));
        }
        if (igualAlCorreo(password, email)) {
            errores.add(new ErrorCampo(campo, "La contraseña no puede ser igual a tu correo."));
        }
        if (esComun(password)) {
            errores.add(new ErrorCampo(campo,
                    "Esta contraseña es muy común y fácil de adivinar. Elige una más segura."));
        }
        return errores;
    }

    boolean esComun(String password) {
        return comunes.contains(password.trim().toLowerCase(Locale.ROOT));
    }

    int totalComunes() {
        return comunes.size();
    }

    private static boolean igualAlCorreo(String password, String email) {
        if (email == null || email.isBlank()) {
            return false;
        }
        String clave = password.trim().toLowerCase(Locale.ROOT);
        String correo = email.trim().toLowerCase(Locale.ROOT);
        int arroba = correo.indexOf('@');
        String usuario = arroba > 0 ? correo.substring(0, arroba) : correo;
        return clave.equals(correo) || clave.equals(usuario);
    }

    private static Set<String> cargar() {
        Set<String> lista = new HashSet<>();
        ClassPathResource recurso = new ClassPathResource(RECURSO);
        try (BufferedReader lector = new BufferedReader(
                new InputStreamReader(recurso.getInputStream(), StandardCharsets.UTF_8))) {
            String linea;
            while ((linea = lector.readLine()) != null) {
                String limpia = linea.trim();
                if (!limpia.isEmpty() && !limpia.startsWith("#")) {
                    lista.add(limpia.toLowerCase(Locale.ROOT));
                }
            }
        } catch (IOException ex) {
            throw new UncheckedIOException("No se pudo leer la lista de contraseñas comunes", ex);
        }
        if (lista.isEmpty()) {
            throw new IllegalStateException("La lista de contraseñas comunes está vacía");
        }
        return Set.copyOf(lista);
    }
}
