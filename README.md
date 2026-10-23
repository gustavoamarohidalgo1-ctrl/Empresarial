# SIGA-SP

**Sistema Integrado de Gestión de Atención Ambulatoria y Seguimiento del Paciente**: proyecto académico del curso *Sistemas de Información Empresarial* (UTP, sección 43221), con Clínica San Pablo Surco como caso de estudio.

Convierte los eventos del recorrido de una cita en información trazable:

- el paciente crea su cuenta, recupera o cambia su contraseña, reserva citas, las consulta, confirma, cancela, reprograma, completa el pre-check-in, registra su llegada y revisa sus notificaciones;
- el operador avanza la atención en el panel del día;
- el responsable consulta los indicadores operativos y los exporta a CSV;
- el administrador revisa la bitácora de auditoría;
- todo queda auditado y listo para medirse.

> **Solo datos ficticios.** El sistema no se conecta a sistemas de la clínica ni guarda datos clínicos o reales (HU20, Ley N.º 29733). Las cuentas de demostración usan los dominios reservados `correo.test` y `siga-sp.test`, y ningún correo sale del sistema (el canal de correo es simulado).

## Pila

| Capa | Tecnología |
|---|---|
| Backend | Java 21 · Spring Boot 4.1.1 · Spring Modulith 2.1 (monolito modular) · Spring Security 7 · JPA/Hibernate 7 |
| Base de datos | PostgreSQL 18 · migraciones Flyway |
| Frontend | Angular 22 (standalone, signals) · CSS propio accesible (WCAG 2.2 AA) |
| Pruebas | JUnit 5 + AssertJ · PostgreSQL embebido (sin Docker) · pruebas de Angular |
| API | REST `/api/v1`, errores RFC 9457 y OpenAPI/Swagger en el perfil dev |

## Puesta en marcha (desarrollo)

Requisitos: Java 21, Node 22.22 o superior (o 24.15+; lo exige Angular 22) y PostgreSQL 16 o superior en el PATH (o Docker).

```bash
# 1. Base de datos local del proyecto (puerto 5433; no toca otras instalaciones)
scripts/db.sh start            # alternativa con Docker: docker compose up -d

# 2. Backend en http://localhost:8080 (carga los datos de demostración la primera vez)
cd backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev

# 3. Frontend en http://localhost:4200 (redirige /api al backend)
cd frontend
npm install
npm start
```

### Cuentas de demostración (solo en el entorno local)
Todas usan la contraseña `SigaSp-Demo-2026`. La variable `SIGASP_DEMO_PASSWORD` permite cambiarla, pero solo surte efecto en la primera carga (con la BD vacía).

| Correo | Rol | Qué ver |
|---|---|---|
| `ana.torres@correo.test` | Paciente (Ana Lucía Torres Vega) | Historial completo (completadas, cancelada, inasistencia, reprogramadas), próximas citas pendientes y confirmadas, una cita de hoy dentro de la ventana de llegada, notificaciones y cupo para reservar |
| `luis.ramirez@correo.test` | Paciente (Luis Alberto Ramírez Soto) | Cita reprogramada (versión 2) por confirmar y una cita de hoy en espera |
| `rita.huaman@correo.test` | Paciente (Rita Huamán Flores) | Citas de varias especialidades, una inasistencia y una cita pendiente para hoy |
| `carla.mendoza@siga-sp.test` | Operadora (Sede Surco) | Día de hoy lleno: atendidas, en atención, en espera, con llegada registrada y por llegar |
| `renzo.palacios@siga-sp.test` | Operador (Sede San Isidro) | Panel del día de la Sede San Isidro |
| `jorge.salazar@siga-sp.test` | Responsable | Indicadores (`/indicadores`) y exportación CSV |
| `admin@siga-sp.test` | Administrador | Bitácora (`/admin/bitacora`), indicadores y reloj simulado `PUT /api/v1/dev/reloj` |

- Los datos son ficticios pero verosímiles: Sede Surco y Sede San Isidro, 8 especialidades, 14 profesionales con agenda semanal, 12 pacientes (todos con cuenta) y unas 150 citas entre hoy − 45 y hoy + 21 días, creadas y avanzadas por los mismos casos de uso de la API.
- Reserva: solo se ofrecen horarios que empiezan dentro de 2 horas o más (`sigasp.reglas.anticipacion-reserva`). Cada paciente puede tener hasta 5 citas activas, sin cruces de horario y una por especialidad al día.
- Recuperar contraseña en local: el enlace llega al buzón del correo simulado, en http://localhost:4200/dev/buzon (o `GET http://localhost:8080/api/v1/dev/correos`). Ningún correo sale del equipo y el buzón no existe en producción.
- Swagger UI: http://localhost:8080/swagger-ui.html (solo en el perfil dev).

### Reiniciar la base de datos
Las fechas de los datos de demostración son relativas al momento de la carga. Para regenerarlas, o si cambias de versión:

```bash
scripts/db.sh reset           # borra el clúster local y lo crea vacío
# con Docker: docker compose down -v && docker compose up -d
cd backend && ./mvnw spring-boot:run -Dspring-boot.run.profiles=dev    # vuelve a cargar los datos
```

Si la BD conserva datos de la versión 1.0 (cuentas `@ejemplo.invalid`, como «Ana Demo» o las citas `CIT001`), el backend **no arranca** en el perfil `dev`: lo indica en el log y pide ejecutar `scripts/db.sh reset`. Así no se mezclan los datos antiguos con los nuevos.

## Pruebas y operación

