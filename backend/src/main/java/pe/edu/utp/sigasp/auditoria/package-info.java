/**
 * M8 · Auditoría: bitácora de solo inserción de acciones críticas y eventos de seguridad.
 * <p>
 * API pública: {@link pe.edu.utp.sigasp.auditoria.Auditoria} para registrar y
 * {@link pe.edu.utp.sigasp.auditoria.ConsultaBitacora} para consultar con filtros y paginación
 * (PB25, HU17). {@code web} expone el visor de solo lectura para el ADMINISTRADOR.
 */
@ApplicationModule(displayName = "Auditoría")
package pe.edu.utp.sigasp.auditoria;

import org.springframework.modulith.ApplicationModule;
