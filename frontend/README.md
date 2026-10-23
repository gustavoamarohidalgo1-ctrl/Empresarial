# SIGA-SP · Frontend web

Interfaz web de SIGA-SP, el sistema complementario para la atención ambulatoria de una clínica
(curso Sistemas de Información Empresarial, UTP). Los **pacientes** consultan y gestionan sus citas;
los **operadores** registran el avance de la atención. Toda la interfaz está en español de Perú y
las fechas se muestran siempre en hora de Lima (`America/Lima`).

El contrato con el backend está en [`../docs/api.md`](../docs/api.md) y es la fuente de verdad.

## Requisitos

- Node.js 22 o superior (probado con Node 24) y npm.
- El backend de Spring Boot escuchando en `http://localhost:8080` para usar la app de verdad.
  Las pruebas unitarias **no** necesitan el backend.

## Cómo correrlo

```bash
cd siga-sp/frontend
npm install
npm start            # ng serve → http://localhost:4200
```

`ng serve` usa `proxy.conf.json`: todo lo que empieza con `/api` se redirige a
`http://localhost:8080`, así que no hace falta CORS y las cookies de sesión (`SIGASP_SESSION`) y
CSRF (`XSRF-TOKEN`) son del mismo origen.

Otros comandos:

| Comando | Qué hace |
|---|---|
| `npm run build` | Compila para producción en `dist/frontend`. |
| `npm test` | Pruebas unitarias (Vitest) en modo observación. |
| `npm run test:ci` | Pruebas unitarias una sola vez, sin modo observación (`ng test --watch=false`). |
| `npm run format` | Formatea el código con Prettier. |
| `npm run presupuesto` | Tras `npm run build`: comprueba que el JS inicial sea ≤ 90 kB transferidos (brotli; informa también gzip). |
| `npm run contraste` | Comprueba el contraste WCAG 2.2 AA de los tokens de `styles.css` en los temas claro y oscuro. |

El sistema de diseño (tokens, componentes, clases y patrones) está en [`../docs/diseno.md`](../docs/diseno.md), con una sección «Uso para desarrolladores».

## Rutas

| Ruta | Rol | Pantalla |
|---|---|---|
| `/login` | Invitado | LF01 · Inicio de sesión. Tras el login redirige según el rol. |
| `/paciente/citas` | PACIENTE | LF02 · Mis citas, con pestañas Próximas e Historial (`?alcance=historial`). |
| `/paciente/citas/:id` | PACIENTE | LF03 · Detalle, línea de tiempo y acciones según `accionesPermitidas` (Confirmar y Registrar llegada se ejecutan aquí). |
| `/paciente/citas/:id/reprogramar` | PACIENTE | LF04 · Horarios por día, motivo y resumen antes de guardar. |
| `/paciente/citas/:id/cancelar` | PACIENTE | LF05 · Motivo, advertencia y casilla «Comprendo que esta cita se cerrará». |
| `/paciente/citas/:id/pre-check-in` | PACIENTE | LF06 · Datos de contacto prellenados y casilla «Mis datos son correctos». |
| `/paciente/perfil` | PACIENTE | Ver y editar correo y teléfono. |
| `/operador` | OPERADOR | LF07 · Citas del día (hoy en Lima por defecto) y transiciones. |
| `/inicio` | RESPONSABLE, ADMINISTRADOR | Aviso de que el dashboard (LF08) llega en el Sprint 4. |
| `/acceso-denegado` | Cualquiera | Se muestra ante un 403 o un rol sin permiso. |

## Estructura

```text
src/
├── styles.css                 Sistema de diseño: fuente, tokens claro/oscuro, base, componentes y utilidades
├── testing/                   Datos sintéticos y ayudantes de DOM para las pruebas
└── app/
    ├── app.*                  Cascarón: «Saltar al contenido», cabecera, <main>, pie
    ├── app.config.ts          HttpClient + XSRF, interceptor, CSRF, TitleStrategy, precarga y View Transitions
    ├── app.routes.ts          Rutas con carga diferida, authGuard y roleGuard
    ├── core/
    │   ├── auth/              AuthService (sesión en memoria), authGuard, roleGuard, roles
    │   ├── avisos/            Mensajes que sobreviven a una navegación
    │   ├── cache/             CacheService: memoria y stale-while-revalidate (ligada al usuario)
    │   ├── catalogos/         Catálogo de motivos (en caché durante la sesión)
    │   ├── errores/           ErrorService: problem+json → mensajes para el usuario
    │   ├── http/              Base de la API, interceptor de sesión, inicializador CSRF
    │   ├── idempotencia/      IdempotenciaService e IntencionIdempotente
    │   ├── modelos/           Tipos TypeScript del contrato (contrato.ts)
    │   ├── precarga/          Precarga de módulos lazy según el rol, en tiempo ocioso
    │   ├── tema/              Tema Claro/Oscuro/Sistema (se aplica en main.ts)
    │   ├── titulo/            TitleStrategy («<página> · SIGA-SP»)
    │   └── transiciones/      View Transitions omitidas con movimiento reducido
    ├── shared/
    │   ├── components/        cabecera de la aplicación
    │   ├── ui/                Componentes base: icono, marca, esqueleto, estado-vacio,
    │   │                      encabezado-pagina, ficha-fecha, linea-tiempo, estado-cita, aviso
    │   ├── paginas/           Página no encontrada
    │   ├── pipes/             fechaLima
    │   ├── utils/             Utilidades de fecha (Lima) y mensajes de acción
    │   └── validadores/       Validación de correo y teléfono
    └── features/
        ├── auth/              login, acceso-denegado
        ├── inicio/            Inicio de responsables y administradores
        ├── paciente/          mis-citas, detalle-cita, reprogramar-cita, cancelar-cita,
        │                      pre-check-in, perfil y PacienteApiService
        └── operador/          panel y OperadorApiService
```

