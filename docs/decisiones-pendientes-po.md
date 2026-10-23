# Decisiones tomadas y preguntas abiertas para el Product Owner

Al implementar la base aparecieron puntos que el documento del proyecto deja ambiguos o sin cubrir (los detectó también la revisión del documento). Se tomaron decisiones prudentes para no bloquear el avance; todas están aisladas en el código y se pueden cambiar.

## A. Decisiones ya implementadas (revisar y ratificar)

| # | Tema | Decisión | Dónde cambiarla |
|---|---|---|---|
| A1 | Roles | Hay cuatro roles: PACIENTE, OPERADOR, **RESPONSABLE** (lee indicadores) y ADMINISTRADOR. Antes, el responsable ambulatorio era un "Administrador lector", ambiguo frente a la tabla 33 y las HU. | `compartido/seguridad/Rol.java`, `SeguridadConfig` |
| A2 | Motivo al reprogramar | Es **obligatorio**, de un catálogo propio (REPROGRAMACION), como en el prototipo LF04 y PB09. La tabla 7 y la HU06 no lo decían. | `ServicioCitasPaciente.reprogramar` |
| A3 | Horarios para reprogramar | Solo del **mismo profesional**. | `ServicioCitasPaciente.horariosDisponibles` |
| A4 | Fronteras de la ventana | Llegada en `[inicio − 60, inicio + 30)`; No asistió desde `inicio + 30`. Las dos reglas no se solapan. | `ReglasTiempo`, `application.yml` (`sigasp.reglas.*`) |
| A5 | Plazo del pre-check-in | Antes de la hora prevista y una vez por versión de agenda. | `Cita.impedimento` |
| A6 | Cancelación | Libera el horario de inmediato. | `ServicioCitasPaciente.cancelar` |
| A7 | Respuesta ante una cita ajena | 404 (igual que una inexistente), más auditoría DENEGADO. | `ServicioCitasPaciente.citaPropia` |
| A8 | Rechazos idempotentes | Repetir una operación rechazada devuelve el mismo rechazo. Una nueva intención usa una clave nueva. | `operaciones/Idempotencia` |
| A9 | Sesión | Sesión de servidor (no JWT), con expiración tras 30 minutos de inactividad. | `application.yml` |
| A10 | Recordatorio | Uno, 24 h antes, por versión de agenda. | `sigasp.notificaciones.*` |

## B. Preguntas abiertas (necesitan decisión antes del Sprint 3)

| # | Pregunta | Por qué importa | Recomendación |
|---|---|---|---|
| B1 | ¿Qué pasa si el paciente llega y se retira sin ser atendido, o si una atención nunca se cierra? | Hoy CHECK_IN, EN_ESPERA y EN_ATENCION no tienen salida, y esas citas distorsionan los indicadores. | Añadir el estado terminal "Retirado" (operador, con motivo) y una alerta de atenciones abiertas al cierre del día. |
| B2 | ¿La clínica puede cancelar o reprogramar? (médico ausente, consultorio cerrado) | Hoy solo el paciente cambia citas. El documento no lo excluye del alcance. | Permitir que el operador cancele o reprograme "por la clínica" con un motivo de un catálogo propio, sin contarlo en la tasa de cancelación del paciente. |
| B3 | ¿El operador puede registrar cambios pedidos por teléfono? | La tabla 7 los reserva al "paciente propietario". | Sí, con el actor OPERADOR y el canal TELEFONO en el evento. |
| B4 | ¿La llegada que registra el paciente desde su teléfono es confiable? | Puede marcarla desde su casa 60 minutos antes; eso altera los indicadores de espera e inasistencia. | Que la llegada del paciente quede "por verificar" hasta que el operador la confirme, o un código QR en la sede. |
| B5 | ¿Qué valida realmente el pre-check-in? | Hoy confirma el contacto; no reduce la carga administrativa a la llegada (la causa de la tabla 4). | Definir con admisión los datos mínimos (seguro, documento) en el Sprint 3. |
| B6 | Correcciones excepcionales de estado (tabla 7, última fila) | No hay PB ni HU que las implemente. | Crear un PB administrativo con motivo e historial para el Sprint 4, o declararlo fuera del alcance. |
| B7 | ¿Qué se muestra al paciente como "estado general del turno" (HU11)? | Hay 8 estados internos y el paciente necesita 3 o 4 mensajes simples. | Mapa propuesto: Pendiente/Confirmada → "Programada"; Llegada/En espera → "En espera"; En atención → "En atención"; terminal → su nombre. |
| B9 | ¿Se acepta el riesgo de bloqueo malicioso de cuentas? | Quien conozca un correo puede provocar 5 fallos y bloquear esa cuenta 15 minutos (la respuesta no lo revela). | Para el piloto, aceptarlo. Antes de producción: retardo progresivo y límite por IP o dispositivo. |
| B10 | Prueba de rendimiento (RNF08) | Falta el script de carga y el reporte. | Script k6 con 10 usuarios y 1 000 citas sintéticas, y el p95 de listado, detalle y confirmación en el Sprint 2. |
| B8 | Consentimiento de los voluntarios en las pruebas de usabilidad | El documento no lo menciona y se registran datos de personas reales. | Usar un formulario de consentimiento informado y anonimizar a los participantes (P1–P5). |

## C. Fuera del alcance de esta base (pendiente en el backlog)
- **S3**: la vista de "estado del turno" del paciente (HU11), según la decisión B7.
- **S4**:
  - dashboard e indicadores (PB20–PB24);
  - visor de auditoría (PB25);
  - parámetros administrables (PB26);
  - gestión de usuarios (PB27);
  - encuesta (PB18–PB19).
- **Should/Could**:
  - integración con un servicio de agenda externo simulado (PB28–PB29); el puerto `Agenda` ya existe;
  - ayuda contextual (PB32).
