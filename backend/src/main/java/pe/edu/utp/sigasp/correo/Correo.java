package pe.edu.utp.sigasp.correo;

/**
 * Envío de correos transaccionales (recuperación de contraseña, avisos de cuenta).
 * <p>
 * La implementación actual es simulada: participa de la transacción en curso, de modo que si la
 * operación que originó el correo se revierte, el correo tampoco queda registrado.
 */
public interface Correo {

    /**
     * @param destinatario correo del destinatario
     * @param asunto       asunto (hasta 200 caracteres)
     * @param cuerpo       texto plano del mensaje
     * @param enlace       enlace de acción relativo a la aplicación (por ejemplo {@code /restablecer?token=…}),
     *                     o {@code null} si el mensaje no tiene uno
     */
    void enviar(String destinatario, String asunto, String cuerpo, String enlace);
}
