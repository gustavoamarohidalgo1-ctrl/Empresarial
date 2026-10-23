/**
 * Operaciones idempotentes: cada cambio solicitado lleva una clave del cliente. Repetir la
 * operación devuelve el resultado guardado sin duplicar eventos, y una respuesta perdida
 * puede consultarse por su clave antes de reintentar (regla 5 del apartado 3.3.1, HU06).
 */
@ApplicationModule(displayName = "Operaciones idempotentes")
package pe.edu.utp.sigasp.operaciones;

import org.springframework.modulith.ApplicationModule;
