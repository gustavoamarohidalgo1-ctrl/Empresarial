/**
 * M7 · Analítica operativa: indicadores reproducibles (PB20–PB24) y su exportación a CSV.
 * <p>
 * API pública: {@link pe.edu.utp.sigasp.analitica.Indicadores} y sus registros. Las fórmulas siguen
 * el apartado 13.5 del documento (docs/reglas-dominio.md, sección Indicadores): la población C(P, t)
 * se reconstruye al corte t con la vigencia de cada versión de agenda y la línea de tiempo, que guarda
 * versión y secuencia. {@code interno} contiene la consulta SQL y {@code web} la API REST.
 */
@ApplicationModule(displayName = "Analítica")
package pe.edu.utp.sigasp.analitica;

import org.springframework.modulith.ApplicationModule;
