-- Catálogo sintético de motivos (sin información clínica).
INSERT INTO motivo (codigo, tipo, descripcion) VALUES
    ('CAN-PERSONAL',       'CANCELACION',    'Compromiso personal'),
    ('CAN-LABORAL',        'CANCELACION',    'Compromiso laboral'),
    ('CAN-TRASLADO',       'CANCELACION',    'Dificultad de traslado'),
    ('CAN-YA-ATENDIDO',    'CANCELACION',    'Ya no necesito la cita'),
    ('CAN-OTRO',           'CANCELACION',    'Otro motivo no clínico'),
    ('REP-DISPONIBILIDAD', 'REPROGRAMACION', 'Cambio de disponibilidad personal'),
    ('REP-LABORAL',        'REPROGRAMACION', 'Compromiso laboral'),
    ('REP-TRASLADO',       'REPROGRAMACION', 'Dificultad de traslado'),
    ('REP-OTRO',           'REPROGRAMACION', 'Otro motivo no clínico');
