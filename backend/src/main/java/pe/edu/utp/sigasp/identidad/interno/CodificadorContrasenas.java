package pe.edu.utp.sigasp.identidad.interno;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.factory.PasswordEncoderFactories;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

/**
 * Codificador de contraseñas: BCrypt con sal y prefijo de algoritmo ({@code {bcrypt}}), como antes.
 * <p>
 * BCrypt solo procesa 72 bytes y Spring Security rechaza contraseñas más largas, pero la política admite
 * hasta 128 caracteres. Las que superan 72 bytes se guardan como {@code {bcrypt-sha256}}: BCrypt sobre el
 * SHA-256 de la contraseña en base64 (44 caracteres), sin perder entropía. Verificar delega por prefijo,
 * así que los hashes existentes siguen funcionando, y una contraseña demasiado larga para un hash
 * {@code {bcrypt}} simplemente no coincide (nunca produce un error 500).
 */
final class CodificadorContrasenas implements PasswordEncoder {

    static final String ID_PREHASH = "bcrypt-sha256";
    private static final int MAX_BYTES_BCRYPT = 72;

    private final PasswordEncoder porDefecto = PasswordEncoderFactories.createDelegatingPasswordEncoder();
    private final BcryptSha256 prehash = new BcryptSha256();
    private final DelegatingPasswordEncoder verificador;

    CodificadorContrasenas() {
        var codificadores = new java.util.HashMap<String, PasswordEncoder>();
        codificadores.put("bcrypt", new BCryptPasswordEncoder());
        codificadores.put(ID_PREHASH, prehash);
        this.verificador = new DelegatingPasswordEncoder("bcrypt", codificadores);
        this.verificador.setDefaultPasswordEncoderForMatches(porDefecto);
    }

    @Override
    public String encode(CharSequence raw) {
        if (raw.toString().getBytes(StandardCharsets.UTF_8).length > MAX_BYTES_BCRYPT) {
            return "{" + ID_PREHASH + "}" + prehash.encode(raw);
        }
        return porDefecto.encode(raw);
    }

    @Override
    public boolean matches(CharSequence raw, String codificada) {
        if (raw == null || codificada == null) {
            return false;
        }
        try {
            return verificador.matches(raw, codificada);
        } catch (IllegalArgumentException ex) {
            // Contraseña de más de 72 bytes contra un hash {bcrypt}, o hash con formato desconocido.
            return false;
        }
    }

    @Override
    public boolean upgradeEncoding(String codificada) {
        return false;
    }

    /** BCrypt sobre base64(SHA-256(contraseña)). */
    private static final class BcryptSha256 implements PasswordEncoder {

        private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

        @Override
        public String encode(CharSequence raw) {
            return bcrypt.encode(resumen(raw));
        }

        @Override
        public boolean matches(CharSequence raw, String codificada) {
            return bcrypt.matches(resumen(raw), codificada);
        }

        private static String resumen(CharSequence raw) {
            try {
                byte[] digest = MessageDigest.getInstance("SHA-256")
                        .digest(raw.toString().getBytes(StandardCharsets.UTF_8));
                return Base64.getEncoder().encodeToString(digest);
            } catch (NoSuchAlgorithmException ex) {
                throw new IllegalStateException("SHA-256 no disponible", ex);
            }
        }
    }
}
