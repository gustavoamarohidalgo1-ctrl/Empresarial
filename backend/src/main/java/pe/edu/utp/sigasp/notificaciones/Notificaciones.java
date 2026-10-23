package pe.edu.utp.sigasp.notificaciones;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.modulith.events.ApplicationModuleListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pe.edu.utp.sigasp.citas.CitaActualizada;
import pe.edu.utp.sigasp.citas.CitaVigente;
import pe.edu.utp.sigasp.citas.ConsultaCitasVigentes;

/**
 * Genera recordatorios y avisos simulados.
 * <ul>
 *   <li>Recordatorio: uno por cita–versión–tipo–ventana (clave única en la BD), así que reprocesar no
 *       duplica. Se genera "justo a tiempo" y solo para la versión vigente (revalidada al insertar), de modo
 *       que nunca se envía uno de una versión anterior ni de una cita cancelada. La invalidación de
 *       pendientes es una defensa adicional para envíos que hubieran quedado en cola.</li>
 *   <li>Aviso de cambio: se genera cuando el servidor ya confirmó el cambio (evento tras commit), también al
 *       registrar la cita («Reserva registrada»). Su fecha de creación es la del cambio, no la del proceso.</li>
 * </ul>
 */
@Service
public class Notificaciones {

    private static final Logger log = LoggerFactory.getLogger(Notificaciones.class);
    private static final String VENTANA_RECORDATORIO = "24H";
    private static final Set<String> EVENTOS_CON_AVISO = Set.of("CREADA", "CONFIRMADA", "CANCELADA", "REPROGRAMADA");

    private final JdbcClient jdbc;
    private final ConsultaCitasVigentes citas;
    private final CanalSimulado canal;
    private final Clock reloj;
    private final Duration anticipacion;
    private final Redaccion redaccion;
    private final TransactionTemplate transaccion;

    Notificaciones(JdbcClient jdbc, ConsultaCitasVigentes citas, CanalSimulado canal, Clock reloj,
            PlatformTransactionManager transacciones,
            @Value("${sigasp.notificaciones.anticipacion-recordatorio:PT24H}") Duration anticipacion,
            @Value("${sigasp.reglas.zona-horaria:America/Lima}") ZoneId zona) {
        this.jdbc = jdbc;
        this.citas = citas;
        this.canal = canal;
        this.reloj = reloj;
        this.anticipacion = anticipacion;
        this.transaccion = new TransactionTemplate(transacciones);
        this.redaccion = new Redaccion(zona);
    }

    /** Reacciona a cambios confirmados de una cita (se ejecuta tras el commit, en su propia transacción). */
    @ApplicationModuleListener
    void alCambiarCita(CitaActualizada evento) {
        if ("CANCELADA".equals(evento.tipoEvento()) || "REPROGRAMADA".equals(evento.tipoEvento())) {
            invalidarPendientes(evento.citaId(), evento.versionAgenda(), "CANCELADA".equals(evento.tipoEvento()));
        }
        if (EVENTOS_CON_AVISO.contains(evento.tipoEvento())) {
            registrarAviso(evento);
        }
    }

    @Scheduled(fixedDelayString = "${sigasp.notificaciones.intervalo:PT5M}", initialDelayString = "PT30S")
    void programado() {
        int generados = generarRecordatorios();
        if (generados > 0) {
            log.info("Recordatorios simulados generados: {}", generados);
        }
    }

    /**
     * Genera los recordatorios de citas válidas cuya hora cae dentro de la anticipación configurada.
     * Cada cita se procesa en su propia transacción y se revalida justo antes de insertar: si en ese
     * momento se cancela o reprograma, no se envía un recordatorio desactualizado.
     */
    public int generarRecordatorios() {
        Instant ahora = reloj.instant();
        List<CitaVigente> proximas = citas.previasALlegadaConInicioEntre(ahora, ahora.plus(anticipacion));
        int generados = 0;
        for (CitaVigente cita : proximas) {
            Integer creado = transaccion.execute(estado -> {
                if (!sigueVigente(cita)) {
                    return 0;
                }
                return insertar(cita.citaId(), cita.versionAgenda(), "RECORDATORIO", VENTANA_RECORDATORIO,
                        redaccion.recordatorio(cita, ahora), cita.inicio().minus(anticipacion), ahora, ahora);
            });
            generados += creado == null ? 0 : creado;
        }
        return generados;
    }

    /**
     * Comprueba que la cita sigue Pendiente o Confirmada en la misma versión. {@code FOR SHARE} espera a que
     * termine una cancelación o reprogramación en curso (que toma {@code FOR UPDATE}) y lee su resultado.
     */
    private boolean sigueVigente(CitaVigente cita) {
        return !jdbc.sql("""
                        SELECT 1 FROM cita
                        WHERE id = :cita AND estado IN ('PENDIENTE', 'CONFIRMADA') AND version_agenda_vigente = :version
                        FOR SHARE
                        """)
                .param("cita", cita.citaId())
                .param("version", cita.versionAgenda())
                .query((rs, i) -> Boolean.TRUE)
                .list()
                .isEmpty();
    }

    private void invalidarPendientes(UUID citaId, int versionVigente, boolean todas) {
        jdbc.sql("""
                        UPDATE notificacion SET estado = 'INVALIDADA', procesada_en = :ahora
                        WHERE cita_id = :cita AND estado = 'PENDIENTE'
                          AND (:todas OR version_agenda < :version)
                        """)
                .param("ahora", Timestamp.from(reloj.instant()))
                .param("cita", citaId)
                .param("todas", todas)
                .param("version", versionVigente)
                .update();
    }

    private void registrarAviso(CitaActualizada evento) {
        String contenido = redaccion.aviso(evento, citas.buscar(evento.citaId()));
        insertar(evento.citaId(), evento.versionAgenda(), "CAMBIO", evento.tipoEvento(), contenido,
                evento.ocurridoEn(), evento.ocurridoEn(), reloj.instant());
    }

    /** Inserta y "envía" por el canal simulado; devuelve 1 si se creó, 0 si ya existía. */
    private int insertar(UUID citaId, int version, String tipo, String ventana, String contenido,
            Instant programadaPara, Instant creadaEn, Instant procesadaEn) {
        UUID id = UUID.randomUUID();
        int creadas = jdbc.sql("""
                        INSERT INTO notificacion (id, cita_id, version_agenda, tipo, ventana, estado, canal,
                                                  contenido, programada_para, creada_en)
                        VALUES (:id, :cita, :version, :tipo, :ventana, 'PENDIENTE', 'SIMULADO', :contenido,
                                :programada, :creada)
                        ON CONFLICT (cita_id, version_agenda, tipo, ventana) DO NOTHING
                        """)
                .param("id", id)
                .param("cita", citaId)
                .param("version", version)
                .param("tipo", tipo)
                .param("ventana", ventana)
                .param("contenido", contenido)
                .param("programada", Timestamp.from(programadaPara))
                .param("creada", Timestamp.from(creadaEn))
                .update();
        if (creadas == 0) {
            return 0;
        }
        String estado = canal.enviar(contenido) ? "ENVIADA_SIMULADA" : "FALLIDA";
        jdbc.sql("UPDATE notificacion SET estado = :estado, procesada_en = :ahora WHERE id = :id")
                .param("estado", estado)
                .param("ahora", Timestamp.from(procesadaEn))
                .param("id", id)
                .update();
        return 1;
    }
}
