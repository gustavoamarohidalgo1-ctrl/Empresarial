package pe.edu.utp.sigasp.auditoria.web;

import java.time.LocalDate;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.auditoria.ConsultaBitacora;
import pe.edu.utp.sigasp.auditoria.FiltroBitacora;
import pe.edu.utp.sigasp.auditoria.PaginaBitacora;
import pe.edu.utp.sigasp.auditoria.ResultadoAuditoria;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Bitácora para el ADMINISTRADOR (PB25, HU17). Solo existe el GET: no hay rutas para crear,
 * modificar ni borrar entradas. La regla de ruta {@code /api/v1/admin/**} ya exige el rol; el
 * controlador lo verifica otra vez (defensa en profundidad).
 */
@RestController
@RequestMapping("/api/v1/admin/auditoria")
class BitacoraController {

    private final ConsultaBitacora bitacora;
    private final ActorActual actorActual;

    BitacoraController(ConsultaBitacora bitacora, ActorActual actorActual) {
        this.bitacora = bitacora;
        this.actorActual = actorActual;
    }

    @GetMapping
    PaginaBitacora consultar(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
            @RequestParam(required = false) String accion,
            @RequestParam(required = false) ResultadoAuditoria resultado,
            @RequestParam(required = false) String usuario,
            @RequestParam(defaultValue = "0") int pagina,
            @RequestParam(defaultValue = "" + ConsultaBitacora.TAMANO_POR_DEFECTO) int tamano) {
        if (!actorActual.requerido().es(Rol.ADMINISTRADOR)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
        return bitacora.buscar(new FiltroBitacora(desde, hasta, accion, resultado, usuario, pagina, tamano));
    }
}
