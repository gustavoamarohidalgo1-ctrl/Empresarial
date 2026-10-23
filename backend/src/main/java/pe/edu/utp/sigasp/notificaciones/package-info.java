/**
 * M5 · Notificaciones simuladas: recordatorio previo (PB10, Must) y avisos de cambio (PB11), incluido
 * el aviso de la reserva. Ningún envío es real: el canal registra el resultado como SIMULADO. Un fallo de
 * envío no revierte la gestión de la cita, porque las notificaciones reaccionan a eventos ya confirmados.
 * El paciente las consulta y marca como leídas en su centro de notificaciones
 * ({@link pe.edu.utp.sigasp.notificaciones.BandejaPaciente}).
 */
@ApplicationModule(displayName = "Notificaciones")
package pe.edu.utp.sigasp.notificaciones;

import org.springframework.modulith.ApplicationModule;
