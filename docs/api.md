# Contrato de la API REST de SIGA-SP (v1)

Este documento es el contrato entre el frontend y el backend. Si cambia un endpoint, se actualiza aquí en el mismo cambio.
La especificación OpenAPI generada está en `http://localhost:8080/swagger-ui.html` (solo perfil `dev`).

## Convenciones

| Tema | Regla |
|---|---|
| Base | `/api/v1` |
| Formato | JSON UTF-8. Los errores usan `application/problem+json` (RFC 9457). |
| Fechas | Instantes ISO-8601 en UTC (`2026-11-04T14:00:00Z`). El frontend los muestra en `America/Lima`. Las fechas sin hora usan `YYYY-MM-DD`. |
| Sesión | Cookie `SIGASP_SESSION` (HttpOnly, SameSite=Lax). El cierre de sesión la invalida en el servidor. |
| CSRF | Cookie `XSRF-TOKEN` (legible por JS) y cabecera `X-XSRF-TOKEN` en POST, PUT, PATCH y DELETE (nombres por defecto de Angular). `GET /auth/csrf` la emite; el token del cuerpo es el mismo valor que el de la cookie (sin enmascarar) y sigue siendo válido después del login. |
| Idempotencia | Las operaciones que crean o cambian una cita exigen la cabecera `Idempotency-Key` con un UUID generado por el cliente. Repetir la misma clave con el mismo contenido devuelve el resultado guardado; con otro contenido devuelve 409 `IDEMPOTENCIA_CONFLICTO`. |
| Versión de agenda | Las operaciones del paciente sobre una cita existente envían `versionAgenda` (la que vio el usuario). Si ya no es la vigente: 409 `VERSION_OBSOLETA`. |
| Trazabilidad | Toda respuesta trae la cabecera `X-Request-Id`; los errores la repiten en `requestId`. |
| Desarrollo | El servidor de Angular redirige `/api` a `http://localhost:8080` (`proxy.conf.json`), así que no hace falta CORS. |

### Formato de error

```json
{
  "type": "https://siga-sp.local/errores/version-obsoleta",
  "title": "La cita cambió",
  "status": 409,
  "detail": "La cita fue modificada. Actualiza la vista antes de continuar.",
  "instance": "/api/v1/pacientes/me/citas/0b6c…/confirmacion",
  "codigo": "VERSION_OBSOLETA",
  "requestId": "7f3c2a9e4b1d",
  "errores": [ { "campo": "email", "mensaje": "Formato de correo inválido" } ]
}
```

- `errores` solo aparece en errores de validación (400) que se pueden atribuir a un campo. Cada `campo` usa el mismo nombre que la propiedad del JSON de entrada o el parámetro de la URL (por ejemplo, `email`, `telefono` o `especialidad`).
- Los 400 sobre el conjunto de la solicitud (un rango de fechas inválido, un parámetro con formato ilegible) llevan solo `detail`, sin `errores`.
- `detail` es un texto en español apto para mostrarse a la persona usuaria. Nunca incluye datos de otros pacientes, trazas ni SQL.

### Códigos de error

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 400 | `VALIDACION` | Cuerpo o parámetros inválidos (`errores` detalla los campos cuando aplica). |
| 400 | `IDEMPOTENCY_KEY_REQUERIDA` | Falta la cabecera `Idempotency-Key` o no es un UUID. |
| 401 | `NO_AUTENTICADO` | No hay sesión válida. |
| 401 | `CREDENCIALES_INVALIDAS` | Login fallido, cuenta inactiva o bloqueo temporal; el mensaje es genérico a propósito. |
| 403 | `ACCESO_DENEGADO` | El rol no tiene permiso para la función. |
| 403 | `CSRF_INVALIDO` | Falta el token CSRF o no coincide. |
| 404 | `CITA_NO_ENCONTRADA` | La cita no existe **o no pertenece al usuario**: no se distingue, para no revelar datos. |
| 404 | `RECURSO_NO_ENCONTRADO` | Otro recurso inexistente (o ajeno, en el caso de las notificaciones). |
| 405 | `METODO_NO_PERMITIDO` | El método HTTP no aplica a la ruta. |
| 406 | (sin cuerpo) | El cliente pide un formato distinto de JSON. |
| 415 | `TIPO_NO_SOPORTADO` | El cuerpo no es `application/json`. |
| 409 | `VERSION_OBSOLETA` | `versionAgenda` o `versionCita` no es la vigente. |
| 409 | `CONFLICTO_CONCURRENTE` | Otra operación cambió la cita al mismo tiempo. |
| 409 | `HORARIO_NO_DISPONIBLE` | El horario elegido ya no se puede usar: otra persona lo ocupó antes de guardar, no existe, ya pasó o (en la reserva) no respeta la anticipación mínima. La cita original no cambia. |
| 409 | `IDEMPOTENCIA_CONFLICTO` | Se reutilizó una `Idempotency-Key` con otro contenido, otro recurso u otro usuario. |
| 422 | `TRANSICION_NO_PERMITIDA` | La acción no es válida desde el estado actual. |
| 422 | `FUERA_DE_PLAZO` | La acción está fuera de su ventana de tiempo. |
| 422 | `MOTIVO_INVALIDO` | El motivo no existe, está inactivo o no corresponde a la acción. |
| 422 | `DATOS_PRE_CHECK_IN_INVALIDOS` | El pre-check-in no confirma los datos. |
| 422 | `LLEGADA_YA_REGISTRADA` | Ya existe un registro de llegada para la cita. |
| 500 | `ERROR_INTERNO` | Error no controlado; el detalle queda solo en el log con el `requestId`. |

