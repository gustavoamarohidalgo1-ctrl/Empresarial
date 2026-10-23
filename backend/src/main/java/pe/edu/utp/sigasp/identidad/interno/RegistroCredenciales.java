package pe.edu.utp.sigasp.identidad.interno;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

/**
 * Versión vigente de las credenciales de cada usuario ({@code usuario.version_credenciales}), para decidir en
 * cada solicitud si una sesión sigue vigente: una sesión autenticada con una versión <b>anterior</b> ya no vale.
 * <p>
 * Es un contador y no un instante: no depende de ningún reloj (ni del de negocio, que en desarrollo se puede
 * simular, ni del de seguridad), así que adelantar o retroceder la hora nunca revive ni revoca sesiones por error.
 * <p>
 * Se guarda en una caché en memoria para no consultar la BD en cada solicitud: se llena al iniciar sesión (al
 * cargar el usuario) y se actualiza al cambiar o restablecer la contraseña; si falta un usuario, se lee de la BD
 * una vez. Los valores solo avanzan (máximo), así que una lectura atrasada nunca «revive» sesiones. Como el
 * bloqueo por intentos, supone una sola instancia; con varias, la caché debe pasar a un almacén compartido o
 * leerse siempre de la BD.
 */
@Component
class RegistroCredenciales {

    /** Versión de una cuenta cuya contraseña nunca cambió. */
    static final int VERSION_INICIAL = 0;
    static final int MAXIMO_EN_MEMORIA = 10_000;

    private final JdbcClient jdbc;
    private final Map<UUID, Integer> versiones = new ConcurrentHashMap<>();

    RegistroCredenciales(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Una sesión autenticada con {@code versionSesion} es válida si no es anterior a la versión vigente. */
    boolean sesionVigente(UUID usuarioId, int versionSesion) {
        return versionSesion >= versionVigente(usuarioId);
    }

    int versionVigente(UUID usuarioId) {
        Integer conocida = versiones.get(usuarioId);
        if (conocida != null) {
            return conocida;
        }
        // Un usuario que ya no existe no tiene sesiones válidas: cualquier versión de sesión queda atrás.
        int leida = jdbc.sql("SELECT version_credenciales FROM usuario WHERE id = :id")
                .param("id", usuarioId)
                .query(Integer.class)
                .optional()
                .orElse(Integer.MAX_VALUE);
        return leida == Integer.MAX_VALUE ? leida : recordar(usuarioId, leida);
    }

    /** Registra una versión conocida (la leída al iniciar sesión o la nueva tras un cambio) y devuelve la vigente. */
    int recordar(UUID usuarioId, int version) {
        if (versiones.size() >= MAXIMO_EN_MEMORIA) {
            // Es solo una caché: vaciarla obliga a releer de la BD, nunca acepta una sesión inválida.
            versiones.clear();
        }
        return versiones.merge(usuarioId, version, Math::max);
    }
}
