package pe.edu.utp.sigasp.catalogo;

/** Motivo de un catálogo sintético, sin información clínica. */
public record Motivo(String codigo, String descripcion, TipoMotivo tipo) {
}
