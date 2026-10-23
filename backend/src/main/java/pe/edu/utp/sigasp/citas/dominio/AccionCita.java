package pe.edu.utp.sigasp.citas.dominio;

import java.util.EnumSet;
import java.util.Set;

/** Acciones sobre una cita y qué tipo de actor puede ejecutarlas (apartado 3.3.2). */
public enum AccionCita {
    CONFIRMAR(EnumSet.of(TipoActor.PACIENTE)),
    CANCELAR(EnumSet.of(TipoActor.PACIENTE)),
    REPROGRAMAR(EnumSet.of(TipoActor.PACIENTE)),
    PRE_CHECK_IN(EnumSet.of(TipoActor.PACIENTE)),
    REGISTRAR_LLEGADA(EnumSet.of(TipoActor.PACIENTE, TipoActor.OPERADOR)),
    PASAR_A_ESPERA(EnumSet.of(TipoActor.OPERADOR)),
    INICIAR_ATENCION(EnumSet.of(TipoActor.OPERADOR)),
    COMPLETAR(EnumSet.of(TipoActor.OPERADOR)),
    MARCAR_NO_ASISTIO(EnumSet.of(TipoActor.SISTEMA));

    private final Set<TipoActor> actores;

    AccionCita(Set<TipoActor> actores) {
        this.actores = actores;
    }

    public boolean permitidaPara(TipoActor actor) {
        return actores.contains(actor);
    }
}
