package pe.edu.utp.sigasp.citas.dominio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import pe.edu.utp.sigasp.compartido.error.ApiException;
import pe.edu.utp.sigasp.compartido.error.CodigoError;

/**
 * Reglas del recorrido de la cita (apartados 3.3.1 y 3.3.2) sin base de datos ni Spring:
 * cada caso controla el instante, el actor y la versión de agenda.
 */
class CitaTest {

    private static final ReglasTiempo REGLAS = ReglasTiempo.POR_DEFECTO;
    /** Miércoles 04/11/2026 09:00 en Lima. */
    private static final Instant INICIO = Instant.parse("2026-11-04T14:00:00Z");
    private static final Instant ANTES = INICIO.minus(Duration.ofDays(2));
    private static final UUID PACIENTE = UUID.randomUUID();
    private static final ActorCita ACTOR_PACIENTE = new ActorCita(TipoActor.PACIENTE, UUID.randomUUID());
    private static final ActorCita ACTOR_OPERADOR = new ActorCita(TipoActor.OPERADOR, UUID.randomUUID());

    private static Cita nueva() {
        return Cita.registrar(UUID.randomUUID(), "CIT001", PACIENTE, UUID.randomUUID(), horario(INICIO),
                new Contexto(ANTES.minus(Duration.ofDays(1)), ActorCita.SISTEMA, REGLAS, null));
    }

