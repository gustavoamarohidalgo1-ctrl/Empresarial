package pe.edu.utp.sigasp.citas.aplicacion;

import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.springframework.stereotype.Component;

import pe.edu.utp.sigasp.catalogo.Motivos;
import pe.edu.utp.sigasp.citas.CitaActualizada;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaDetalle;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaOperador;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.CitaResumen;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.EventoLineaTiempo;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.MotivoVista;
import pe.edu.utp.sigasp.citas.aplicacion.Vistas.VentanaLlegada;
import pe.edu.utp.sigasp.citas.dominio.Cita;
import pe.edu.utp.sigasp.citas.dominio.EventoCita;
import pe.edu.utp.sigasp.citas.dominio.ReglasTiempo;
import pe.edu.utp.sigasp.citas.dominio.TipoActor;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas;
import pe.edu.utp.sigasp.citas.persistencia.ConsultasCitas.FilaCita;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;

/** Convierte el agregado y el modelo de lectura en las vistas de la API. */
@Component
class Ensamblador {

    private final ConsultasCitas consultas;
    private final Motivos motivos;
    private final ObjectMapper json;
    private final ReglasTiempo reglas;
    private final DateTimeFormatter fecha;
    private final DateTimeFormatter hora;

    Ensamblador(ConsultasCitas consultas, Motivos motivos, ObjectMapper json, ReglasCitaProperties propiedades) {
        this.consultas = consultas;
        this.motivos = motivos;
        this.json = json;
        this.reglas = propiedades.reglas();
        this.fecha = DateTimeFormatter.ofPattern("dd/MM/yyyy", Locale.forLanguageTag("es-PE")).withZone(reglas.zona());
        this.hora = DateTimeFormatter.ofPattern("HH:mm", Locale.forLanguageTag("es-PE")).withZone(reglas.zona());
    }

    ReglasTiempo reglas() {
        return reglas;
    }

    CitaResumen resumen(FilaCita fila) {
        return new CitaResumen(fila.id(), fila.codigo(), fila.estado().name(), fila.estado().etiqueta(),
                fila.inicio(), fila.fin(), fila.versionAgenda(), fila.sede(), fila.especialidad(), fila.profesional());
    }

    CitaDetalle detalle(Cita cita, Instant ahora, TipoActor actor) {
        FilaCita fila = consultas.fila(cita.id()).orElseThrow();
        Instant inicio = cita.versionVigente().inicio();
        VentanaLlegada ventana = cita.estado().esPreviaALlegada()
                ? new VentanaLlegada(reglas.aperturaLlegada(inicio), reglas.cierreLlegada(inicio))
                : null;
        MotivoVista motivo = cita.motivoCancelacion() == null ? null
                : new MotivoVista(cita.motivoCancelacion(),
                        motivos.descripcion(cita.motivoCancelacion()).orElse(cita.motivoCancelacion()));
        List<String> acciones = cita.accionesPermitidas(actor, ahora, reglas).stream().map(Enum::name).toList();
        return new CitaDetalle(cita.id(), cita.codigo(), cita.estado().name(), cita.estado().etiqueta(),
                inicio, cita.versionVigente().fin(), cita.versionAgendaVigente(), fila.sede(), fila.especialidad(),
                fila.profesional(), reglas.zona().getId(), acciones, ventana,
                cita.confirmadaEn().orElse(null),
                cita.preCheckInVigente().map(p -> p.completadoEn()).orElse(null),
                cita.llegada().map(l -> l.registradoEn()).orElse(null),
                motivo);
    }

    CitaOperador operador(Cita cita, FilaCita fila, Instant ahora) {
        List<String> acciones = cita.accionesPermitidas(TipoActor.OPERADOR, ahora, reglas).stream()
                .map(Enum::name).toList();
        return new CitaOperador(cita.id(), cita.codigo(), cita.versionVigente().inicio(), cita.estado().name(),
                cita.estado().etiqueta(), fila.pacienteNombre(), fila.profesional(), fila.especialidad(),
                cita.version(), acciones, cita.llegada().map(l -> l.registradoEn()).orElse(null));
    }

