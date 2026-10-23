package pe.edu.utp.sigasp.compartido.seguridad;

/**
 * Roles del MVP. RESPONSABLE es el responsable ambulatorio: lee indicadores, sin permisos de
 * administración (corrige la ambigüedad del documento, que lo modelaba como "Administrador lector").
 */
public enum Rol {
    PACIENTE,
    OPERADOR,
    RESPONSABLE,
    ADMINISTRADOR;

    /** Autoridad de Spring Security, por ejemplo ROLE_PACIENTE. */
    public String autoridad() {
        return "ROLE_" + name();
    }
}
