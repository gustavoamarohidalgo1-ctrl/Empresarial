/**
 * Correo saliente. En esta versión el único canal es <b>simulado</b>: cada mensaje se registra en la tabla
 * {@code correo_simulado} y el log indica que no se envió nada. Solo en el perfil dev
 * ({@code sigasp.dev.buzon-correos=true}) se guardan el cuerpo y el enlace, y el buzón se consulta en
 * {@code GET /api/v1/dev/correos} para completar, por ejemplo, la recuperación de contraseña; en producción solo
 * quedan el asunto y el destinatario enmascarado. Un adaptador SMTP real podría implementar
 * {@link pe.edu.utp.sigasp.correo.Correo} sin cambiar a quienes lo usan.
 */
@ApplicationModule(displayName = "Correo")
package pe.edu.utp.sigasp.correo;

import org.springframework.modulith.ApplicationModule;
