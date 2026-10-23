-- =====================================================================
-- SIGA-SP · v1.1: índices para los indicadores (PB20–PB24) y la bitácora (PB25).
-- Solo agrega índices: no cambia datos ni restricciones.
-- =====================================================================

-- Población C(P, t): versiones cuya hora prevista cae en el periodo, vigentes o ya cerradas
-- (un corte histórico puede necesitar una versión que hoy ya no es la vigente). El índice parcial
-- ix_version_inicio de V1 solo cubre las vigentes. INCLUDE permite resolverla solo con el índice.
CREATE INDEX ix_version_inicio_corte ON cita_version_agenda (inicio)
    INCLUDE (cita_id, numero, vigente_desde, vigente_hasta, sede_id, profesional_id);

-- Línea de tiempo hasta el corte: estado del último evento, confirmación de la versión vigente,
-- reprogramaciones e inicio de atención, en un solo recorrido por cita.
CREATE INDEX ix_evento_cita_corte ON cita_evento (cita_id, ocurrido_en)
    INCLUDE (secuencia, tipo, version_agenda, estado_nuevo);

-- Bitácora: filtro por acción (y lista de acciones distintas) y por resultado, en el mismo orden
-- de la vista (más reciente primero). El filtro por tiempo y por actor ya tiene índices desde V1.
CREATE INDEX ix_auditoria_accion_orden ON auditoria (accion, ocurrido_en DESC, id DESC);
CREATE INDEX ix_auditoria_resultado_orden ON auditoria (resultado, ocurrido_en DESC, id DESC);
