/**
 * M1 · Identidad y acceso: autenticación con sesión de servidor, CSRF, autorización por rol
 * y bloqueo temporal por intentos fallidos. Expone el actor autenticado mediante
 * {@link pe.edu.utp.sigasp.compartido.seguridad.ActorActual}.
 * <p>
 * v1.1: registro de pacientes (crea la ficha por la API del módulo de pacientes), recuperación de
 * contraseña con enlace de un solo uso enviado por el módulo de correo, cambio de contraseña y
 * revalidación de la sesión en cada solicitud (una sesión anterior al último cambio de credenciales
 * deja de valer).
 */
@ApplicationModule(displayName = "Identidad y acceso")
package pe.edu.utp.sigasp.identidad;

import org.springframework.modulith.ApplicationModule;
