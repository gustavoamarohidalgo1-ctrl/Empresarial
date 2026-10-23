package pe.edu.utp.sigasp.citas.dominio;

import static pe.edu.utp.sigasp.compartido.error.CodigoError.DATOS_PRE_CHECK_IN_INVALIDOS;
import static pe.edu.utp.sigasp.compartido.error.CodigoError.FUERA_DE_PLAZO;
import static pe.edu.utp.sigasp.compartido.error.CodigoError.LLEGADA_YA_REGISTRADA;
import static pe.edu.utp.sigasp.compartido.error.CodigoError.TRANSICION_NO_PERMITIDA;
import static pe.edu.utp.sigasp.compartido.error.CodigoError.VERSION_OBSOLETA;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OneToOne;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Agregado raíz de la cita. Concentra todas las reglas del recorrido (apartados 3.3.1 y 3.3.2):
 * cada acción valida estado, versión de agenda y horario antes de cambiar nada, y deja un evento
 * en la línea de tiempo. Si una regla falla, la cita queda intacta.
 * <p>
 * {@link #impedimento} es la única fuente de verdad de las reglas: la usan tanto la ejecución de
 * cada acción como el cálculo de {@link #accionesPermitidas} que se muestra en la interfaz.
 */
@Entity
@Table(name = "cita")
public class Cita {

    @Id
    private UUID id;

    @Column(nullable = false, unique = true)
    private String codigo;

    @Column(name = "paciente_id", nullable = false)
    private UUID pacienteId;

    @Column(name = "especialidad_id", nullable = false)
    private UUID especialidadId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private EstadoCita estado;

    @Column(name = "version_agenda_vigente", nullable = false)
    private int versionAgendaVigente;

    @Column(name = "siguiente_secuencia", nullable = false)
    private long siguienteSecuencia;

    @Column(name = "motivo_cancelacion")
    private String motivoCancelacion;

    @Column(name = "creado_en", nullable = false)
    private Instant creadoEn;

    @Column(name = "actualizado_en", nullable = false)
    private Instant actualizadoEn;

    /** Control optimista: dos decisiones simultáneas sobre el mismo estado no pueden confirmarse ambas. */
    @Version
    private Long version;

    @OneToMany(mappedBy = "cita", cascade = CascadeType.ALL)
    @OrderBy("numero ASC")
    private List<VersionAgenda> versiones = new ArrayList<>();

    @OneToMany(mappedBy = "cita", cascade = CascadeType.PERSIST)
    @OrderBy("secuencia ASC")
    private List<EventoCita> eventos = new ArrayList<>();

    @OneToMany(mappedBy = "cita", cascade = CascadeType.ALL)
    @OrderBy("versionAgenda ASC")
    private List<PreCheckIn> preCheckIns = new ArrayList<>();

    @OneToOne(mappedBy = "cita", cascade = CascadeType.ALL)
    private RegistroLlegada llegada;

    protected Cita() {
    }

    /** Registra una cita nueva en estado Pendiente con su primera versión de agenda. */
    public static Cita registrar(UUID id, String codigo, UUID pacienteId, UUID especialidadId,
            HorarioAsignado horario, Contexto contexto) {
        Cita cita = new Cita();
        cita.id = Objects.requireNonNull(id);
        cita.codigo = Objects.requireNonNull(codigo);
        cita.pacienteId = Objects.requireNonNull(pacienteId);
        cita.especialidadId = Objects.requireNonNull(especialidadId);
        cita.estado = EstadoCita.PENDIENTE;
        cita.versionAgendaVigente = 1;
        cita.siguienteSecuencia = 1;
        cita.creadoEn = contexto.ahora();
        cita.actualizadoEn = contexto.ahora();
        cita.versiones.add(new VersionAgenda(cita, 1, horario, contexto.ahora()));
        cita.registrarEvento(TipoEventoCita.CREADA, null, contexto, null,
                Map.of("inicio", horario.inicio().toString(), "fin", horario.fin().toString()), true);
        return cita;
    }

    // ------------------------------------------------------------------
    // Reglas
    // ------------------------------------------------------------------

    /**
     * Motivo por el que la acción no se puede ejecutar ahora, o vacío si se puede.
     * No valida la versión de agenda enviada por el cliente (eso lo hace cada acción).
     */
    public Optional<CodigoError> impedimento(AccionCita accion, TipoActor actor, Instant ahora, ReglasTiempo reglas) {
        if (!accion.permitidaPara(actor)) {
            return Optional.of(TRANSICION_NO_PERMITIDA);
        }
        Instant inicio = versionVigente().inicio();
        return switch (accion) {
            case CONFIRMAR -> estado != EstadoCita.PENDIENTE
                    ? Optional.of(TRANSICION_NO_PERMITIDA)
                    : antesDe(ahora, inicio);
            case CANCELAR, REPROGRAMAR -> !estado.esPreviaALlegada()
                    ? Optional.of(TRANSICION_NO_PERMITIDA)
                    : antesDe(ahora, inicio);
            case PRE_CHECK_IN -> !estado.esPreviaALlegada() || preCheckInVigente().isPresent()
                    ? Optional.of(TRANSICION_NO_PERMITIDA)
                    : antesDe(ahora, inicio);
            case REGISTRAR_LLEGADA -> impedimentoLlegada(ahora, inicio, reglas);
            case PASAR_A_ESPERA -> estado == EstadoCita.CHECK_IN
                    ? Optional.empty()
                    : Optional.of(TRANSICION_NO_PERMITIDA);
            case INICIAR_ATENCION -> estado != EstadoCita.EN_ESPERA
                    ? Optional.of(TRANSICION_NO_PERMITIDA)
                    : noAntesDe(ahora, llegada.registradoEn());
            case COMPLETAR -> estado != EstadoCita.EN_ATENCION
                    ? Optional.of(TRANSICION_NO_PERMITIDA)
                    : noAntesDe(ahora, ultimoEvento(TipoEventoCita.EN_ATENCION).ocurridoEn());
            case MARCAR_NO_ASISTIO -> !estado.esPreviaALlegada() || llegada != null
                    ? Optional.of(TRANSICION_NO_PERMITIDA)
                    : noAntesDe(ahora, reglas.cierreLlegada(inicio));
        };
    }

    private Optional<CodigoError> impedimentoLlegada(Instant ahora, Instant inicio, ReglasTiempo reglas) {
        if (llegada != null) {
            return Optional.of(LLEGADA_YA_REGISTRADA);
        }
        if (!estado.esPreviaALlegada()) {
            return Optional.of(TRANSICION_NO_PERMITIDA);
        }
        boolean dentroDeVentana = !ahora.isBefore(reglas.aperturaLlegada(inicio))
                && ahora.isBefore(reglas.cierreLlegada(inicio))
                && reglas.mismoDiaLocal(ahora, inicio);
        return dentroDeVentana ? Optional.empty() : Optional.of(FUERA_DE_PLAZO);
    }

    public Set<AccionCita> accionesPermitidas(TipoActor actor, Instant ahora, ReglasTiempo reglas) {
        Set<AccionCita> permitidas = EnumSet.noneOf(AccionCita.class);
        for (AccionCita accion : AccionCita.values()) {
            if (accion.permitidaPara(actor) && impedimento(accion, actor, ahora, reglas).isEmpty()) {
                permitidas.add(accion);
            }
        }
        return permitidas;
    }

    // ------------------------------------------------------------------
    // Acciones del paciente
    // ------------------------------------------------------------------

    public void confirmar(Contexto contexto, int versionAgendaEsperada) {
        validar(AccionCita.CONFIRMAR, contexto, versionAgendaEsperada);
        cambiarEstado(EstadoCita.CONFIRMADA, TipoEventoCita.CONFIRMADA, contexto, null, Map.of(), true);
    }

    public void cancelar(Contexto contexto, int versionAgendaEsperada, String motivoCodigo) {
        validar(AccionCita.CANCELAR, contexto, versionAgendaEsperada);
        this.motivoCancelacion = Objects.requireNonNull(motivoCodigo);
        cambiarEstado(EstadoCita.CANCELADA, TipoEventoCita.CANCELADA, contexto, motivoCodigo, Map.of(), true);
    }

    /**
     * Conserva el ID, cierra la versión vigente, crea la siguiente con el nuevo horario y deja la
     * cita Pendiente. La confirmación queda sin efecto (estaba ligada a la versión anterior) y el
     * pre-check-in de esa versión se invalida. La reserva del horario la hace la agenda en la
     * misma transacción.
     */
    public void reprogramar(Contexto contexto, int versionAgendaEsperada, HorarioAsignado nuevo, String motivoCodigo) {
        validar(AccionCita.REPROGRAMAR, contexto, versionAgendaEsperada);
        VersionAgenda anterior = versionVigente();
        if (!nuevo.inicio().isAfter(contexto.ahora())) {
            throw new ApiException(FUERA_DE_PLAZO, "El nuevo horario debe ser futuro.");
        }
        if (nuevo.inicio().equals(anterior.inicio()) && nuevo.profesionalId().equals(anterior.profesionalId())) {
            throw new ApiException(TRANSICION_NO_PERMITIDA, "El nuevo horario es igual al actual.");
        }
        anterior.cerrar(contexto.ahora());
        int numero = anterior.numero() + 1;
        versiones.add(new VersionAgenda(this, numero, nuevo, contexto.ahora()));
        versionAgendaVigente = numero;
        preCheckIns.forEach(p -> p.invalidar(contexto.ahora()));

        Map<String, String> datos = new LinkedHashMap<>();
        datos.put("inicioAnterior", anterior.inicio().toString());
        datos.put("inicioNuevo", nuevo.inicio().toString());
        datos.put("versionAnterior", String.valueOf(anterior.numero()));
        datos.put("versionNueva", String.valueOf(numero));
        cambiarEstado(EstadoCita.PENDIENTE, TipoEventoCita.REPROGRAMADA, contexto, motivoCodigo, datos, true);
    }

    /** Pre-check-in de la versión vigente. No cambia el estado del recorrido. */
    public void completarPreCheckIn(Contexto contexto, int versionAgendaEsperada, String email, String telefono,
            boolean datosCorrectos) {
        validar(AccionCita.PRE_CHECK_IN, contexto, versionAgendaEsperada);
        if (!datosCorrectos) {
            throw new ApiException(DATOS_PRE_CHECK_IN_INVALIDOS);
        }
        preCheckIns.add(new PreCheckIn(this, versionAgendaVigente, email, telefono, contexto.ahora()));
        registrarEvento(TipoEventoCita.PRE_CHECK_IN_COMPLETADO, estado, contexto, null, Map.of(), true);
    }

    // ------------------------------------------------------------------
    // Llegada y atención
    // ------------------------------------------------------------------

    /**
     * Registra la llegada (paciente u operador). No exige confirmación previa. El paciente envía
     * la versión de agenda que vio; el operador valida con la versión de la cita en el servicio.
     */
    public void registrarLlegada(Contexto contexto, Integer versionAgendaEsperada) {
        validar(AccionCita.REGISTRAR_LLEGADA, contexto, versionAgendaEsperada);
        this.llegada = new RegistroLlegada(this, versionAgendaVigente, contexto);
        cambiarEstado(EstadoCita.CHECK_IN, TipoEventoCita.LLEGADA_REGISTRADA, contexto, null, Map.of(), true);
    }

    public void pasarAEspera(Contexto contexto) {
        validar(AccionCita.PASAR_A_ESPERA, contexto, null);
        cambiarEstado(EstadoCita.EN_ESPERA, TipoEventoCita.EN_ESPERA, contexto, null, Map.of(), true);
    }

    public void iniciarAtencion(Contexto contexto) {
        validar(AccionCita.INICIAR_ATENCION, contexto, null);
        cambiarEstado(EstadoCita.EN_ATENCION, TipoEventoCita.EN_ATENCION, contexto, null, Map.of(), true);
    }

    public void completar(Contexto contexto) {
        validar(AccionCita.COMPLETAR, contexto, null);
        cambiarEstado(EstadoCita.COMPLETADA, TipoEventoCita.COMPLETADA, contexto, null, Map.of(), true);
    }

    /** Cierre automático: sin llegada ni cancelación al vencer la ventana. */
    public void marcarNoAsistio(Contexto contexto) {
        validar(AccionCita.MARCAR_NO_ASISTIO, contexto, null);
        cambiarEstado(EstadoCita.NO_ASISTIO, TipoEventoCita.NO_ASISTIO, contexto, null,
                Map.of("cierreVentana", contexto.reglas().cierreLlegada(versionVigente().inicio()).toString()), true);
    }

    // ------------------------------------------------------------------
    // Apoyo
    // ------------------------------------------------------------------

    private void validar(AccionCita accion, Contexto contexto, Integer versionAgendaEsperada) {
        if (versionAgendaEsperada != null && versionAgendaEsperada != versionAgendaVigente) {
            throw new ApiException(VERSION_OBSOLETA);
        }
        impedimento(accion, contexto.actor().tipo(), contexto.ahora(), contexto.reglas())
                .ifPresent(codigo -> {
                    throw new ApiException(codigo, mensajeImpedimento(accion, codigo));
                });
    }

    private static String mensajeImpedimento(AccionCita accion, CodigoError codigo) {
        return switch (codigo) {
            case FUERA_DE_PLAZO -> switch (accion) {
                case REGISTRAR_LLEGADA -> "La llegada solo puede registrarse dentro de la ventana de llegada.";
                case MARCAR_NO_ASISTIO -> "La ventana de llegada aún no venció.";
                case INICIAR_ATENCION, COMPLETAR -> "La marca de tiempo sería anterior al paso previo.";
                default -> "La acción solo puede realizarse antes de la hora programada.";
            };
            default -> codigo.detallePorDefecto();
        };
    }

    private void cambiarEstado(EstadoCita nuevo, TipoEventoCita tipo, Contexto contexto, String motivo,
            Map<String, String> datos, boolean visiblePaciente) {
        EstadoCita anterior = this.estado;
        this.estado = nuevo;
        registrarEvento(tipo, anterior, contexto, motivo, datos, visiblePaciente);
    }

    private void registrarEvento(TipoEventoCita tipo, EstadoCita anterior, Contexto contexto, String motivo,
            Map<String, String> datos, boolean visiblePaciente) {
        eventos.add(new EventoCita(this, siguienteSecuencia++, tipo, versionAgendaVigente, anterior, estado,
                contexto, motivo, JsonPlano.de(datos), visiblePaciente));
        this.actualizadoEn = contexto.ahora();
    }

    private static Optional<CodigoError> antesDe(Instant ahora, Instant limite) {
        return ahora.isBefore(limite) ? Optional.empty() : Optional.of(FUERA_DE_PLAZO);
    }

    private static Optional<CodigoError> noAntesDe(Instant ahora, Instant limite) {
        return ahora.isBefore(limite) ? Optional.of(FUERA_DE_PLAZO) : Optional.empty();
    }

    private EventoCita ultimoEvento(TipoEventoCita tipo) {
        for (int i = eventos.size() - 1; i >= 0; i--) {
            if (eventos.get(i).tipo() == tipo) {
                return eventos.get(i);
            }
        }
        throw new IllegalStateException("La cita " + codigo + " no tiene evento " + tipo);
    }

    // ------------------------------------------------------------------
    // Lectura
    // ------------------------------------------------------------------

    public VersionAgenda versionVigente() {
        return versiones.stream()
                .filter(VersionAgenda::esVigente)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("La cita " + codigo + " no tiene versión vigente"));
    }

    public Optional<PreCheckIn> preCheckInVigente() {
        return preCheckIns.stream().filter(p -> p.esValidoPara(versionAgendaVigente)).findFirst();
    }

    /** Confirmación registrada para la versión vigente (reprogramar exige una nueva). */
    public Optional<Instant> confirmadaEn() {
        for (int i = eventos.size() - 1; i >= 0; i--) {
            EventoCita evento = eventos.get(i);
            if (evento.versionAgenda() != versionAgendaVigente) {
                break;
            }
            if (evento.tipo() == TipoEventoCita.CONFIRMADA) {
                return Optional.of(evento.ocurridoEn());
            }
        }
        return Optional.empty();
    }

    public Optional<RegistroLlegada> llegada() {
        return Optional.ofNullable(llegada);
    }

    public List<EventoCita> eventos() {
        return Collections.unmodifiableList(eventos);
    }

    public List<VersionAgenda> versiones() {
        return Collections.unmodifiableList(versiones);
    }

    public UUID id() {
        return id;
    }

    public String codigo() {
        return codigo;
    }

    public UUID pacienteId() {
        return pacienteId;
    }

    public UUID especialidadId() {
        return especialidadId;
    }

    public EstadoCita estado() {
        return estado;
    }

    public int versionAgendaVigente() {
        return versionAgendaVigente;
    }

    public String motivoCancelacion() {
        return motivoCancelacion;
    }

    public Long version() {
        return version;
    }
}
