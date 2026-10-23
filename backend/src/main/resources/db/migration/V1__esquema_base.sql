-- =====================================================================
-- SIGA-SP · Esquema base del MVP
-- Todas las marcas de tiempo son TIMESTAMPTZ (instantes absolutos).
-- La zona horaria de visualización es la de la sede (America/Lima).
-- Solo datos sintéticos: este esquema nunca debe cargarse con datos reales.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Catálogos
-- ---------------------------------------------------------------------
CREATE TABLE sede (
    id            UUID PRIMARY KEY,
    codigo        VARCHAR(20)  NOT NULL UNIQUE,
    nombre        VARCHAR(120) NOT NULL,
    zona_horaria  VARCHAR(40)  NOT NULL DEFAULT 'America/Lima'
);

CREATE TABLE especialidad (
    id      UUID PRIMARY KEY,
    codigo  VARCHAR(20)  NOT NULL UNIQUE,
    nombre  VARCHAR(120) NOT NULL
);

CREATE TABLE profesional (
    id               UUID PRIMARY KEY,
    codigo           VARCHAR(20)  NOT NULL UNIQUE,
    nombre_visible   VARCHAR(120) NOT NULL,
    especialidad_id  UUID         NOT NULL REFERENCES especialidad (id)
);
CREATE INDEX ix_profesional_especialidad ON profesional (especialidad_id);

CREATE TABLE motivo (
    codigo       VARCHAR(30)  PRIMARY KEY,
    tipo         VARCHAR(20)  NOT NULL CHECK (tipo IN ('CANCELACION', 'REPROGRAMACION')),
    descripcion  VARCHAR(160) NOT NULL,
    activo       BOOLEAN      NOT NULL DEFAULT TRUE
);

-- ---------------------------------------------------------------------
-- Pacientes e identidad
-- ---------------------------------------------------------------------
CREATE TABLE paciente (
    id                 UUID PRIMARY KEY,
    codigo             VARCHAR(20)  NOT NULL UNIQUE,
    nombres            VARCHAR(80)  NOT NULL,
    apellidos          VARCHAR(80)  NOT NULL,
    email_contacto     VARCHAR(160),
    telefono_contacto  VARCHAR(30),
    creado_en          TIMESTAMPTZ  NOT NULL,
    actualizado_en     TIMESTAMPTZ  NOT NULL
);

CREATE TABLE usuario (
    id              UUID PRIMARY KEY,
    email           VARCHAR(160) NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    nombre_visible  VARCHAR(120) NOT NULL,
    rol             VARCHAR(20)  NOT NULL CHECK (rol IN ('PACIENTE', 'OPERADOR', 'RESPONSABLE', 'ADMINISTRADOR')),
    activo          BOOLEAN      NOT NULL DEFAULT TRUE,
    paciente_id     UUID         UNIQUE REFERENCES paciente (id),
    creado_en       TIMESTAMPTZ  NOT NULL,
    -- Un usuario PACIENTE siempre está ligado a su ficha; los demás roles nunca.
    CONSTRAINT ck_usuario_paciente CHECK ((rol = 'PACIENTE') = (paciente_id IS NOT NULL))
);
CREATE UNIQUE INDEX ux_usuario_email ON usuario (lower(email));

-- Profesionales cuyas citas puede gestionar cada operador ("citas asignadas").
CREATE TABLE operador_profesional (
    usuario_id      UUID NOT NULL REFERENCES usuario (id),
    profesional_id  UUID NOT NULL REFERENCES profesional (id),
    PRIMARY KEY (usuario_id, profesional_id)
);