```bash
cd backend && ./mvnw test        # dominio, modularidad e integración con PostgreSQL embebido
cd frontend && npm test          # pruebas unitarias del frontend
scripts/db.sh respaldo           # respaldo completo (pg_dump)
scripts/db.sh restaurar <archivo>   # restaura en una BD vacía y verifica conteos y relaciones (RNF10)
```

## Producción

En producción, un solo jar de Spring Boot sirve el SPA de Angular y la API en el mismo origen, sin CORS ni servidor de archivos aparte.

```bash
scripts/construir-produccion.sh        # npm ci + ng build + ./mvnw -Pcon-frontend clean package
SIGASP_DB_URL=jdbc:postgresql://<host>:5432/siga_sp SIGASP_DB_USER=<usuario> SIGASP_DB_PASSWORD=<clave> \
  java -jar backend/target/siga-sp-backend-0.0.1-SNAPSHOT.jar
```

- **Rutas del SPA**: una recarga de `/paciente/...` u `/operador/...` devuelve `index.html`. `/api/**` y `/actuator/**` no cambian.
- **Caché**: los bundles con hash se guardan un año (`immutable`). `index.html` se revalida con ETag (`no-cache`). La API no se cachea.
- **Compresión y seguridad**: gzip para HTML, CSS, JS, JSON y SVG; CSP estricta en el HTML, `Permissions-Policy` y `Cross-Origin-Opener-Policy`.

Variables, perfiles, cabeceras y verificación con curl: [`docs/despliegue.md`](docs/despliegue.md).

## Estructura

```
siga-sp/
├── backend/                 Spring Boot (un paquete por módulo, ver docs/arquitectura.md)
│   └── src/main/resources/db/migration/   esquema versionado (Flyway)
├── frontend/                Angular (core/, shared/, features/)
├── docs/
│   ├── api.md                   contrato de la API (fuente de verdad frontend ↔ backend)
│   ├── arquitectura.md          módulos, decisiones, seguridad, concurrencia y pruebas
│   ├── modelo-datos.md          modelo lógico y físico con diagrama ER
│   ├── reglas-dominio.md        máquina de estados, ventanas e idempotencia
│   └── decisiones-pendientes-po.md   decisiones tomadas y preguntas para el Product Owner
├── scripts/db.sh            PostgreSQL local de desarrollo
└── docker-compose.yml       alternativa con Docker
```

## Estado del Product Backlog en esta base

| PB | Ítem | Prioridad | Estado |
|---|---|---|---|
| PB01 | Autenticación | Must | Hecho: sesión de servidor, CSRF y bloqueo por intentos |
| PB02 | Control de acceso por roles | Must | Hecho: rol y propiedad de cada recurso |
| PB03 | Perfil no clínico | Should | Hecho |
| PB04 | Consultar próximas citas y detalle | Must | Hecho |
| PB05 | Línea de tiempo | Must | Hecho |
| PB06 | Confirmar asistencia | Must | Hecho (idempotente) |
| PB07 | Cancelar con motivo | Must | Hecho |
| PB08 | Reprogramar con disponibilidad | Must | Hecho: reserva atómica y conflicto controlado |
| PB09 | Motivo y trazabilidad del cambio | Must | Hecho |
| PB10 | Recordatorio previo | Must | Hecho (envío simulado) |
| PB11 | Aviso de cambios | Should | Hecho: avisos (también de la reserva) y centro de notificaciones del paciente con contador de no leídas (v1.1) |
| PB12–PB13 | Pre-check-in y validación de datos | Must | Hecho; los campos están por definir con admisión (B5) |
| PB14 | Registrar llegada | Must | Hecho (paciente u operador) |
| PB15 | Estado general del turno | Must | Parcial: el estado está en el detalle; falta la vista simplificada (B7) |
| PB16–PB17 | Estados por el operador y transiciones válidas | Must | Hecho |
| PB18–PB19 | Encuesta | Should | Pendiente (S4); la tabla existe |
| PB20–PB24 | Dashboard e indicadores | Must/Should | Hecho (v1.1): confirmación, cancelación, reprogramación, inasistencia y espera al corte (apartado 13.5), con filtros, gráficos accesibles y exportación CSV |
| PB25 | Visor de bitácora | Must | Hecho (v1.1): consulta paginada y filtrable, solo lectura, para el administrador |
| PB26–PB27 | Parámetros, usuarios y roles | Should | Pendiente (hoy los parámetros están en `application.yml`) |
| PB28–PB29 | Agenda externa simulada | Should | El puerto `Agenda` está listo; el adaptador externo está pendiente |
| PB30 | Catálogo de API | Should | OpenAPI y `docs/api.md` hechos |
| PB31 | Responsividad y accesibilidad | Must | En el frontend; la verificación final es del Sprint 4 |
| RNF08 | Rendimiento (p95 ≤ 3 s, 10 usuarios, 1 000 citas) | — | **Pendiente**: falta el script de carga (k6 o JMeter) y el reporte |
| RNF10 | Respaldo y restauración | — | Hecho: `scripts/db.sh respaldo` y `restaurar`, con verificación |
| PB32 | Ayuda contextual | Could | Pendiente |
| v1.1 | Producto completo | — | Hecho: página de inicio pública, registro con consentimiento (versión de la política guardada), recuperación y cambio de contraseña (invalidan las demás sesiones), reserva de citas por especialidad con límites, anticipación mínima y sin cruces, centro de notificaciones, indicadores, bitácora y datos de demostración realistas |

Las decisiones que el documento dejaba abiertas están en [`docs/decisiones-pendientes-po.md`](docs/decisiones-pendientes-po.md).
