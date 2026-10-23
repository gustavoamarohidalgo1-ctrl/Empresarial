/**
 * M9 · Integración con la agenda. En el MVP es un adaptador local con horarios de prueba
 * ({@link pe.edu.utp.sigasp.agenda.Agenda}); un servicio externo simulado (PB28) podrá
 * implementar la misma interfaz sin cambiar las reglas de las citas.
 */
@ApplicationModule(displayName = "Agenda")
package pe.edu.utp.sigasp.agenda;

import org.springframework.modulith.ApplicationModule;
