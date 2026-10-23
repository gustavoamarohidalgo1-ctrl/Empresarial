package pe.edu.utp.sigasp.catalogo.web;

import java.time.Duration;
import java.util.List;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pe.edu.utp.sigasp.catalogo.CatalogoAtencion;
import pe.edu.utp.sigasp.catalogo.Motivos;
import pe.edu.utp.sigasp.catalogo.TipoMotivo;

@RestController
@RequestMapping("/api/v1/catalogos")
class CatalogoController {

    /**
     * El catálogo casi no cambia: el navegador puede reutilizarlo 5 minutos. Es {@code private}
     * porque exige sesión (ningún intermediario debe guardarlo). El resto de la API no se cachea.
     */
    static final CacheControl CACHE_MOTIVOS = CacheControl.maxAge(Duration.ofMinutes(5)).cachePrivate();

    private final Motivos motivos;
    private final CatalogoAtencion catalogo;

    CatalogoController(Motivos motivos, CatalogoAtencion catalogo) {
        this.motivos = motivos;
        this.catalogo = catalogo;
    }

    @GetMapping("/motivos")
    ResponseEntity<List<MotivoRespuesta>> motivos(@RequestParam TipoMotivo tipo) {
        List<MotivoRespuesta> respuesta = motivos.activos(tipo).stream()
                .map(m -> new MotivoRespuesta(m.codigo(), m.descripcion()))
                .toList();
        return ResponseEntity.ok().cacheControl(CACHE_MOTIVOS).body(respuesta);
    }

    /** Especialidades en orden alfabético, con una descripción breve para elegir. */
    @GetMapping("/especialidades")
    ResponseEntity<List<EspecialidadRespuesta>> especialidades() {
        List<EspecialidadRespuesta> respuesta = catalogo.especialidades().stream()
                .map(e -> new EspecialidadRespuesta(e.codigo(), e.nombre(), e.descripcion()))
                .toList();
        return ResponseEntity.ok().cacheControl(CACHE_MOTIVOS).body(respuesta);
    }

    /** Profesionales de una especialidad (o todos si no se indica), por apellido y nombre sin el tratamiento. */
    @GetMapping("/profesionales")
    ResponseEntity<List<ProfesionalRespuesta>> profesionales(@RequestParam(required = false) String especialidad) {
        List<ProfesionalRespuesta> respuesta = catalogo.profesionales(especialidad).stream()
                .map(p -> new ProfesionalRespuesta(p.codigo(), p.nombre(),
                        new Referencia(p.especialidad().codigo(), p.especialidad().nombre())))
                .toList();
        return ResponseEntity.ok().cacheControl(CACHE_MOTIVOS).body(respuesta);
    }

    @GetMapping("/sedes")
    ResponseEntity<List<SedeRespuesta>> sedes() {
        List<SedeRespuesta> respuesta = catalogo.sedes().stream()
                .map(s -> new SedeRespuesta(s.codigo(), s.nombre(), s.direccion()))
                .toList();
        return ResponseEntity.ok().cacheControl(CACHE_MOTIVOS).body(respuesta);
    }

    record MotivoRespuesta(String codigo, String descripcion) {
    }

    record Referencia(String codigo, String nombre) {
    }

    record EspecialidadRespuesta(String codigo, String nombre, String descripcion) {
    }

    record ProfesionalRespuesta(String codigo, String nombre, Referencia especialidad) {
    }

    record SedeRespuesta(String codigo, String nombre, String direccion) {
    }
}
