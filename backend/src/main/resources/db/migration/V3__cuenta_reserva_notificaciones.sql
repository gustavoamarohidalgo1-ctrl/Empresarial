-- =====================================================================
-- SIGA-SP · v1.1: cuenta (registro y recuperación), reserva de citas,
-- notificaciones para el paciente y catálogos enriquecidos.
-- =====================================================================

-- Códigos de cita SP-AAAA-NNNNNN (año de creación + secuencia global).
CREATE SEQUENCE cita_codigo_seq START 1;

-- El paciente puede marcar sus notificaciones como leídas.
ALTER TABLE notificacion ADD COLUMN leida_en TIMESTAMPTZ;
CREATE INDEX ix_notificacion_cita ON notificacion (cita_id, creada_en DESC);

-- Consentimiento de privacidad registrado al crear la cuenta (Ley N.° 29733).
ALTER TABLE paciente ADD COLUMN privacidad_aceptada_en TIMESTAMPTZ;

-- Cambiar o restablecer la contraseña invalida las sesiones anteriores a este instante.
ALTER TABLE usuario ADD COLUMN credenciales_cambiadas_en TIMESTAMPTZ;

-- Recuperación de contraseña: se guarda solo el hash SHA-256 del token (nunca el token).
CREATE TABLE token_recuperacion (
    id          UUID PRIMARY KEY,
    usuario_id  UUID        NOT NULL REFERENCES usuario (id),
    hash_token  VARCHAR(64) NOT NULL UNIQUE,
    creado_en   TIMESTAMPTZ NOT NULL,
    expira_en   TIMESTAMPTZ NOT NULL,
    usado_en    TIMESTAMPTZ,
    CONSTRAINT ck_token_vigencia CHECK (expira_en > creado_en)
);
CREATE INDEX ix_token_recuperacion_usuario ON token_recuperacion (usuario_id, creado_en DESC);

-- Canal de correo simulado: nada sale del sistema. En desarrollo se consulta en /api/v1/dev/correos.
CREATE TABLE correo_simulado (
    id            UUID PRIMARY KEY,
    destinatario  VARCHAR(160) NOT NULL,
    asunto        VARCHAR(200) NOT NULL,
    cuerpo        TEXT         NOT NULL,
    enlace        VARCHAR(500),
    enviado_en    TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_correo_simulado_enviado ON correo_simulado (enviado_en DESC);

-- Catálogos más descriptivos para la reserva.
ALTER TABLE especialidad ADD COLUMN descripcion VARCHAR(200);
ALTER TABLE sede ADD COLUMN direccion VARCHAR(200);
