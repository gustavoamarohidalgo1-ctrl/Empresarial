-- =====================================================================
-- SIGA-SP · v1.1 (revisión de seguridad): versión de credenciales,
-- versión de la política de privacidad aceptada y correo simulado sin token.
-- =====================================================================

-- Las sesiones se invalidan por versión, no por instante: cambiar o restablecer la contraseña incrementa
-- la versión, y una sesión autenticada con una versión anterior deja de valer. No depende de ningún reloj
-- (en desarrollo el reloj de negocio se puede simular). credenciales_cambiadas_en queda como dato informativo.
ALTER TABLE usuario ADD COLUMN version_credenciales INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usuario ADD CONSTRAINT ck_usuario_version_credenciales CHECK (version_credenciales >= 0);

-- Versión de la política de privacidad que el paciente aceptó al registrarse (Ley N.° 29733), junto con
-- privacidad_aceptada_en (V3). Se toma de sigasp.privacidad.version.
ALTER TABLE paciente ADD COLUMN privacidad_version VARCHAR(20);

-- Fuera del buzón de desarrollo (sigasp.dev.buzon-correos) el correo simulado no guarda el cuerpo ni el
-- enlace, que llevan el token de un solo uso: solo el asunto y el destinatario enmascarado.
ALTER TABLE correo_simulado ALTER COLUMN cuerpo DROP NOT NULL;