-- ---------------------------------------------------------------------
-- Agenda local (adaptador simulado de la agenda institucional)
-- Un horario es una franja de un profesional en una sede. cita_id indica
-- qué cita lo ocupa; UNIQUE(cita_id) impide que una cita ocupe dos horarios
-- y la actualización condicional (cita_id IS NULL) impide la doble reserva.
-- ---------------------------------------------------------------------
CREATE TABLE horario (
    id              UUID PRIMARY KEY,
    profesional_id  UUID        NOT NULL REFERENCES profesional (id),
    sede_id         UUID        NOT NULL REFERENCES sede (id),
    inicio          TIMESTAMPTZ NOT NULL,
    fin             TIMESTAMPTZ NOT NULL,
    cita_id         UUID        UNIQUE,
    CONSTRAINT ck_horario_rango CHECK (fin > inicio),
    CONSTRAINT ux_horario_profesional_inicio UNIQUE (profesional_id, inicio)
);
CREATE INDEX ix_horario_libres ON horario (profesional_id, inicio) WHERE cita_id IS NULL;

-- ---------------------------------------------------------------------
-- Citas
-- ---------------------------------------------------------------------
CREATE TABLE cita (
    id                     UUID PRIMARY KEY,
    codigo                 VARCHAR(20) NOT NULL UNIQUE,
    paciente_id            UUID        NOT NULL REFERENCES paciente (id),
    especialidad_id        UUID        NOT NULL REFERENCES especialidad (id),
    estado                 VARCHAR(20) NOT NULL CHECK (estado IN (
                               'PENDIENTE', 'CONFIRMADA', 'CHECK_IN', 'EN_ESPERA',
                               'EN_ATENCION', 'COMPLETADA', 'CANCELADA', 'NO_ASISTIO')),
    version_agenda_vigente INTEGER     NOT NULL CHECK (version_agenda_vigente >= 1),
    siguiente_secuencia    BIGINT      NOT NULL DEFAULT 1,
    motivo_cancelacion     VARCHAR(30) REFERENCES motivo (codigo),
    creado_en              TIMESTAMPTZ NOT NULL,
    actualizado_en         TIMESTAMPTZ NOT NULL,
    -- Control optimista de concurrencia: solo una decisión se confirma sobre el mismo estado.
    version                BIGINT      NOT NULL DEFAULT 0,
    CONSTRAINT ck_cita_motivo_cancelacion CHECK ((estado = 'CANCELADA') = (motivo_cancelacion IS NOT NULL))
);
CREATE INDEX ix_cita_paciente ON cita (paciente_id);
CREATE INDEX ix_cita_estado ON cita (estado);

ALTER TABLE horario
    ADD CONSTRAINT fk_horario_cita FOREIGN KEY (cita_id) REFERENCES cita (id) DEFERRABLE INITIALLY DEFERRED;