Componentes standalone, signals, el nuevo control flow (`@if`, `@for`, `@switch`), detección de
cambios sin zone.js y `OnPush`. Sin librerías de UI ni recursos de CDN: fuentes del sistema y CSS
propio.

## Decisiones técnicas

### Sesión y CSRF
- La identidad vive en la cookie HttpOnly del servidor. El frontend solo guarda en memoria el
  `UsuarioSesion`; no usa `localStorage` ni `sessionStorage`.
- `provideHttpClient(withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }))`.
- Un inicializador de aplicación llama a `GET /api/v1/auth/csrf` al arrancar. Si el servidor no
  responde, la app arranca igual. `AuthService.login()` pide el token solo si la cookie aún no
  existe y reintenta una vez ante `CSRF_INVALIDO`. No lo vuelve a pedir después del login: según
  `docs/api.md`, el token del cuerpo es el mismo de la cookie y sigue siendo válido tras autenticarse.
- Cerrar sesión (`POST /auth/logout`) solo da la sesión por cerrada si el servidor responde 2xx o
  401 (ya no existía). Ante `CSRF_INVALIDO` renueva el token y reintenta una vez. Ante cualquier otro
  error conserva la sesión y muestra «No pudimos cerrar la sesión en el servidor; inténtalo de nuevo».
- El interceptor de sesión redirige a `/login` ante un 401 fuera del login. Ante un 403
  `ACCESO_DENEGADO` vuelve a verificar `GET /auth/sesion` (el rol pudo cambiar en otra pestaña; así
  no se forma un bucle con el usuario en caché) y muestra `/acceso-denegado`. Ante `CSRF_INVALIDO`
  solo renueva el token.

### Idempotencia (`core/idempotencia`)
- Cada intención del usuario (p. ej. «confirmar CIT001») tiene una `IntencionIdempotente`, que
  genera la clave con `crypto.randomUUID()` (o con `getRandomValues` fuera de un contexto seguro).
  La clave se reutiliza mientras el contenido no cambie y se descarta cuando hay un resultado
  definitivo.
- Si la respuesta se pierde (estado 0, o un 502/503/504 sin `problem+json`), se consulta
  `GET /api/v1/operaciones/{clave}`:
  - 200 `COMPLETADA`: se recarga y se muestra el éxito.
  - 200 `RECHAZADA`: se muestra el error.
  - 404 `RECURSO_NO_ENCONTRADO`: se ofrece «Reintentar» con la **misma** clave.
  - Si la consulta también falla, se informa que no se sabe el resultado y se ofrece reintentar con
    la misma clave. Nunca se declara éxito ni rechazo sin saberlo.
- Si después de un éxito verificado falla la recarga de la cita, el aviso de éxito se conserva y el
  problema de recarga se muestra como texto secundario.
- Las acciones se cancelan al salir de la pantalla (`takeUntilDestroyed`): no redirigen ni dejan
  avisos caducados.

### Errores
`ErrorService` traduce `application/problem+json`: usa `detail` cuando existe y, si no, un mensaje
por `codigo` o por estado HTTP. Los 5xx nunca muestran el detalle del servidor, solo el `requestId`
como código de referencia. Los `errores[]` se muestran junto a cada campo. Al cargar una cita por
ID, un 404 o un 400 `VALIDACION` (ID mal formado) se muestran como «Cita no encontrada», sin un
«Reintentar» inútil.

### Fechas
Utilidades y pipe `fechaLima` con `Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima' })`.
Nunca se usa la zona horaria del navegador; las pruebas pasan igual con `TZ=Asia/Tokyo` o `TZ=UTC`.
Los horarios para reprogramar se piden de hoy a hoy + 14 días (fechas de Lima, el valor por defecto
de la API; el máximo es 31). En el panel del operador, «hoy» se recalcula cada minuto, así que el
botón «Hoy» sigue siendo correcto después de la medianoche de Lima.

### Accesibilidad (WCAG 2.2 AA)
- Enlace «Saltar al contenido», etiquetas visibles asociadas, foco visible y foco en el contenido al
  cambiar de página.
- `aria-live` para los resultados, `aria-busy` durante las cargas y pestañas con el patrón WAI-ARIA
  (flechas, Inicio y Fin). Las regiones `aria-live` existen desde que se abre la pantalla, para que
  también se anuncien los avisos que llegan de otra pantalla.
- Tras una acción (Confirmar, Registrar llegada, transiciones del operador, reprogramar), el foco va
  al aviso de resultado (`tabindex="-1"`), porque el botón pulsado puede desaparecer.
- Contraste de 4,5:1 o más en todos los pares de color (el más bajo es 6,6:1).
- Estados con texto y símbolo, no solo con color.
- Título por ruta y botones deshabilitados con la explicación visible.
- Sin scroll horizontal en 360, 768 y 1366 px: en pantallas angostas, la tabla del operador se
  muestra como tarjetas.

## Pruebas

Vitest con `TestBed` y `HttpTestingController` (sin backend). Cubren:

- Servicios de sesión, errores e idempotencia.
- Guardas, interceptor, TitleStrategy y pipe de fechas.
- Componentes: login, mis citas, detalle con acciones condicionadas, reprogramar, cancelar,
  pre-check-in, perfil, panel del operador, cabecera y cascarón.

```bash
npm run test:ci
```
