package pe.edu.utp.sigasp.analitica.web;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.analitica.Indicadores;
import pe.edu.utp.sigasp.analitica.ResumenIndicadores;
import pe.edu.utp.sigasp.analitica.SolicitudIndicadores;
import pe.edu.utp.sigasp.auditoria.Auditoria;
import pe.edu.utp.sigasp.auditoria.RegistroAuditoria;
import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;
import pe.edu.utp.sigasp.compartido.seguridad.Actor;
import pe.edu.utp.sigasp.compartido.seguridad.ActorActual;
import pe.edu.utp.sigasp.compartido.seguridad.Rol;

/**
 * Indicadores para RESPONSABLE y ADMINISTRADOR. La regla de ruta de {@code SeguridadConfig} ya
 * restringe el acceso; el controlador lo verifica otra vez (defensa en profundidad). Solo lectura,
 * salvo la entrada de bitácora que deja cada exportación.
 */
@RestController
@RequestMapping("/api/v1/analitica")
class AnaliticaController {

    static final MediaType TEXT_CSV = new MediaType("text", "csv", StandardCharsets.UTF_8);

    private final Indicadores indicadores;
    private final ActorActual actorActual;
    private final Auditoria auditoria;

    AnaliticaController(Indicadores indicadores, ActorActual actorActual, Auditoria auditoria) {
        this.indicadores = indicadores;
        this.actorActual = actorActual;
        this.auditoria = auditoria;
    }

    @GetMapping("/resumen")
    ResumenIndicadores resumen(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
            @RequestParam(required = false) String sede,
            @RequestParam(required = false) String especialidad,
            @RequestParam(required = false) String profesional) {
        verificarRol();
        return indicadores.resumen(new SolicitudIndicadores(desde, hasta, sede, especialidad, profesional));
    }

    @GetMapping("/resumen.csv")
    ResponseEntity<byte[]> resumenCsv(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate desde,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate hasta,
            @RequestParam(required = false) String sede,
            @RequestParam(required = false) String especialidad,
            @RequestParam(required = false) String profesional) {
        verificarRol();
        ResumenIndicadores resumen = indicadores.resumen(
                new SolicitudIndicadores(desde, hasta, sede, especialidad, profesional));
        byte[] contenido = ExportacionCsv.generar(resumen, indicadores.zona());
        auditoria.registrarIndependiente(RegistroAuditoria.exito("INDICADORES_EXPORTAR", "INDICADORES", null, null,
                detalle(resumen)));
        return ResponseEntity.ok()
                .contentType(TEXT_CSV)
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        ContentDisposition.attachment().filename(ExportacionCsv.nombreArchivo(resumen)).build().toString())
                .body(contenido);
    }

    private void verificarRol() {
        Actor actor = actorActual.requerido();
        if (!actor.es(Rol.RESPONSABLE) && !actor.es(Rol.ADMINISTRADOR)) {
            throw new ApiException(CodigoError.ACCESO_DENEGADO);
        }
    }

    /** Qué se exportó (periodo, corte y filtros); nunca el contenido. */
    private static Map<String, Object> detalle(ResumenIndicadores resumen) {
        Map<String, Object> detalle = new LinkedHashMap<>();
        detalle.put("desde", resumen.periodo().desde().toString());
        detalle.put("hasta", resumen.periodo().hasta().toString());
        detalle.put("corte", resumen.corte().toString());
        if (resumen.filtros().sede() != null) {
            detalle.put("sede", resumen.filtros().sede());
        }
        if (resumen.filtros().especialidad() != null) {
            detalle.put("especialidad", resumen.filtros().especialidad());
        }
        if (resumen.filtros().profesional() != null) {
            detalle.put("profesional", resumen.filtros().profesional());
        }
        return detalle;
    }
}