-- Historial de horarios de una cita. Reprogramar cierra la versión vigente
-- (vigente_hasta) y crea la siguiente; el índice parcial garantiza una sola vigente.
CREATE TABLE cita_version_agenda (
    id              UUID PRIMARY KEY,
    cita_id         UUID        NOT NULL REFERENCES cita (id),
    numero          INTEGER     NOT NULL CHECK (numero >= 1),
    horario_id      UUID        REFERENCES horario (id),
    profesional_id  UUID        NOT NULL REFERENCES profesional (id),
    sede_id         UUID        NOT NULL REFERENCES sede (id),
    inicio          TIMESTAMPTZ NOT NULL,
    fin             TIMESTAMPTZ NOT NULL,
    vigente_desde   TIMESTAMPTZ NOT NULL,
    vigente_hasta   TIMESTAMPTZ,
    CONSTRAINT ux_version_cita_numero UNIQUE (cita_id, numero),
    CONSTRAINT ck_version_rango CHECK (fin > inicio),
    CONSTRAINT ck_version_vigencia CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
    -- Una sola versión vigente por cita. Es diferible para permitir, dentro de la misma
    -- transacción, insertar la nueva versión antes de cerrar la anterior.
    CONSTRAINT ex_version_vigente EXCLUDE USING btree (cita_id WITH =) WHERE (vigente_hasta IS NULL)
        DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX ix_version_inicio ON cita_version_agenda (inicio) WHERE vigente_hasta IS NULL;

-- Línea de tiempo de la cita: solo se agregan filas (nunca se editan).
-- secuencia desempata eventos con el mismo instante del servidor.
CREATE TABLE cita_evento (
    id                    UUID PRIMARY KEY,
    cita_id               UUID        NOT NULL REFERENCES cita (id),
    secuencia             BIGINT      NOT NULL,
    tipo                  VARCHAR(30) NOT NULL,
    version_agenda        INTEGER     NOT NULL,
    estado_anterior       VARCHAR(20),
    estado_nuevo          VARCHAR(20) NOT NULL,
    actor_tipo            VARCHAR(20) NOT NULL CHECK (actor_tipo IN ('PACIENTE', 'OPERADOR', 'ADMINISTRADOR', 'SISTEMA')),
    actor_usuario_id      UUID        REFERENCES usuario (id),
    ocurrido_en           TIMESTAMPTZ NOT NULL,
    motivo_codigo         VARCHAR(30) REFERENCES motivo (codigo),
    operacion_id          UUID,
    datos                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
    visible_paciente      BOOLEAN     NOT NULL DEFAULT TRUE,
    CONSTRAINT ux_evento_cita_secuencia UNIQUE (cita_id, secuencia)
);
CREATE INDEX ix_evento_tipo_tiempo ON cita_evento (tipo, ocurrido_en);

CREATE TABLE pre_check_in (
    id                UUID PRIMARY KEY,
    cita_id           UUID        NOT NULL REFERENCES cita (id),
    version_agenda    INTEGER     NOT NULL,
    email_contacto    VARCHAR(160) NOT NULL,
    telefono_contacto VARCHAR(30) NOT NULL,
    completado_en     TIMESTAMPTZ NOT NULL,
    invalidado_en     TIMESTAMPTZ,
    CONSTRAINT ux_pre_check_in_version UNIQUE (cita_id, version_agenda)
);

-- Una cita tiene como máximo un registro de llegada (no se duplica).
CREATE TABLE registro_llegada (
    id              UUID PRIMARY KEY,
    cita_id         UUID        NOT NULL UNIQUE REFERENCES cita (id),
    version_agenda  INTEGER     NOT NULL,
    registrado_en   TIMESTAMPTZ NOT NULL,
    registrado_por  UUID        NOT NULL REFERENCES usuario (id),
    canal           VARCHAR(20) NOT NULL CHECK (canal IN ('PACIENTE', 'OPERADOR'))
);

-- ---------------------------------------------------------------------
-- Notificaciones simuladas (recordatorios y avisos de cambio)
-- La clave única cita–versión–tipo–ventana evita duplicados al reprocesar.
-- ---------------------------------------------------------------------
CREATE TABLE notificacion (
    id               UUID PRIMARY KEY,
    cita_id          UUID        NOT NULL REFERENCES cita (id),
    version_agenda   INTEGER     NOT NULL,
    tipo             VARCHAR(20) NOT NULL CHECK (tipo IN ('RECORDATORIO', 'CAMBIO')),
    ventana          VARCHAR(40) NOT NULL,
    estado           VARCHAR(20) NOT NULL CHECK (estado IN ('PENDIENTE', 'ENVIADA_SIMULADA', 'FALLIDA', 'INVALIDADA')),
    canal            VARCHAR(20) NOT NULL DEFAULT 'SIMULADO',
    contenido        VARCHAR(500) NOT NULL,
    programada_para  TIMESTAMPTZ NOT NULL,
    procesada_en     TIMESTAMPTZ,
    creada_en        TIMESTAMPTZ NOT NULL,
    CONSTRAINT ux_notificacion_clave UNIQUE (cita_id, version_agenda, tipo, ventana)
);
CREATE INDEX ix_notificacion_pendiente ON notificacion (programada_para) WHERE estado = 'PENDIENTE';

-- ---------------------------------------------------------------------
-- Seguimiento (encuesta post-atención: una por cita)
-- ---------------------------------------------------------------------
CREATE TABLE encuesta (
    id            UUID PRIMARY KEY,
    cita_id       UUID        NOT NULL UNIQUE REFERENCES cita (id),
    calificacion  SMALLINT    NOT NULL CHECK (calificacion BETWEEN 1 AND 5),
    comentario    VARCHAR(500),
    respondida_en TIMESTAMPTZ NOT NULL
);

-- ---------------------------------------------------------------------
-- Operaciones idempotentes
-- La clave la genera el cliente (cabecera Idempotency-Key). Se guarda el
-- resultado para devolverlo si la misma operación se repite.
-- ---------------------------------------------------------------------
CREATE TABLE operacion (
    clave         UUID PRIMARY KEY,
    usuario_id    UUID         NOT NULL REFERENCES usuario (id),
    tipo          VARCHAR(40)  NOT NULL,
    recurso_id    UUID         NOT NULL,
    huella        VARCHAR(64)  NOT NULL,
    estado        VARCHAR(20)  NOT NULL CHECK (estado IN ('COMPLETADA', 'RECHAZADA')),
    http_status   INTEGER      NOT NULL,
    codigo_error  VARCHAR(40),
    respuesta     JSONB,
    registrada_en TIMESTAMPTZ  NOT NULL
);
CREATE INDEX ix_operacion_usuario ON operacion (usuario_id, registrada_en);

-- ---------------------------------------------------------------------
-- Auditoría de acciones críticas y eventos de seguridad.
-- Solo admite INSERT: el trigger rechaza UPDATE y DELETE.
-- (No protege frente a un administrador de base de datos; ver docs.)
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
    id               BIGSERIAL PRIMARY KEY,
    ocurrido_en      TIMESTAMPTZ  NOT NULL,
    actor_usuario_id UUID,
    actor_rol        VARCHAR(20),
    accion           VARCHAR(50)  NOT NULL,
    entidad          VARCHAR(40)  NOT NULL,
    entidad_id       VARCHAR(64),
    resultado        VARCHAR(20)  NOT NULL CHECK (resultado IN ('EXITO', 'RECHAZO', 'DENEGADO', 'FALLO')),
    codigo           VARCHAR(40),
    operacion_id     UUID,
    request_id       VARCHAR(40),
    detalle          JSONB        NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX ix_auditoria_tiempo ON auditoria (ocurrido_en);
CREATE INDEX ix_auditoria_actor ON auditoria (actor_usuario_id, ocurrido_en);
CREATE INDEX ix_auditoria_entidad ON auditoria (entidad, entidad_id);

CREATE FUNCTION auditoria_solo_insercion() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'La auditoría es de solo inserción (operación % rechazada)', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_auditoria_solo_insercion
    BEFORE UPDATE OR DELETE ON auditoria
    FOR EACH ROW EXECUTE FUNCTION auditoria_solo_insercion();

-- La línea de tiempo de la cita también es inmutable.
CREATE TRIGGER tg_cita_evento_solo_insercion
    BEFORE UPDATE OR DELETE ON cita_evento
    FOR EACH ROW EXECUTE FUNCTION auditoria_solo_insercion();

-- ---------------------------------------------------------------------
-- Registro de publicación de eventos de Spring Modulith (esquema v2 oficial)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS event_publication
(
    id                     UUID NOT NULL,
    listener_id            TEXT NOT NULL,
    event_type             TEXT NOT NULL,
    serialized_event       TEXT NOT NULL,
    publication_date       TIMESTAMP WITH TIME ZONE NOT NULL,
    completion_date        TIMESTAMP WITH TIME ZONE,
    status                 TEXT,
    completion_attempts    INT,
    last_resubmission_date TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (id)
);
CREATE INDEX IF NOT EXISTS event_publication_serialized_event_hash_idx ON event_publication USING hash (serialized_event);
CREATE INDEX IF NOT EXISTS event_publication_by_completion_date_idx ON event_publication (completion_date);