    /**
     * Línea de tiempo apta para el paciente: sin actores internos ni datos técnicos (HU07). Cada
     * motivo se consulta una sola vez aunque se repita en varios eventos.
     */
    List<EventoLineaTiempo> lineaTiempo(Cita cita) {
        Map<String, String> motivosVistos = new HashMap<>();
        return cita.eventos().stream()
                .filter(EventoCita::visiblePaciente)
                .map(evento -> eventoPaciente(evento, motivosVistos))
                .toList();
    }

    CitaActualizada eventoIntegracion(Cita cita) {
        EventoCita ultimo = cita.eventos().getLast();
        return new CitaActualizada(cita.id(), cita.codigo(), cita.pacienteId(), ultimo.tipo().name(),
                cita.versionAgendaVigente(), cita.estado().name(), cita.versionVigente().inicio(),
                ultimo.ocurridoEn());
    }

    Map<String, Object> detalleAuditoria(Cita cita) {
        return Map.of("codigo", cita.codigo(), "estado", cita.estado().name(),
                "versionAgenda", cita.versionAgendaVigente());
    }

    private EventoLineaTiempo eventoPaciente(EventoCita evento, Map<String, String> motivosVistos) {
        JsonNode datos = json.readTree(evento.datos());
        String titulo;
        String descripcion;
        switch (evento.tipo()) {
            case CREADA -> {
                titulo = "Cita registrada";
                descripcion = "Tu cita fue registrada para el " + cuando(datos.path("inicio").asString()) + ".";
            }
            case CONFIRMADA -> {
                titulo = "Asistencia confirmada";
                descripcion = "Confirmaste que asistirás. Esto no registra tu llegada.";
            }
            case CANCELADA -> {
                titulo = "Cita cancelada";
                descripcion = "Cancelaste la cita. Motivo: " + motivo(evento.motivoCodigo(), motivosVistos) + ".";
            }
            case REPROGRAMADA -> {
                titulo = "Cita reprogramada";
                descripcion = "Tu cita cambió del " + cuando(datos.path("inicioAnterior").asString()) + " al "
                        + cuando(datos.path("inicioNuevo").asString())
                        + ". Si deseas, confírmala nuevamente. Motivo: "
                        + motivo(evento.motivoCodigo(), motivosVistos) + ".";
            }
            case PRE_CHECK_IN_COMPLETADO -> {
                titulo = "Pre-check-in completado";
                descripcion = "Confirmaste tus datos previos. Esto no registra tu llegada.";
            }
            case LLEGADA_REGISTRADA -> {
                titulo = "Llegada registrada";
                descripcion = "Se registró tu llegada a la sede.";
            }
            case EN_ESPERA -> {
                titulo = "En espera";
                descripcion = "Estás en espera para tu atención.";
            }
            case EN_ATENCION -> {
                titulo = "En atención";
                descripcion = "Tu atención está en curso.";
            }
            case COMPLETADA -> {
                titulo = "Atención completada";
                descripcion = "Tu atención finalizó.";
            }
            case NO_ASISTIO -> {
                titulo = "Inasistencia registrada";
                descripcion = "La cita se cerró porque no se registró tu llegada a tiempo.";
            }
            default -> throw new IllegalStateException("Evento sin texto: " + evento.tipo());
        }
        return new EventoLineaTiempo(evento.secuencia(), evento.tipo().name(), evento.ocurridoEn(), titulo,
                descripcion);
    }

    private String cuando(String instanteIso) {
        Instant instante = Instant.parse(instanteIso);
        return fecha.format(instante) + " a las " + hora.format(instante);
    }

    private String motivo(String codigo, Map<String, String> motivosVistos) {
        return codigo == null ? "no indicado"
                : motivosVistos.computeIfAbsent(codigo, c -> motivos.descripcion(c).orElse(c));
    }
}