Los códigos que agrega la v1.1 están en [Códigos de error nuevos](#códigos-de-error-nuevos).

## Autenticación

### `GET /auth/csrf`
200 → `{ "headerName": "X-XSRF-TOKEN", "token": "…" }`. También escribe la cookie `XSRF-TOKEN`.

### `POST /auth/login`
Cuerpo: `{ "email": "ana.torres@correo.test", "password": "…" }`
200 → `UsuarioSesion`. Crea una sesión nueva (cambia el identificador de sesión).
401 → `CREDENCIALES_INVALIDAS`. Cinco intentos fallidos en 15 minutos bloquean la cuenta 15 minutos; la respuesta no revela el bloqueo.

```json
{ "id": "6f1…", "nombre": "Ana Lucía Torres Vega", "email": "ana.torres@correo.test", "rol": "PACIENTE" }
```
`rol` ∈ `PACIENTE`, `OPERADOR`, `RESPONSABLE`, `ADMINISTRADOR`.

### `POST /auth/logout`
204. Invalida la sesión en el servidor; volver a usar la cookie anterior devuelve 401.

### `GET /auth/sesion`
200 → `UsuarioSesion`, o 401 si no hay sesión.

### Validez de las sesiones
Cada sesión guarda la **versión de credenciales** del usuario con la que se abrió (`usuario.version_credenciales`). Cambiar o restablecer la contraseña incrementa esa versión. En cada solicitud, el servidor compara ambas: una sesión con una versión anterior queda invalidada y responde 401 `NO_AUTENTICADO`. Al cambiar la contraseña, la sesión desde la que se hizo se renueva con la versión nueva y sigue abierta. La comparación no depende de la hora del servidor, así que también funciona con el reloj simulado de desarrollo.

## Paciente (rol `PACIENTE`)

Todas las rutas usan la identidad de la sesión; nunca reciben el ID del paciente.

### `GET /pacientes/me/citas?alcance=proximas|historial`
`proximas` (por defecto): estados no terminales, de la más cercana a la más lejana.
`historial`: `COMPLETADA`, `CANCELADA` y `NO_ASISTIO`, de la más reciente a la más antigua.
200 → `CitaResumen[]`

```json
{
  "id": "0b6c…",
  "codigo": "SP-2026-000123",
  "estado": "PENDIENTE",
  "estadoEtiqueta": "Pendiente",
  "inicio": "2026-11-04T14:00:00Z",
  "fin": "2026-11-04T14:20:00Z",
  "versionAgenda": 1,
  "sede": { "codigo": "SURCO", "nombre": "Sede Surco" },
  "especialidad": { "codigo": "MED-GEN", "nombre": "Medicina general" },
  "profesional": { "codigo": "P01", "nombre": "Dr. Martín Quispe Salas" }
}
```

`estado` ∈ `PENDIENTE`, `CONFIRMADA`, `CHECK_IN`, `EN_ESPERA`, `EN_ATENCION`, `COMPLETADA`, `CANCELADA`, `NO_ASISTIO`.

### `GET /pacientes/me/citas/{id}`
200 → `CitaDetalle` = `CitaResumen` más:

```json
{
  "zonaHoraria": "America/Lima",
  "accionesPermitidas": ["CONFIRMAR", "CANCELAR", "REPROGRAMAR", "PRE_CHECK_IN", "REGISTRAR_LLEGADA"],
  "ventanaLlegada": { "desde": "2026-11-04T13:00:00Z", "hasta": "2026-11-04T14:30:00Z" },
  "confirmadaEn": null,
  "preCheckInCompletadoEn": null,
  "llegadaRegistradaEn": null,
  "motivoCancelacion": null
}
```

`motivoCancelacion` es `{ "codigo": "CAN-PERSONAL", "descripcion": "Compromiso personal" }` cuando la cita está cancelada, y `null` en otro caso; el instante de la cancelación está en el evento `CANCELADA` de la línea de tiempo. `ventanaLlegada` es `null` si la cita ya no está en Pendiente ni en Confirmada.

El servidor calcula `accionesPermitidas` con las mismas reglas que aplica al ejecutar la acción. El frontend usa la lista para mostrar botones, pero ocultar un botón no reemplaza el control del servidor.
404 → `CITA_NO_ENCONTRADA`.

### `GET /pacientes/me/citas/{id}/linea-tiempo`
200 → `EventoLineaTiempo[]`, ordenado por `secuencia`. Solo incluye eventos aptos para el paciente, sin actores internos ni datos técnicos.

```json
{ "secuencia": 1, "tipo": "CREADA", "ocurridoEn": "2026-10-13T14:00:00Z", "titulo": "Cita registrada", "descripcion": "Tu cita fue registrada para el 04/11/2026 a las 09:00." }
```

`tipo` ∈ `CREADA`, `CONFIRMADA`, `CANCELADA`, `REPROGRAMADA`, `PRE_CHECK_IN_COMPLETADO`, `LLEGADA_REGISTRADA`, `EN_ESPERA`, `EN_ATENCION`, `COMPLETADA`, `NO_ASISTIO`.

### Acciones sobre una cita
Todas exigen `Idempotency-Key` y devuelven 200 con el `CitaDetalle` actualizado.

| Endpoint | Cuerpo | Reglas principales |
|---|---|---|
| `POST /pacientes/me/citas/{id}/confirmacion` | `{ "versionAgenda": 1 }` | Solo `PENDIENTE`, antes de la hora prevista y sin llegada. |
| `POST /pacientes/me/citas/{id}/cancelacion` | `{ "versionAgenda": 1, "motivoCodigo": "CAN-PERSONAL" }` | `PENDIENTE` o `CONFIRMADA`, antes de la hora y sin llegada. Libera el horario. Estado terminal. |
| `POST /pacientes/me/citas/{id}/reprogramacion` | `{ "versionAgenda": 1, "horarioId": "…", "motivoCodigo": "REP-DISPONIBILIDAD" }` | Igual que cancelar, más horario futuro y libre del mismo profesional. Conserva el ID, sube `versionAgenda` y vuelve a `PENDIENTE`. Invalida la confirmación, el pre-check-in y los recordatorios de la versión anterior. |
| `POST /pacientes/me/citas/{id}/pre-check-in` | `{ "versionAgenda": 1, "email": "…", "telefono": "…", "datosCorrectos": true }` | `PENDIENTE` o `CONFIRMADA`, antes de la hora, sin llegada y una vez por versión de agenda. No acredita presencia. Guarda los datos en el pre-check-in, pero **no** modifica el perfil. |
| `POST /pacientes/me/citas/{id}/llegada` | `{ "versionAgenda": 1 }` | `PENDIENTE` o `CONFIRMADA`, dentro de `[inicio − 60 min, inicio + 30 min)` y el mismo día local. |

### `GET /pacientes/me/citas/{id}/horarios-disponibles?desde=2026-11-01&hasta=2026-11-14`
200 → `HorarioDisponible[]`: horarios libres y futuros del mismo profesional, por inicio ascendente.
- `desde` y `hasta` son fechas locales de la sede (America/Lima) y **ambos días se incluyen**.
- Por defecto, `desde` es hoy y `hasta` es `desde + 14` (15 días).
- El rango abarca como máximo **31 días incluidos** (`hasta − desde ≤ 30`). Si es mayor, o si `hasta` es anterior a `desde`, responde 400 `VALIDACION` (solo `detail`).

`{ "id": "…", "inicio": "…", "fin": "…", "sede": {…}, "profesional": {…} }`. Consultar no reserva el horario.

### `GET /pacientes/me/perfil` y `PATCH /pacientes/me/perfil`
GET → `{ "nombres": "Ana Lucía", "apellidos": "Torres Vega", "email": "ana.torres@correo.test", "telefono": "+51 987 112 340" }`
PATCH → cuerpo `{ "email"?: "…", "telefono"?: "…" }`, responde 200 con el perfil. Formato aceptado:
- `email`: hasta 160 caracteres, sin espacios, con una sola `@` y un dominio con punto (`^[^\s@]+@[^\s@]+\.[^\s@]+$`; `a@b` no vale).
- `telefono`: hasta 30 caracteres; de 7 a 20 dígitos, con un espacio simple opcional entre dígitos y «+» inicial opcional (`^\+?[0-9](?: ?[0-9]){6,19}$`; por ejemplo, `+51 987 112 340`).

El pre-check-in exige ambos campos con el mismo formato de teléfono; su correo se valida como dirección de correo estándar, de hasta 160 caracteres. Solo se pueden cambiar `email` y `telefono` de contacto; cada cambio queda auditado.

## Operador (rol `OPERADOR`)

### `GET /operador/citas?fecha=2026-11-06`
200 → citas del día local de los profesionales asignados al operador:

```json
{ "id": "…", "codigo": "SP-2026-000123", "inicio": "…", "estado": "EN_ESPERA", "estadoEtiqueta": "En espera",
  "pacienteNombre": "Ana Lucía Torres Vega", "profesional": {…}, "especialidad": {…}, "versionCita": 7,
  "accionesPermitidas": ["INICIAR_ATENCION"], "llegadaRegistradaEn": "…" }
```

### `POST /operador/citas/{id}/transiciones`
Cabecera `Idempotency-Key`. Cuerpo `{ "accion": "REGISTRAR_LLEGADA" | "PASAR_A_ESPERA" | "INICIAR_ATENCION" | "COMPLETAR", "versionCita": 7 }`.
200 → el elemento actualizado. 409 `VERSION_OBSOLETA` si la cita cambió: el panel debe pedir actualizar la vista sin sobrescribir.

## Catálogos y operaciones (cualquier usuario autenticado)

### `GET /catalogos/motivos?tipo=CANCELACION|REPROGRAMACION`
200 → `[{ "codigo": "CAN-PERSONAL", "descripcion": "Compromiso personal" }]`

### `GET /operaciones/{idempotencyKey}`
Sirve para comprobar una operación cuya respuesta se perdió.
200 → `{ "clave": "…", "tipo": "CITA_CONFIRMAR", "recursoId": "…", "estado": "COMPLETADA" | "RECHAZADA", "httpStatus": 200, "codigoError": null, "registradaEn": "…" }`
- `tipo` ∈ `CITA_RESERVAR`, `CITA_CONFIRMAR`, `CITA_CANCELAR`, `CITA_REPROGRAMAR`, `CITA_PRE_CHECK_IN`, `CITA_REGISTRAR_LLEGADA` y `CITA_OPERADOR_<acción>` (por ejemplo, `CITA_OPERADOR_PASAR_A_ESPERA`).
- `recursoId` es el ID de la cita. En `CITA_RESERVAR` es el ID de la cita **nueva**: se deriva del usuario y de la clave, así que es el mismo en cada reintento. Una reserva completada tiene `httpStatus` 201. Si la reserva fue `RECHAZADA`, no existe ninguna cita con ese ID.
- `estado` solo puede ser `COMPLETADA` o `RECHAZADA` (no existe un estado "en proceso": la operación y su resultado se guardan en la misma transacción). Solo se guardan los rechazos de negocio (409 y 422, con `codigoError`); un 400 no se guarda.

404 `RECURSO_NO_ENCONTRADO` → la operación no se registró: el cliente puede reintentar **con la misma clave**. Solo el usuario que la ejecutó puede consultarla; para cualquier otro usuario también es 404.

## Desarrollo (perfil `dev`)

Las rutas `/api/v1/dev/**` solo existen en el perfil `dev`. **En producción responden 404 `RECURSO_NO_ENCONTRADO` a todos**, con o sin sesión y sea cual sea el rol, para no revelar que existen.

### `GET /dev/reloj` y `PUT /dev/reloj` (rol `ADMINISTRADOR`)
Simula la hora del servidor para probar ventanas, recordatorios e inasistencias.
`PUT` cuerpo `{ "ahora": "2026-11-06T15:25:00Z" }`, o `{ "ahora": null }` para volver a la hora real. Responde `{ "ahora": "…", "simulado": true }`.
La hora simulada solo afecta a las reglas de negocio (citas, recordatorios, inasistencias, reserva). Los bloqueos por intentos, los límites por origen y la vigencia de los enlaces de recuperación usan siempre la hora real.

---

# Ampliación v1.1 · Producto completo

Funciones que convierten el MVP en un producto usable de punta a punta: registro y recuperación de cuenta, reserva de citas, centro de notificaciones, indicadores (PB20–PB24) y bitácora (PB25). Mismas convenciones que arriba (Problem Details, CSRF, `Idempotency-Key` en las operaciones sobre citas, instantes en UTC).

## Códigos de error nuevos

| HTTP | `codigo` | Cuándo |
|---|---|---|
| 409 | `CORREO_REGISTRADO` | El correo ya tiene una cuenta (registro). |
| 422 | `CONTRASENA_INCORRECTA` | La contraseña actual no coincide (cambio de contraseña). |
| 422 | `ENLACE_INVALIDO` | El enlace de restablecimiento no existe, venció o ya se usó. |
| 422 | `LIMITE_CITAS` | La reserva supera un límite: ya hay 5 citas activas, una cita activa se cruza con el horario, o ya hay una cita activa de la misma especialidad ese día local. `detail` dice cuál y con qué cita. |
| 429 | `DEMASIADOS_INTENTOS` | Demasiados registros o solicitudes de recuperación desde el mismo origen, o cambio de contraseña durante el bloqueo por intentos fallidos. Siempre con la cabecera `Retry-After` (segundos); `detail` dice cuándo reintentar. |

La política de contraseñas se valida con 400 `VALIDACION` y `errores[]` en el campo `password` (o `nueva`):
- de 10 a 128 caracteres;
- al menos una letra y un número;
- distinta del correo y de la parte del correo antes de la arroba;
- fuera de una lista de contraseñas comunes.

## Sistema

### `GET /sistema/info` (pública)
200 → `{ "nombre": "SIGA-SP", "version": "1.1.0", "entorno": "desarrollo" | "produccion" }`
Cuando `entorno` es `desarrollo`, el frontend muestra una franja discreta: «Entorno de pruebas · datos ficticios».

## Cuenta

### `POST /auth/registro` (pública, con CSRF)
Cuerpo:
```json
{ "nombres": "Lucía", "apellidos": "Paredes Rojas", "email": "lucia.paredes@correo.test",
  "telefono": "+51 987 654 321", "password": "…", "aceptaPrivacidad": true }
```
- `nombres` y `apellidos`: de 2 a 80 caracteres; solo letras, espacios, apóstrofo y guion, sin separadores seguidos («Ana--María» no vale). Se quitan los espacios de los extremos y los repetidos.
- `email`: con el mismo formato que el perfil, de hasta 160 caracteres. Se guarda en minúsculas.
- `telefono`: **obligatorio**, con el mismo formato que el perfil.
- `password`: la política de contraseñas (ver [Códigos de error nuevos](#códigos-de-error-nuevos)).
- `aceptaPrivacidad` es obligatorio: debe ser `true` (consentimiento, Ley N.º 29733). Se guarda el instante de aceptación y la **versión de la política de privacidad** aceptada (`paciente.privacidad_version`), que viene de la propiedad `sigasp.privacidad.version` (hoy `"1.0"`).

201 → `UsuarioSesion` (rol `PACIENTE`). La sesión queda iniciada (cookie `SIGASP_SESSION` nueva).
Errores:
- 400 `VALIDACION`, con `errores[]` por campo;
- 409 `CORREO_REGISTRADO`;
- 429 `DEMASIADOS_INTENTOS`: más de 5 registros por hora desde la misma IP. Cuentan los intentos con datos válidos, también los que terminan en 409; los 400 no cuentan.

### `POST /auth/recuperacion` (pública, con CSRF)
Cuerpo: `{ "email": "…" }` → **202** con cualquier correo válido, exista o no la cuenta (no revela qué correos están registrados).
Si la cuenta existe y está activa, genera un enlace de un solo uso válido 30 minutos y lo «envía» por el canal de correo **simulado**: no se envía ningún correo real. Pedir un enlace nuevo no anula los anteriores.
Errores:
- 400 `VALIDACION` con `errores[]` en el campo `email` si falta o no tiene el formato del perfil. No depende de que la cuenta exista.
- 429 `DEMASIADOS_INTENTOS` si hay más de 5 solicitudes en 15 minutos para el mismo correo o la misma IP. Cuentan todas las solicitudes con un correo válido, exista o no la cuenta.

### `POST /auth/restablecer` (pública, con CSRF)
Cuerpo: `{ "token": "…", "password": "…" }` → 204.
- Cambia la contraseña, invalida todos los enlaces pendientes del usuario y levanta el bloqueo por intentos fallidos.
- Incrementa la versión de credenciales: **todas** las sesiones abiertas del usuario quedan invalidadas, también la del navegador desde el que se restablece. La persona debe volver a iniciar sesión.

Errores, en este orden: 422 `ENLACE_INVALIDO` (primero se comprueba el enlace) · 400 `VALIDACION` (política).
El enlace que llega en el correo tiene la forma `/restablecer?token=<token>`.

### `POST /cuenta/contrasena` (cualquier usuario autenticado)
Cuerpo: `{ "actual": "…", "nueva": "…" }` → 204.
- La nueva debe cumplir la política y ser distinta de la actual.
- Incrementa la versión de credenciales: se cierran las **demás** sesiones del usuario y la actual se renueva y sigue abierta.
- Una contraseña actual incorrecta cuenta como intento fallido para el bloqueo del login.

Errores, en este orden:
- 400 `VALIDACION`, con `errores[]` en `actual` (falta) o `nueva` (política, o igual a la actual);
- 429 `DEMASIADOS_INTENTOS` con `Retry-After` mientras la cuenta está bloqueada por intentos fallidos (del login o de este mismo formulario), aunque la contraseña actual sea correcta. `detail` explica el bloqueo, por ejemplo: «Por seguridad, el cambio de contraseña está bloqueado temporalmente porque hubo varios intentos fallidos con la contraseña de tu cuenta. Inténtalo nuevamente en 10 minutos.»;
- 422 `CONTRASENA_INCORRECTA`.

Antes de todo eso: 401 `NO_AUTENTICADO` sin sesión y 403 `CSRF_INVALIDO` sin token CSRF.

### `GET /dev/correos` (solo en el perfil `dev`; pública en ese perfil)
Buzón del correo simulado, para completar la recuperación en local.
200 → `[{ "id": "…", "destinatario": "…", "asunto": "…", "cuerpo": "…", "enlace": "/restablecer?token=…", "enviadoEn": "…" }]`, del más reciente al más antiguo; máximo 50.
En producción responde 404 a todos (ver [Desarrollo](#desarrollo-perfil-dev)).
**El cuerpo y el enlace solo se guardan con el buzón de desarrollo activo** (`sigasp.dev.buzon-correos=true`). En producción, `correo_simulado` guarda solo el asunto y el destinatario enmascarado, sin el cuerpo ni el enlace: el token de recuperación nunca queda en la BD en texto plano (`token_recuperacion` guarda solo su hash SHA-256).

## Reserva de citas (rol `PACIENTE`)

### `GET /catalogos/especialidades` (autenticado)
200 → `[{ "codigo": "CARDIO", "nombre": "Cardiología", "descripcion": "Corazón y sistema circulatorio" }]`, en orden alfabético.

### `GET /catalogos/profesionales?especialidad=CARDIO` (autenticado)
200 → `[{ "codigo": "P02", "nombre": "Dra. Lucía Paredes Rojas", "especialidad": { "codigo": "CARDIO", "nombre": "Cardiología" } }]`
Sin `especialidad`, devuelve todos los profesionales. Con un código inexistente, `[]`.

### `GET /catalogos/sedes` (autenticado)
200 → `[{ "codigo": "SURCO", "nombre": "Sede Surco", "direccion": "…" }]`

### `GET /pacientes/me/disponibilidad?especialidad=CARDIO&desde=2026-10-24&hasta=2026-11-06&profesional=P02`
200 → `[{ "horarioId": "…", "inicio": "…", "fin": "…", "profesional": {codigo, nombre}, "sede": {codigo, nombre} }]`, por inicio ascendente. Consultar no reserva.
- Horarios libres de la especialidad (o solo del `profesional`, que es opcional).
- **Anticipación mínima:** solo se ofrecen los horarios que empiezan en *ahora + 2 h* o después (`sigasp.reglas.anticipacion-reserva`, por defecto `PT2H`). Uno que empieza justo en *ahora + 2 h* sí se ofrece.
- `desde` y `hasta` son fechas locales de Lima y **ambos días se incluyen**. Por defecto, `desde` es hoy y `hasta` es `desde + 14` (15 días). Como máximo **31 días incluidos** (`hasta − desde ≤ 30`).
- No descuenta los horarios que se cruzan con otras citas del paciente: si elige uno, la reserva responde 422 `LIMITE_CITAS` con la cita concreta.

Errores 400 `VALIDACION`:

| Caso | Respuesta |
|---|---|
| Falta `especialidad` o no existe | `errores[]` con el campo `especialidad`. |
| `profesional` no existe o no atiende esa especialidad | `errores[]` con el campo `profesional`. |
| `hasta` anterior a `desde`, o más de 31 días | Solo `detail`. |
| `desde` o `hasta` sin el formato `YYYY-MM-DD` | Solo `detail`. |

Otros: 403 `ACCESO_DENEGADO` si el rol no es PACIENTE.

### `POST /pacientes/me/citas` (`Idempotency-Key`)
Cuerpo: `{ "horarioId": "…", "especialidadCodigo": "CARDIO" }` → **201** `CitaDetalle` (estado `PENDIENTE`, versión 1), con la cabecera `Location: /api/v1/pacientes/me/citas/{id}`.
- El código de la cita sigue el formato `SP-AAAA-NNNNNN`: año de creación y una secuencia de la BD (por ejemplo, `SP-2026-000123`). La secuencia puede dejar huecos.
- La cita aparece de inmediato en «Mis citas», genera el evento `CREADA` y el aviso «Reserva registrada».
- Se registra como operación `CITA_RESERVAR`: si la respuesta se pierde, `GET /operaciones/{clave}` devuelve en `recursoId` el ID de la cita creada.

Las reglas se comprueban en este orden:

| # | Regla | Si no se cumple |
|---|---|---|
| 1 | Cuerpo completo: `horarioId` (UUID) y `especialidadCodigo` (hasta 20 caracteres). | 400 `VALIDACION` con `errores[]` (`horarioId`, `especialidadCodigo`). Un `horarioId` que no es un UUID, o un cuerpo que no es JSON válido, responde 400 solo con `detail`. |
| 2 | La especialidad existe. | 400 `VALIDACION`, campo `especialidadCodigo`. |
| 3 | El horario existe. | 409 `HORARIO_NO_DISPONIBLE`. |
| 4 | La especialidad es la del profesional del horario. | 400 `VALIDACION`, campo `especialidadCodigo`. |
| 5 | El horario no ha empezado y empieza en *ahora + 2 h* o después (anticipación mínima). | 409 `HORARIO_NO_DISPONIBLE`, con `detail` como «Las citas se reservan con al menos 2 horas de anticipación. Elige un horario desde el 02/11/2026 a las 10:00.». |
| 6 | Como máximo **5 citas activas** (no terminales: Pendiente, Confirmada, Llegada registrada, En espera o En atención). | 422 `LIMITE_CITAS`: «Ya tienes 5 citas activas (pendientes, confirmadas o en curso), que es el máximo permitido. Para reservar otra, cancela alguna de tus próximas citas o espera a que se complete una.» |
| 7 | **Sin solapamiento**: ninguna cita activa del paciente tiene un intervalo `[inicio, fin)` (de su versión vigente) que se cruce con el del horario. Una cita que termina justo cuando empieza la otra no se cruza. | 422 `LIMITE_CITAS`: «Ya tienes una cita de Cardiología el 25/10/2026 a las 10:00 que se cruza con este horario.» |
| 8 | Como máximo **una cita activa por especialidad y día local** (de la hora prevista). | 422 `LIMITE_CITAS`: «Ya tienes una cita de Cardiología el 25/10/2026 a las 10:00. Solo se permite una cita por especialidad al día.» |
| 9 | El horario sigue libre al ocuparlo (ocupación atómica). | 409 `HORARIO_NO_DISPONIBLE`: otra persona lo tomó. |

- Fechas y horas de los mensajes en hora de Lima. Las citas canceladas, completadas o con inasistencia no cuentan para los límites.
- Las reservas de un mismo paciente se serializan: dos simultáneas no superan juntas los límites.
- Los rechazos 409 y 422 se guardan con la clave: repetirla devuelve el mismo rechazo. Los 400 no se guardan.
- Otros errores: 400 `IDEMPOTENCY_KEY_REQUERIDA` · 409 `IDEMPOTENCIA_CONFLICTO` · 403 `ACCESO_DENEGADO` si el rol no es PACIENTE.

## Notificaciones del paciente (rol `PACIENTE`)

### `GET /pacientes/me/notificaciones?limite=30`
200 → `NotificacionPaciente[]`, de la más reciente a la más antigua.
- `limite`: entero **de 1 a 100**; por defecto, 30. Fuera de ese rango, o si no es un número, responde 400 `VALIDACION` (solo `detail`).
```json
{ "id": "…", "tipo": "RECORDATORIO" | "CAMBIO", "titulo": "Recordatorio de tu cita",
  "mensaje": "Tienes la cita SP-2026-000123 de Cardiología mañana a las 09:00 en Sede Surco.",
  "citaId": "…", "citaCodigo": "SP-2026-000123", "creadaEn": "…", "leida": false }
```
- `titulo` según el tipo y el evento: «Recordatorio de tu cita», «Reserva registrada», «Asistencia confirmada», «Cita reprogramada» o «Cita cancelada».
- Solo incluye notificaciones en estado `ENVIADA_SIMULADA` de las citas propias: nunca las invalidadas ni las fallidas.

### `GET /pacientes/me/notificaciones/no-leidas`
200 → `{ "total": 3 }`.

### `POST /pacientes/me/notificaciones/{id}/lectura` → 204
### `POST /pacientes/me/notificaciones/lectura` → 204 (marca todas como leídas)
Ambas son idempotentes y no requieren `Idempotency-Key`. Marcar otra vez una notificación leída no cambia su fecha de lectura.
Una notificación inexistente **o ajena** responde 404 `RECURSO_NO_ENCONTRADO`; la ajena queda en la bitácora como `NOTIFICACION_ACCESO` DENEGADO.

## Indicadores (roles `RESPONSABLE` y `ADMINISTRADOR`)

### `GET /analitica/resumen?desde=2026-10-01&hasta=2026-10-31&sede=&especialidad=&profesional=`
- Fechas locales de Lima, con ambos extremos incluidos. Rango máximo: 366 días incluidos. Por defecto, el mes en curso; si solo llega una fecha, la otra toma el borde del mes en curso.
- Filtros opcionales por código (sede, especialidad y profesional). Un código inexistente da una población vacía.
- El corte t es el instante de la consulta (con precisión de microsegundos, la misma que usa la consulta).
- La población C(P,t) se define como en el apartado 13.5 del documento (ver `docs/reglas-dominio.md`).

200 →
```json
{
  "periodo": { "desde": "2026-10-01", "hasta": "2026-10-31" },
  "corte": "2026-10-23T14:00:00Z",
  "zonaHoraria": "America/Lima",
  "filtros": { "sede": null, "especialidad": null, "profesional": null },
  "totalCitas": 120,
  "porEstado": [ { "estado": "PENDIENTE", "etiqueta": "Pendiente", "total": 20 } ],
  "indicadores": {
    "confirmacion":   { "numerador": 60, "denominador": 120, "tasa": 50.0 },
    "cancelacion":    { "numerador": 10, "denominador": 120, "tasa": 8.3 },
    "reprogramacion": { "numerador": 15, "denominador": 120, "tasa": 12.5, "eventos": 18 },
    "inasistencia":   { "numerador": 6,  "denominador": 40,  "tasa": 15.0, "provisional": false, "pendientesDeClasificar": 0 },
    "esperaPromedioMinutos": { "valor": 12.4, "observaciones": 30, "excluidas": 2 }
  },
  "porDia": [ { "fecha": "2026-10-01", "total": 5, "completadas": 3, "canceladas": 1, "noAsistio": 1 } ],
  "porEspecialidad": [ { "codigo": "CARDIO", "nombre": "Cardiología", "total": 30, "tasaInasistencia": 10.0 } ]
}
```
- Si el denominador es 0, la `tasa` es `null` (el frontend muestra «No calculable», nunca 0 %).
- Las tasas se redondean a un decimal (mitad hacia arriba).
- `porEstado` incluye los 8 estados, aunque alguno tenga total 0.
- `reprogramacion.numerador` cuenta las citas reprogramadas al menos una vez; `reprogramacion.eventos` cuenta todos los eventos de reprogramación (una cita reprogramada dos veces suma 1 al numerador y 2 a `eventos`).
- `esperaPromedioMinutos`:
  - `valor` es la media en minutos de las **observaciones** válidas: llegada y atención registradas hasta el corte, y la atención no anterior a la llegada. Es `null` si no hay observaciones.
  - `excluidas` cuenta las citas que ya iniciaron la atención al corte (En atención o Completada) **sin** un par válido de marcas. No entran en la media, pero se informan.
  - Las citas que siguen en Llegada registrada o En espera no son observación ni excluida.
- `porDia` cubre cada día del periodo, sin huecos.
- `porEspecialidad` solo incluye especialidades con citas, de mayor a menor total y luego por nombre.

Errores 400 `VALIDACION` (solo `detail`): `desde` posterior a `hasta`; más de 366 días; una fecha sin el formato `YYYY-MM-DD`; un filtro con caracteres distintos de letras, dígitos, `-` y `_`, o de más de 20 caracteres. 403 `ACCESO_DENEGADO` para los demás roles.

### `GET /analitica/resumen.csv?…` (mismos parámetros y errores)
200 `text/csv; charset=UTF-8`, con `Content-Disposition: attachment; filename="indicadores-2026-10-01_2026-10-31.csv"`.

Formato:
- UTF-8 **con BOM** (para que Excel reconozca las tildes), separador `;`, punto decimal y saltos de línea CRLF. Los textos con `;`, comillas o saltos de línea van entre comillas dobles (RFC 4180).
- Línea 1: `Indicadores operativos SIGA-SP;Periodo;2026-10-01 a 2026-10-31;Corte;2026-10-23 09:00:00 (America/Lima);Corte UTC;2026-10-23T14:00:00Z;Sede;Todas;Especialidad;Todas;Profesional;Todos`.
- Después, secciones separadas por una línea en blanco, cada una con su fila de encabezado:

| Sección | Columnas |
|---|---|
| Indicadores | `Indicador;Numerador;Denominador;Tasa (%);Nota` (confirmación, cancelación, reprogramación con su número de eventos en la nota, inasistencia «Definitiva» o «Provisional: N cita(s) pendientes de clasificar») |
| Espera | `Espera promedio (min);Observaciones válidas;Excluidas` |
| Estados | `Estado;Citas`, los 8 estados y una fila `Total` |
| Días | `Fecha;Citas;Completadas;Canceladas;No asistió` |
| Especialidades | `Especialidad;Código;Citas;Tasa de inasistencia (%)` |

- Una tasa o una espera `null` se escribe «No calculable».
- Solo conteos agregados: ningún dato personal ni código de cita o paciente. Los textos que empiezan con `=`, `+`, `-`, `@`, tabulador o retorno de carro se anteponen con `'` (neutraliza fórmulas).
- Cada exportación queda en la bitácora como `INDICADORES_EXPORTAR` (con el periodo, el corte y los filtros, nunca el contenido).

## Bitácora (rol `ADMINISTRADOR`)

### `GET /admin/auditoria?desde=&hasta=&accion=&resultado=&usuario=&pagina=0&tamano=25`
- `desde` y `hasta`: fechas locales de Lima, opcionales, ambas incluidas.
- `accion`: coincidencia exacta, opcional (hasta 50 caracteres).
- `resultado` ∈ `EXITO`, `RECHAZO`, `DENEGADO`, `FALLO`.
- `usuario`: correo del actor, exacto y sin distinguir mayúsculas, opcional.
- `pagina`: desde 0. `tamano`: de 1 a 100; por defecto, 25.

200 →
```json
{ "elementos": [ { "id": 812, "ocurridoEn": "…", "actor": { "id": "…", "nombre": "Ana Lucía Torres Vega", "rol": "PACIENTE" },
                   "accion": "CITA_CONFIRMAR", "entidad": "CITA", "entidadId": "…", "resultado": "EXITO",
                   "codigo": null, "requestId": "7f3c2a9e4b1d" } ],
  "pagina": 0, "tamano": 25, "total": 812, "acciones": ["CITA_CANCELAR", "CITA_CONFIRMAR", "LOGIN", "…"] }
```
- `actor.rol` es el rol que tenía al actuar.
- `actor` es `null` cuando nadie con sesión hizo la acción. Según la acción, es un **proceso del sistema** o un **visitante sin sesión** (ver la tabla).
- `acciones` lista los valores distintos que hay en la bitácora, para el filtro.
- Orden: más reciente primero (`ocurridoEn` y, a igualdad, `id` descendente).
- No expone el `detalle` interno de cada entrada.
- Es de solo lectura: no existen endpoints de modificación.

Errores 400 `VALIDACION` (solo `detail`): `pagina` negativa, `tamano` fuera de 1–100, `desde` posterior a `hasta`, `accion` o `usuario` demasiado largos, o un `resultado` desconocido. 403 `ACCESO_DENEGADO` para los demás roles.

Acciones registradas:

| `accion` | Quién (`actor`) | Resultados |
|---|---|---|
| `LOGIN` | El usuario (EXITO). `null`, visitante sin sesión, si el inicio falla (DENEGADO, con `codigo` `CREDENCIALES_INVALIDAS` o `CUENTA_BLOQUEADA_TEMPORALMENTE`). | EXITO, DENEGADO |
| `LOGOUT` | El usuario. | EXITO |
| `REGISTRO` | La cuenta nueva (EXITO). `null`, visitante sin sesión, si el correo ya existe (RECHAZO, `CORREO_REGISTRADO`). | EXITO, RECHAZO |
| `RECUPERACION_SOLICITAR` | `null`: visitante sin sesión (solo cuando la cuenta existe; `entidadId` es el usuario). | EXITO |
| `CONTRASENA_RESTABLECER` | `null`: visitante sin sesión. | EXITO, RECHAZO (`ENLACE_INVALIDO`) |
| `CONTRASENA_CAMBIAR` | El usuario. | EXITO, RECHAZO |
| `PERFIL_ACTUALIZAR` | El paciente. | EXITO |
| `ACCESO_RUTA` | El usuario con sesión al que se le niega una ruta (las solicitudes anónimas rechazadas no se registran). | DENEGADO |
| `CITA_RESERVAR`, `CITA_CONFIRMAR`, `CITA_CANCELAR`, `CITA_REPROGRAMAR`, `CITA_PRE_CHECK_IN`, `CITA_REGISTRAR_LLEGADA` | El paciente. | EXITO, RECHAZO |
| `CITA_OPERADOR_<acción>` | El operador. | EXITO, RECHAZO |
| `CITA_ACCESO` | El usuario que intenta usar una cita ajena. | DENEGADO (`CITA_NO_ENCONTRADA`) |
| `NOTIFICACION_ACCESO` | El paciente que intenta leer una notificación ajena. | DENEGADO (`RECURSO_NO_ENCONTRADO`) |
| `CITA_REGISTRAR` | `null`: proceso del sistema (alta de una cita sin reserva del paciente, por ejemplo, la carga de datos). | EXITO |
| `CITA_MARCAR_NO_ASISTIO` | `null`: proceso del sistema (cierre automático por inasistencia). | EXITO |
| `INDICADORES_EXPORTAR` | El responsable o administrador que descarga el CSV. | EXITO |