    private static HorarioAsignado horario(Instant inicio) {
        return new HorarioAsignado(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), inicio,
                inicio.plus(Duration.ofMinutes(20)));
    }

    private static Contexto paciente(Instant ahora) {
        return new Contexto(ahora, ACTOR_PACIENTE, REGLAS, UUID.randomUUID());
    }

    private static Contexto operador(Instant ahora) {
        return new Contexto(ahora, ACTOR_OPERADOR, REGLAS, UUID.randomUUID());
    }

    private static Contexto sistema(Instant ahora) {
        return new Contexto(ahora, ActorCita.SISTEMA, REGLAS, null);
    }

    private static void esperarError(Runnable accion, CodigoError codigo) {
        assertThatThrownBy(accion::run)
                .isInstanceOf(ApiException.class)
                .satisfies(ex -> assertThat(((ApiException) ex).codigo()).isEqualTo(codigo));
    }

    @Test
    @DisplayName("Una cita nueva queda Pendiente, en la versión 1 y con el evento CREADA")
    void registrar() {
        Cita cita = nueva();
        assertThat(cita.estado()).isEqualTo(EstadoCita.PENDIENTE);
        assertThat(cita.versionAgendaVigente()).isEqualTo(1);
        assertThat(cita.eventos()).extracting(EventoCita::tipo).containsExactly(TipoEventoCita.CREADA);
        assertThat(cita.versionVigente().inicio()).isEqualTo(INICIO);
    }

    @Nested
    @DisplayName("Confirmar")
    class Confirmar {

        @Test
        void pendienteYAntesDeLaHoraPasaAConfirmada() {
            Cita cita = nueva();
            cita.confirmar(paciente(ANTES), 1);
            assertThat(cita.estado()).isEqualTo(EstadoCita.CONFIRMADA);
            assertThat(cita.confirmadaEn()).contains(ANTES);
            assertThat(cita.eventos()).extracting(EventoCita::tipo)
                    .containsExactly(TipoEventoCita.CREADA, TipoEventoCita.CONFIRMADA);
        }

        @Test
        void enLaHoraPrevistaYaNoSePuede() {
            esperarError(() -> nueva().confirmar(paciente(INICIO), 1), CodigoError.FUERA_DE_PLAZO);
        }

        @Test
        void confirmarDosVecesNoSePermite() {
            Cita cita = nueva();
            cita.confirmar(paciente(ANTES), 1);
            esperarError(() -> cita.confirmar(paciente(ANTES), 1), CodigoError.TRANSICION_NO_PERMITIDA);
            assertThat(cita.eventos()).hasSize(2);
        }

        @Test
        void conVersionObsoletaSeRechazaSinCambios() {
            Cita cita = nueva();
            esperarError(() -> cita.confirmar(paciente(ANTES), 2), CodigoError.VERSION_OBSOLETA);
            assertThat(cita.estado()).isEqualTo(EstadoCita.PENDIENTE);
        }

        @Test
        void elOperadorNoPuedeConfirmar() {
            esperarError(() -> nueva().confirmar(operador(ANTES), 1), CodigoError.TRANSICION_NO_PERMITIDA);
        }
    }

    @Nested
    @DisplayName("Cancelar")
    class Cancelar {

        @Test
        void desdePendienteOConfirmadaEsTerminalYGuardaElMotivo() {
            Cita cita = nueva();
            cita.confirmar(paciente(ANTES), 1);
            cita.cancelar(paciente(ANTES.plusSeconds(60)), 1, "CAN-PERSONAL");
            assertThat(cita.estado()).isEqualTo(EstadoCita.CANCELADA);
            assertThat(cita.estado().esTerminal()).isTrue();
            assertThat(cita.motivoCancelacion()).isEqualTo("CAN-PERSONAL");
            assertThat(cita.accionesPermitidas(TipoActor.PACIENTE, ANTES, REGLAS)).isEmpty();
        }

        @Test
        void unaCanceladaRechazaConfirmacionReprogramacionYLlegada() {
            Cita cita = nueva();
            cita.cancelar(paciente(ANTES), 1, "CAN-PERSONAL");
            esperarError(() -> cita.confirmar(paciente(ANTES), 1), CodigoError.TRANSICION_NO_PERMITIDA);
            esperarError(() -> cita.reprogramar(paciente(ANTES), 1, horario(INICIO.plus(Duration.ofDays(1))),
                    "REP-OTRO"), CodigoError.TRANSICION_NO_PERMITIDA);
            esperarError(() -> cita.registrarLlegada(paciente(INICIO.minusSeconds(60)), 1),
                    CodigoError.TRANSICION_NO_PERMITIDA);
        }

        @Test
        void despuesDeLaHoraYaNoSePuede() {
            esperarError(() -> nueva().cancelar(paciente(INICIO.plusSeconds(1)), 1, "CAN-PERSONAL"),
                    CodigoError.FUERA_DE_PLAZO);
        }
    }

    @Nested
    @DisplayName("Reprogramar")
    class Reprogramar {

        @Test
        void conservaElIdCreaVersionNuevaYVuelveAPendiente() {
            Cita cita = nueva();
            UUID id = cita.id();
            cita.confirmar(paciente(ANTES), 1);
            Instant nuevoInicio = INICIO.plus(Duration.ofDays(2));
            cita.reprogramar(paciente(ANTES.plusSeconds(60)), 1, horario(nuevoInicio), "REP-DISPONIBILIDAD");

            assertThat(cita.id()).isEqualTo(id);
            assertThat(cita.estado()).isEqualTo(EstadoCita.PENDIENTE);
            assertThat(cita.versionAgendaVigente()).isEqualTo(2);
            assertThat(cita.versionVigente().inicio()).isEqualTo(nuevoInicio);
            assertThat(cita.versiones()).hasSize(2);
            assertThat(cita.versiones().getFirst().vigenteHasta()).isEqualTo(ANTES.plusSeconds(60));
            assertThat(cita.confirmadaEn()).as("la confirmación era de la versión anterior").isEmpty();
            assertThat(cita.accionesPermitidas(TipoActor.PACIENTE, ANTES.plusSeconds(120), REGLAS))
                    .contains(AccionCita.CONFIRMAR);
        }

        @Test
        void invalidaElPreCheckInDeLaVersionAnterior() {
            Cita cita = nueva();
            cita.completarPreCheckIn(paciente(ANTES), 1, "a@ejemplo.invalid", "+51 900 000 000", true);
            assertThat(cita.preCheckInVigente()).isPresent();
            cita.reprogramar(paciente(ANTES.plusSeconds(60)), 1, horario(INICIO.plus(Duration.ofDays(1))),
                    "REP-OTRO");
            assertThat(cita.preCheckInVigente()).isEmpty();
            assertThat(cita.accionesPermitidas(TipoActor.PACIENTE, ANTES.plusSeconds(120), REGLAS))
                    .contains(AccionCita.PRE_CHECK_IN);
        }

        @Test
        void elNuevoHorarioDebeSerFuturo() {
            esperarError(() -> nueva().reprogramar(paciente(ANTES), 1, horario(ANTES.minusSeconds(1)), "REP-OTRO"),
                    CodigoError.FUERA_DE_PLAZO);
        }

        @Test
        void conVersionObsoletaNoCambiaNada() {
            Cita cita = nueva();
            esperarError(() -> cita.reprogramar(paciente(ANTES), 3, horario(INICIO.plus(Duration.ofDays(1))),
                    "REP-OTRO"), CodigoError.VERSION_OBSOLETA);
            assertThat(cita.versiones()).hasSize(1);
            assertThat(cita.versionVigente().inicio()).isEqualTo(INICIO);
        }
    }

    @Nested
    @DisplayName("Ventana de llegada [inicio − 60 min, inicio + 30 min) y mismo día local")
    class VentanaDeLlegada {

        @Test
        void abreExactamenteSesentaMinutosAntes() {
            Cita cita = nueva();
            assertThat(cita.impedimento(AccionCita.REGISTRAR_LLEGADA, TipoActor.PACIENTE,
                    INICIO.minus(Duration.ofMinutes(60)).minusSeconds(1), REGLAS)).contains(CodigoError.FUERA_DE_PLAZO);
            cita.registrarLlegada(paciente(INICIO.minus(Duration.ofMinutes(60))), 1);
            assertThat(cita.estado()).isEqualTo(EstadoCita.CHECK_IN);
        }

        @Test
        void cierraAntesDeLosTreintaMinutosDespues() {
            Cita cita = nueva();
            Instant cierre = INICIO.plus(Duration.ofMinutes(30));
            assertThat(cita.impedimento(AccionCita.REGISTRAR_LLEGADA, TipoActor.PACIENTE, cierre.minusMillis(1), REGLAS))
                    .isEmpty();
            assertThat(cita.impedimento(AccionCita.REGISTRAR_LLEGADA, TipoActor.PACIENTE, cierre, REGLAS))
                    .contains(CodigoError.FUERA_DE_PLAZO);
        }

        @Test
        void noExigeConfirmacionPrevia() {
            Cita cita = nueva();
            cita.registrarLlegada(operador(INICIO.minus(Duration.ofMinutes(5))), null);
            assertThat(cita.estado()).isEqualTo(EstadoCita.CHECK_IN);
            assertThat(cita.llegada()).isPresent();
        }

        @Test
        void unaSegundaLlegadaSeRechaza() {
            Cita cita = nueva();
            cita.registrarLlegada(paciente(INICIO.minus(Duration.ofMinutes(10))), 1);
            esperarError(() -> cita.registrarLlegada(operador(INICIO.minus(Duration.ofMinutes(9))), null),
                    CodigoError.LLEGADA_YA_REGISTRADA);
        }

        @Test
        void exigeElMismoDiaLocalAunqueLaVentanaCruceLaMedianoche() {
            // Cita a las 00:20 de Lima: 60 minutos antes cae en el día anterior.
            Instant inicioMadrugada = Instant.parse("2026-11-05T05:20:00Z");
            Cita cita = Cita.registrar(UUID.randomUUID(), "CIT002", PACIENTE, UUID.randomUUID(),
                    horario(inicioMadrugada), sistema(ANTES));
            Instant diaAnterior = inicioMadrugada.minus(Duration.ofMinutes(40));
            assertThat(cita.impedimento(AccionCita.REGISTRAR_LLEGADA, TipoActor.PACIENTE, diaAnterior, REGLAS))
                    .contains(CodigoError.FUERA_DE_PLAZO);
        }
    }

    @Nested
    @DisplayName("Atención por el operador")
    class Atencion {

        @Test
        void recorridoCompletoHastaCompletada() {
            Cita cita = nueva();
            cita.registrarLlegada(paciente(INICIO.minus(Duration.ofMinutes(15))), 1);
            cita.pasarAEspera(operador(INICIO.minus(Duration.ofMinutes(14))));
            cita.iniciarAtencion(operador(INICIO.plus(Duration.ofMinutes(2))));
            cita.completar(operador(INICIO.plus(Duration.ofMinutes(20))));
            assertThat(cita.estado()).isEqualTo(EstadoCita.COMPLETADA);
            assertThat(cita.eventos()).extracting(EventoCita::tipo).containsExactly(TipoEventoCita.CREADA,
                    TipoEventoCita.LLEGADA_REGISTRADA, TipoEventoCita.EN_ESPERA, TipoEventoCita.EN_ATENCION,
                    TipoEventoCita.COMPLETADA);
            assertThat(cita.eventos()).extracting(EventoCita::secuencia).containsExactly(1L, 2L, 3L, 4L, 5L);
        }

        @Test
        void noSePuedeCompletarDesdeEnEspera() {
            Cita cita = nueva();
            cita.registrarLlegada(paciente(INICIO.minus(Duration.ofMinutes(15))), 1);
            cita.pasarAEspera(operador(INICIO.minus(Duration.ofMinutes(14))));
            esperarError(() -> cita.completar(operador(INICIO)), CodigoError.TRANSICION_NO_PERMITIDA);
        }

        @Test
        void elInicioDeAtencionNoPuedeSerAnteriorALaLlegada() {
            Cita cita = nueva();
            Instant llegada = INICIO.minus(Duration.ofMinutes(15));
            cita.registrarLlegada(paciente(llegada), 1);
            cita.pasarAEspera(operador(llegada.plusSeconds(30)));
            esperarError(() -> cita.iniciarAtencion(operador(llegada.minusSeconds(1))), CodigoError.FUERA_DE_PLAZO);
        }

        @Test
        void elPacienteNoAvanzaLaAtencion() {
            Cita cita = nueva();
            cita.registrarLlegada(paciente(INICIO.minus(Duration.ofMinutes(15))), 1);
            esperarError(() -> cita.pasarAEspera(paciente(INICIO)), CodigoError.TRANSICION_NO_PERMITIDA);
        }
    }

    @Nested
    @DisplayName("Cierre por inasistencia")
    class Inasistencia {

        @Test
        void soloAlVencerLaVentanaSinLlegada() {
            Cita cita = nueva();
            Instant cierre = INICIO.plus(Duration.ofMinutes(30));
            esperarError(() -> cita.marcarNoAsistio(sistema(cierre.minusMillis(1))), CodigoError.FUERA_DE_PLAZO);
            cita.marcarNoAsistio(sistema(cierre));
            assertThat(cita.estado()).isEqualTo(EstadoCita.NO_ASISTIO);
        }

        @Test
        void conLlegadaRegistradaNoSeCierra() {
            Cita cita = nueva();
            cita.registrarLlegada(paciente(INICIO.minus(Duration.ofMinutes(5))), 1);
            esperarError(() -> cita.marcarNoAsistio(sistema(INICIO.plus(Duration.ofHours(2)))),
                    CodigoError.TRANSICION_NO_PERMITIDA);
        }

        @Test
        void soloElSistemaCierra() {
            esperarError(() -> nueva().marcarNoAsistio(operador(INICIO.plus(Duration.ofHours(1)))),
                    CodigoError.TRANSICION_NO_PERMITIDA);
        }
    }

    @Test
    @DisplayName("El pre-check-in no acredita presencia ni cambia el estado")
    void preCheckInNoEsLlegada() {
        Cita cita = nueva();
        cita.completarPreCheckIn(paciente(ANTES), 1, "a@ejemplo.invalid", "+51 900 000 000", true);
        assertThat(cita.estado()).isEqualTo(EstadoCita.PENDIENTE);
        assertThat(cita.llegada()).isEmpty();
        esperarError(() -> cita.completarPreCheckIn(paciente(ANTES), 1, "a@ejemplo.invalid", "+51 900 000 000",
                true), CodigoError.TRANSICION_NO_PERMITIDA);
    }

    @Test
    @DisplayName("El pre-check-in exige confirmar que los datos son correctos")
    void preCheckInSinConfirmarDatos() {
        esperarError(() -> nueva().completarPreCheckIn(paciente(ANTES), 1, "a@ejemplo.invalid", "+51 900", false),
                CodigoError.DATOS_PRE_CHECK_IN_INVALIDOS);
    }

    @Test
    @DisplayName("Las acciones permitidas coinciden con las reglas que se aplican al ejecutar")
    void accionesPermitidasSegunActorYMomento() {
        Cita cita = nueva();
        assertThat(cita.accionesPermitidas(TipoActor.PACIENTE, ANTES, REGLAS)).containsExactlyInAnyOrder(
                AccionCita.CONFIRMAR, AccionCita.CANCELAR, AccionCita.REPROGRAMAR, AccionCita.PRE_CHECK_IN);
        assertThat(cita.accionesPermitidas(TipoActor.PACIENTE, INICIO.minus(Duration.ofMinutes(30)), REGLAS))
                .containsExactlyInAnyOrder(AccionCita.CONFIRMAR, AccionCita.CANCELAR, AccionCita.REPROGRAMAR,
                        AccionCita.PRE_CHECK_IN, AccionCita.REGISTRAR_LLEGADA);
        assertThat(cita.accionesPermitidas(TipoActor.PACIENTE, INICIO.plus(Duration.ofMinutes(10)), REGLAS))
                .containsExactly(AccionCita.REGISTRAR_LLEGADA);
        assertThat(cita.accionesPermitidas(TipoActor.OPERADOR, INICIO.minus(Duration.ofMinutes(30)), REGLAS))
                .containsExactly(AccionCita.REGISTRAR_LLEGADA);
    }

    @Test
    @DisplayName("JsonPlano escapa comillas, barras y caracteres de control")
    void jsonPlanoEscapa() {
        assertThat(JsonPlano.de(java.util.Map.of("a", "x\"y\\z\n"))).isEqualTo("{\"a\":\"x\\\"y\\\\z\\n\"}");
    }
}
