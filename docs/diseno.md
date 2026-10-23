# Sistema de diseño de SIGA-SP

**Concepto: «cuidado sereno y confiable».** Lo primero es la claridad: el paciente debe entender en 3 segundos cuál es su próxima cita y qué puede hacer con ella. El violeta de los prototipos (MF01–MF08) se mantiene como marca y se moderniza. Un acento verde azulado aporta el tono de salud. La interfaz debe ser sobria y espaciosa, con jerarquía tipográfica fuerte y color con significado, nunca decorativo.

> Implementación: `frontend/src/styles.css` (tokens, base, clases), `frontend/src/app/shared/ui/` (componentes), `frontend/src/app/core/{tema,precarga,cache,transiciones}` (infraestructura). La sección 7 («Uso para desarrolladores») explica cómo usarlo todo; la 6 lista lo que se ajustó respecto a esta especificación y por qué.

## 1. Tokens

Todos los colores son variables CSS en `:root`, se redefinen en modo oscuro y se verifican a 4,5:1 (texto) y 3:1 (bordes de controles e iconos informativos) en **ambos** temas (sección 5; `npm run contraste` lo comprueba).

Hay dos capas:

- **Paleta** (`--p-*`, `--a-*`, `--n-*`): los valores de esta tabla. En modo oscuro la paleta se **redefine por rol** (p. ej. `--n-0` sigue siendo «superficie» y `--n-950` «texto más fuerte»), así que las reglas de uso («bordes `--n-200`», «fondo `--n-50`») valen en los dos temas.
- **Roles** (`--c-*`): lo que deben usar los componentes (`--c-texto`, `--c-superficie`, `--c-primario`…). Ver § 7.2.

### Color de marca y neutros
| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--p-900` | `#2E1650` | `#EDE5FF` | Texto sobre fondos de marca suaves, títulos de marca |
| `--p-800` | `#42207A` | `#A487EA` | Primario presionado (*añadido*) |
| `--p-700` | `#52298F` | `#B79EF2` | **Primario**: botones primarios, enlaces, selección |
| `--p-600` | `#6638B0` | `#C9B6F7` | Hover del primario y anillo de foco |
| `--p-400` | `#8D6BCB` | `#9A7FE0` | Borde de botones secundarios y de selección, 3:1 (*añadido*) |
| `--p-200` | `#DCCFF5` | `#3D2E63` | Borde de bloques destacados (*añadido*) |
| `--p-100` | `#EDE6FA` | `#2E2248` | Fondos de selección y resaltado |
| `--p-50` | `#F7F3FD` | `#1F1830` | Fondo de bloques destacados |
| `--a-700` | `#0F766E` | `#5EEAD4` | Acento (salud, confirmaciones positivas suaves) |
| `--a-50` | `#F0FDFA` | `#0E2A28` | Fondo del acento |
| `--a-800`, `--a-400`, `--a-100` | `#115E59`, `#2DD4BF`, `#CCFBF1` | `#99F6E4`, `#2DD4BF`, `#134E4A` | Variantes del acento (*añadidas*) |
| `--n-950` | `#14121A` | `#F4F2F7` | Texto principal |
| `--n-900` | `#221F2A` | `#E4E1EA` | |
| `--n-700` | `#3F3B48` | `#CBC6D3` | |
| `--n-600` | `#57525F` | `#B3ADBE` | Texto secundario |
| `--n-500` | `#7D7788` | `#8A8496` | Bordes de controles (≥ 3:1) |
| `--n-300` | `#B5B0BD` | `#4B4657` | Divisores fuertes |
| `--n-200` | `#E2DFE7` | `#2F2A39` | Bordes de 1 px |
| `--n-100` | `#EFEDF2` | `#221E2A` | Superficie secundaria |
| `--n-50` | `#F7F6F9` | `#110F16` | Fondo de la app |
| `--n-0` | `#FFFFFF` | `#1A1721` | Superficies |

### Estados de la cita (siempre con icono + texto, nunca solo color)
| Estado | Token | Claro: texto / fondo | Oscuro: texto / fondo | Icono (lucide) |
|---|---|---|---|---|
| Pendiente | `--estado-pendiente` | `#92400E` / `#FEF3C7` | `#FCD58A` / `#3A2A0C` | `clock` |
| Confirmada | `--estado-confirmada` | `#3730A3` / `#E0E7FF` | `#C7D2FE` / `#262A5A` | `check-circle` |
| Llegada registrada | `--estado-llegada` | `#155E75` / `#CFFAFE` | `#9EEBF7` / `#0D3640` | `map-pin` |
| En espera | `--estado-espera` | `#075985` / `#E0F2FE` | `#B7E1FC` / `#0D2F4A` | `hourglass` |
| En atención | `--estado-atencion` | `#5B21B6` / `#EDE9FE` | `#DCD3FE` / `#33215E` | `stethoscope` |
| Completada | `--estado-completada` | `#166534` / `#DCFCE7` | `#ABF0C4` / `#0F3520` | `check-check` |
| Cancelada | `--estado-cancelada` | `#9F1239` / `#FFE4E6` | `#FDC5CE` / `#45121F` | `x-circle` |
| No asistió | `--estado-no-asistio` | `#3F3B48` / `#E2DFE7` | `#DAD6E2` / `#33303B` | `user-x` |

El fondo de cada estado es el mismo token con el sufijo `-fondo` (`--estado-pendiente-fondo`).

Semánticos (`--c-exito`, `--c-error`, `--c-advertencia`, `--c-info`, cada uno con `-suave`): éxito `#15803D` / `#F0FDF4`, error `#B91C1C` / `#FEF2F2`, advertencia `#B45309` / `#FFFBEB`, información `#1D4ED8` / `#EFF6FF`. En oscuro: `#4ADE80` / `#0C2716`, `#F87171` / `#341114`, `#FBBF24` / `#30220A`, `#7DB3FB` / `#0F1F3A`.

### Tipografía
- **Inter Variable**, alojada en el propio proyecto (`@fontsource-variable/inter@5.3.0`, solo el subconjunto latino, `font-display: swap`). La alternativa es la fuente del sistema. Nada de CDN.
- Escala (rem): 0.75 · 0.8125 · 0.875 · 1 · 1.125 · 1.25 · 1.5 · 1.875 · 2.25 → tokens `--t-12`, `--t-13`, `--t-14`, `--t-16`, `--t-18`, `--t-20`, `--t-24`, `--t-30`, `--t-36` (el número es el equivalente en px).
- Pesos 400, 500, 600 y 700 (la fuente variable admite intermedios: los h2 usan 650). Títulos con `letter-spacing: -0.015em` e interlineado 1.2; cuerpo con interlineado 1.55.
- Horas y fechas con `font-variant-numeric: tabular-nums` (todo `<time>` lo tiene por defecto; clase `.tabular` para lo demás).

### Espacio, forma y profundidad
- Base de 4 px (`--e-1` = 4 px … `--e-12` = 48 px; `--e-n` = n × 4 px).
- Radios: 8 px en controles (`--r-control`), 12 px en tarjetas (`--r-tarjeta`), 16 px en bloques destacados (`--r-bloque`) y `999px` en píldoras (`--r-pildora`). `--r-sm` = 6 px para detalles pequeños.
- Sombras suaves y escasas, con un ligero tinte violeta: `--sombra-1` (tarjeta), `--sombra-2` (elemento elevado o en hover), `--sombra-3` (menús y diálogos). En oscuro son negras y más densas.
- Bordes de 1 px `--n-200` (`--c-borde`). El fondo de la app es `--n-50` (`--c-fondo`); las superficies son `--n-0` (`--c-superficie`).

### Movimiento
- Entre 150 y 200 ms (`--dur-1`, `--dur-2`), con `cubic-bezier(.2,.8,.2,1)` (`--curva`).
- Transiciones de vista entre rutas (`withViewTransitions`): solo el contenido principal hace un fundido corto; la cabecera no se anima.
- **Todo** se desactiva con `prefers-reduced-motion: reduce` (regla global, tokens de duración a 0, esqueletos sin brillo y transición de vista omitida).

### Modo oscuro
Por defecto sigue `prefers-color-scheme`, con un selector manual (Claro, Oscuro o Sistema) en el menú de usuario. La preferencia se guarda en `localStorage` (`siga-sp.tema`), siempre dentro de un try/catch, y se aplica en `main.ts` antes del primer render con las clases `.tema-claro` / `.tema-oscuro` en `<html>` (sin script en línea: compatible con una CSP estricta).

## 2. Componentes base (`shared/ui/`)

| Componente | Estado | Notas |
|---|---|---|
| `app-icono` | ✔ | SVG en línea a partir de un registro de 39 rutas de **lucide** (licencia ISC; la nota de licencia va en `iconos.ts`). Trazo de 1.75 y `aria-hidden` por defecto. |
| Botón (clases `.btn`) | ✔ | Variantes: primario, secundario, fantasma y peligro. Tamaños sm, md y lg. Admite icono, estado *cargando* con spinner en línea (sin cambiar el ancho) y bloqueo con su explicación. Área táctil de 44 px o más. |
| `.tarjeta` | ✔ | Superficie, borde, radio de 12 px y `--sombra-1`. Variantes interactiva (hover elevado), destacada y suave. No hace falta un componente `app-tarjeta` (§ 6). |
| `app-estado-cita` | ✔ | Píldora con icono y texto, según la tabla de estados. |
| `app-aviso` | ✔ | Variantes de información, éxito, advertencia y error. Lleva icono, título, texto y acciones; región viva opcional. |
| `app-esqueleto` | ✔ | Bloques con brillo sutil, que se desactiva con movimiento reducido. Reservan el tamaño final para que nada salte (CLS ≈ 0). |
| `app-estado-vacio` | ✔ | Ilustración SVG ligera (4 variantes), título, texto y acción. |
| `app-encabezado-pagina` | ✔ | Migas de pan, título, subtítulo y acciones. |
| `app-ficha-fecha` | ✔ | Bloque de calendario: mes abreviado, día grande y día de la semana. Siempre en America/Lima. |
| `app-linea-tiempo` | ✔ | Icono por tipo de evento, conector vertical y hora tabular. El evento más reciente va destacado. |
| `app-marca` | ✔ (*añadido*) | Isotipo SVG + «SIGA-SP». Lo usan la cabecera, el pie y lo usará el login. |
| Campos de formulario | ✔ | Etiqueta visible, ayuda, y error con icono y `aria-describedby`. Las casillas son grandes. |
| Pestañas segmentadas y chips | ✔ | Para próximas e historial, filtros de estado y días al reprogramar. |
| Cabecera de la app | ✔ | Marca (isotipo SVG + «SIGA-SP»), navegación con iconos, chip de usuario con iniciales y menú (tema y cerrar sesión). En móvil, un botón de menú abre la navegación. |

## 3. Patrones por pantalla
- **Login**: diseño partido. A la izquierda, un panel de marca con ilustración abstracta en SVG y tres beneficios; a la derecha, el formulario. En móvil solo queda el formulario con la marca arriba.
- **Mis citas (paciente)**: arriba, una tarjeta destacada con la **próxima cita**, que muestra la ficha de fecha, una cuenta regresiva («en 3 días», «hoy a las 09:00»), el estado y las acciones rápidas que permita la cita. Debajo, pestañas Próximas e Historial y una lista de tarjetas con ficha de fecha. Mientras carga se ven esqueletos; si no hay citas, un estado vacío.
- **Detalle**: dos columnas en escritorio (datos y acciones a la izquierda; ventana de llegada y línea de tiempo a la derecha) y una sola en móvil. Las acciones van agrupadas, con la principal destacada.
- **Reprogramar**: chips de días (con cuántos horarios libres tiene cada uno), una rejilla de horas y un resumen fijo («de → a»).
- **Cancelar y pre-check-in**: tarjeta centrada, con la consecuencia explicada antes de la acción.
- **Panel del operador**:
  - indicadores del día (total, por llegar, en espera, en atención, completadas);
  - filtros por estado con chips;
  - una tabla moderna en escritorio y tarjetas en móvil;
  - actualización automática opcional cada 60 s, en pausa si la pestaña está oculta.

## 4. Rendimiento (presupuestos)
- JS inicial ≤ 90 kB transferidos. La fuente se carga aparte y no bloquea el render.
  - Se mide como el «Estimated transfer size» de `ng build` (brotli). `npm run build && npm run presupuesto` lo comprueba e informa también el tamaño con gzip.
  - Medición actual: **86,97 kB** brotli (97,9 kB gzip). Antes del rediseño: 82,2 kB brotli (92,5 kB gzip).
  - Con solo gzip (compresión por defecto de Spring Boot) se supera el objetivo, como ya ocurría antes del rediseño; ver pendientes en § 6.
- `angular.json` (producción): inicial ≤ 360 kB sin comprimir (aviso) / 400 kB (error) —equivale a ~90 kB brotli de JS más ~6 kB de CSS—; `styles` ≤ 36 kB / 48 kB; estilos de cada componente ≤ 6 kB / 10 kB. Sin CSS crítico en línea (`inlineCritical: false`): Beasties añade un `<script>` en línea que rompería una CSP estricta.
- Los módulos lazy del rol del usuario se precargan cuando el navegador está ocioso (si no está activo el ahorro de datos ni la red es 2G). Ver `core/precarga`.
- Datos:
  - los catálogos (motivos) se guardan en memoria (hecho: `CatalogoService` usa `CacheService.obtener`);
  - la lista y el detalle usan *stale-while-revalidate*: se muestra lo guardado al volver y se actualiza en segundo plano (`CacheService.swr`, § 7.6; lo aplica cada pantalla al migrar).
- Todos los estados de carga usan esqueletos con el tamaño final reservado (§ 7.5).
- En producción, Spring Boot sirve el build:
  - compresión gzip (mejor: servir `.br` precomprimidos);
  - `Cache-Control: public, max-age=31536000, immutable` para los archivos con hash;
  - `no-cache` para `index.html`.

## 5. Contraste verificado (WCAG 2.2 AA)

`npm run contraste` lee los tokens de `styles.css`, resuelve los `var()` y comprueba 66 pares × 2 temas (132 combinaciones); además verifica que los dos bloques del tema oscuro (por sistema y manual) sean idénticos. Pares críticos:

| Primer plano / fondo | Mínimo | Claro | Oscuro |
|---|---|---|---|
| `--c-texto` / `--c-fondo` | 4,5 | 17,24 | 17,11 |
| `--c-texto-2` / `--c-superficie-2` | 4,5 | 6,50 | 7,49 |
| `--c-texto-2` / `--c-superficie-3` (hover) | 4,5 | 5,74 | 6,38 |
| `--c-sobre-primario` / `--c-primario` (botón primario) | 4,5 | 10,13 | 7,97 |
| `--c-sobre-primario` / `--c-primario-hover` | 4,5 | 7,62 | 10,00 |
| `--c-enlace` / `--c-superficie-2` | 4,5 | 8,72 | 7,14 |
| `--c-primario` / `--c-primario-suave` (navegación activa) | 4,5 | 8,35 | 6,39 |
| `--c-primario-fuerte` / `--c-primario-suave` (avatar, ficha) | 4,5 | 12,85 | 11,99 |
| `--c-acento` / `--c-acento-suave` | 4,5 | 5,25 | 10,28 |
| `--c-exito` / `--c-exito-suave` (el par más justo) | 4,5 | 4,79 | 9,15 |
| `--c-advertencia` / `--c-advertencia-suave` | 4,5 | 4,84 | 9,26 |
| `--c-error` / `--c-error-suave` | 4,5 | 5,91 | 6,14 |
| `--c-sobre-peligro` / `--c-peligro` (botón peligro) | 4,5 | 6,47 | 6,71 |
| Estados: el par más bajo (Pendiente) | 4,5 | 6,37 | 9,04 (No asistió) |
| `--c-borde-control` / `--c-superficie-2` (campos, chips) | 3 | 3,71 | 4,52 |
| `--c-borde-control` / `--c-superficie-elevada` (menú) | 3 | 4,32 | 4,31 |
| `--c-primario-borde` / `--c-superficie-2` (botón secundario, segmento activo) | 3 | 3,54 | 5,04 |
| `--c-foco` / `--c-superficie-2` (anillo de foco) | 3 | 6,55 | 8,95 |
| `--c-advertencia` / `--c-superficie` (icono) | 3 | 5,02 | 10,58 |

Además: el estado seleccionado de las pestañas segmentadas y la página actual de la navegación no dependen solo del color de fondo (borde de 1 px `--c-primario-borde` ≥ 3:1 y barra de 2 px `--c-primario`, respectivamente); en modo de alto contraste de Windows (`forced-colors`) los controles conservan su contorno.

## 6. Cambios respecto a la especificación (y por qué)

1. **Tokens de rol `--c-*`** sobre la paleta. La especificación nombra la paleta; los componentes necesitan roles («texto secundario», «borde de control») para que el modo oscuro sea un cambio de valores y no de código. La paleta se redefine por rol en oscuro.
2. **Pasos de paleta añadidos** (`--p-800/400/200`, `--a-800/400/100`) y valores concretos de la escala neutra (la especificación solo fijaba 950 y 0): hacían falta para el presionado, los bordes de 3:1 y los bloques destacados.
3. **Tokens de tipo `--t-12…--t-36`**, de radio `--r-*` y de movimiento `--dur-*`/`--curva`, con los valores de la especificación.
4. **Fuente**: en vez de `@import '@fontsource-variable/inter'` (7 subconjuntos), `styles.css` declara su propio `@font-face` con el archivo latino del paquete. Solo se publica un `.woff2` de 48 kB.
5. **Sin `app-tarjeta`**: la clase `.tarjeta` (con sus variantes) basta y evita un componente sin lógica.
6. **`app-marca`** añadido (isotipo reutilizable; mismo dibujo que `public/favicon.svg`).
7. **Anillo de foco violeta** (`--p-600` / `#C9B6F7`) en lugar del azul anterior, con contraste ≥ 6,5:1 en todas las superficies.
8. **`inlineCritical: false`** en producción (ver § 4) y presupuesto medido con brotli, como lo informa `ng build`.
9. **Caché ligada al usuario**: `CacheService` se vacía sola si cambia el usuario o el rol de la sesión, o si se cierra (datos de salud: nunca se muestran datos de otra persona; nunca va a `localStorage`).
10. **Precarga**: además del ahorro de datos, se omite en redes 2G; las rutas públicas llevan `data: { precarga: false }`.
11. **Separación de `core/errores/problema.ts`** (`problemaDe`, `codigoDe`): el interceptor y la sesión ya no arrastran los mensajes de error al bundle inicial (−1 kB). `error.service.ts` los reexporta.

**Pendientes fuera del frontend**: servir `.br` precomprimidos o comprimir con brotli en el proxy (con gzip el JS inicial pesa 97,9 kB), y las cabeceras `Cache-Control` de § 4 en Spring Boot.

## 7. Uso para desarrolladores

### 7.1 Reglas
- Solo tokens (`var(--…)`). Nada de hexadecimales sueltos en los componentes: no funcionarían en modo oscuro. Si falta un color, se añade un token en `styles.css` (en `:root` **y** en los dos bloques oscuros) y se pasa `npm run contraste`.
- Prioridad de estilos: `styles.css` usa capas (`base` → `componentes` → `utilidades`); el CSS de cada componente Angular va sin capa y **siempre gana**, sin pelear por especificidad.
- Iconos siempre decorativos junto a un texto; si un icono va solo (botón de icono), el nombre accesible va en un `<span class="solo-lectores">` o en `etiqueta`.
- Estados: icono + texto, nunca solo color. Foco: no quitar el `outline` (anillo de 3 px `--c-foco`).
- Componentes nuevos: standalone, `ChangeDetectionStrategy.OnPush`, signals, con pruebas.
- Importación: `import { … } from '…/shared/ui'` (barril `shared/ui/index.ts`) o el archivo concreto.

### 7.2 Tokens más usados
| Para… | Token |
|---|---|
| Fondo de la app / superficie / superficie secundaria / hover neutro | `--c-fondo` / `--c-superficie` / `--c-superficie-2` / `--c-superficie-3` |
| Menús y popovers | `--c-superficie-elevada` + `--sombra-3` |
| Texto / texto secundario | `--c-texto` / `--c-texto-2` |
| Borde decorativo / borde de control (3:1) | `--c-borde` / `--c-borde-control` |
| Marca | `--c-primario`, `--c-primario-hover`, `--c-primario-activo`, `--c-sobre-primario`, `--c-primario-suave` (fondo de selección), `--c-primario-tenue` (fondo destacado), `--c-primario-fuerte` (texto sobre fondos de marca), `--c-primario-borde` |
| Enlaces / foco | `--c-enlace` / `--c-foco` |
| Acento de salud | `--c-acento`, `--c-acento-suave` |
| Mensajes | `--c-exito`, `--c-error`, `--c-advertencia`, `--c-info` y sus `-suave`; `--c-peligro`, `--c-peligro-hover`, `--c-sobre-peligro` |
| Estados de cita | `--estado-{pendiente,confirmada,llegada,espera,atencion,completada,cancelada,no-asistio}` y `…-fondo` |
| Esqueletos | `--c-esqueleto`, `--c-esqueleto-brillo` |
| Tipo / espacio / radio | `--t-12…--t-36`, `--e-1…--e-12`, `--r-sm`, `--r-control`, `--r-tarjeta`, `--r-bloque`, `--r-pildora` |
| Sombra / movimiento | `--sombra-1/2/3`, `--dur-1` (150 ms), `--dur-2` (200 ms), `--curva` |
| Medidas | `--ancho-max` (72rem), `--alto-control` (44 px), `--alto-cabecera` (4rem) |
| Tamaño de iconos dentro de un contenedor | `--icono-tamano` (lo heredan todos los `app-icono` de dentro) |

### 7.3 Clases CSS

**Botones** — `<button class="btn …">` o `<a class="btn …">`.

| Clase | Efecto |
|---|---|
| `.btn` | Secundario (por defecto): superficie, borde `--c-primario-borde`, texto primario. Alto mínimo 44 px. |
| `.btn--secundario` | Igual que `.btn` (para ser explícito). |
| `.btn--primario` | Fondo primario, texto `--c-sobre-primario`. Uno por grupo de acciones. |
| `.btn--fantasma` | Sin fondo ni borde, texto secundario; para acciones terciarias o de icono. |
| `.btn--peligro` | Fondo `--c-peligro` (acciones destructivas confirmadas). |
| `.btn--sm` / (md por defecto) / `.btn--lg` | 36 px (área táctil ampliada a 44 px) / 44 px / 52 px. |
| `.btn--bloque` | Ancho completo. |
| `.btn--icono` | Cuadrado, solo icono (añade `<span class="solo-lectores">Nombre</span>`). |
| `.btn--cargando` | Texto transparente (el ancho no cambia) y spinner centrado. Combínalo con `[disabled]` o `aria-disabled` y un `role="status"` cercano. |
| `:disabled`, `[aria-disabled="true"]` | Bloqueado. Explica por qué con `<p class="explicacion-deshabilitado" id="…">` y `aria-describedby`. |
| `.acciones` (+ `.acciones--fin`) | Grupo de botones con separación; en móvil los botones se reparten el ancho. |

```html
<div class="acciones">
  <button type="button" class="btn btn--primario" [class.btn--cargando]="enviando()" [disabled]="enviando()">
    <app-icono nombre="check" /> Confirmar cita
  </button>
  <a class="btn btn--fantasma" routerLink="/paciente/citas"><app-icono nombre="arrow-left" /> Volver</a>
</div>
```

**Tarjetas** — `.tarjeta` (superficie, borde, radio 12, `--sombra-1`, relleno 20/24 px); `.tarjeta--interactiva` (hover elevado; úsala con `.enlace-extendido` en el enlace principal para que toda la tarjeta sea clicable sin anidar interactivos); `.tarjeta--destacada` (próxima cita: radio 16, degradado `--c-primario-tenue`, `--sombra-2`); `.tarjeta--suave` (superficie secundaria sin sombra); `.tarjeta__titulo`; `.tarjeta__pie` (separador y acciones al final).

```html
<article class="tarjeta tarjeta--interactiva" aria-labelledby="cita-c1">
  <h2 id="cita-c1" class="tarjeta__titulo">CIT001</h2>
  …
  <a class="enlace-extendido" routerLink="/paciente/citas/c1">Ver detalle<span class="solo-lectores"> de la cita CIT001</span></a>
</article>
```

**Formularios** — `.campo` (columna con separación) › `label` + `.control` (input, select —con flecha propia— o textarea) + `.ayuda` + `.error-campo` (con icono de alerta automático). `.control[aria-invalid="true"]` pinta el borde de error. `.etiqueta` para texto con aspecto de etiqueta. `.casilla` envuelve un checkbox grande: toda la fila es clicable y se resalta al marcarse.

```html
<div class="campo">
  <label for="perfil-email">Correo</label>
  <input id="perfil-email" class="control" type="email" [attr.aria-invalid]="!!error()"
         [attr.aria-describedby]="error() ? 'perfil-email-ayuda perfil-email-error' : 'perfil-email-ayuda'" />
  <p id="perfil-email-ayuda" class="ayuda">Te enviaremos los recordatorios aquí.</p>
  @if (error(); as e) { <p id="perfil-email-error" class="error-campo">{{ e }}</p> }
</div>
<label class="casilla" for="comprendo"><input id="comprendo" type="checkbox" /> <span>Comprendo que esta cita se cerrará</span></label>
```

**Tablas** — `.tabla-contenedor` (borde y radio; scroll horizontal si hiciera falta) › `table.tabla` (cabecera en `--c-superficie-2`, filas con hover, `.num` alinea cifras). `.tabla--apilable`: por debajo de 56rem cada fila es una tarjeta y cada `<td data-etiqueta="Paciente">` muestra su etiqueta.

**Chips** — `.chips` (lista flexible) › `.chip` (píldora de 40 px, área táctil de 44). Seleccionado con `aria-pressed="true"` (filtros), `aria-selected` / `aria-checked`, `.chip--activo` o un `<input type="radio|checkbox">` marcado dentro. `.chip__contador` muestra un número.

```html
<div class="chips" role="group" aria-label="Filtrar por estado">
  <button type="button" class="chip" [attr.aria-pressed]="filtro() === 'EN_ESPERA'">En espera <span class="chip__contador">3</span></button>
</div>
<fieldset class="chips"><legend class="solo-lectores">Día</legend>
  <label class="chip"><input type="radio" name="dia" value="2026-11-06" /> vie 6 <span class="chip__contador">4<span class="solo-lectores"> horarios</span></span></label>
</fieldset>
```

**Pestañas segmentadas** — `.segmentado` (+ `.segmentado--bloque` para ocupar el ancho) › `.segmentado__opcion`. Seleccionada con `aria-selected="true"` (patrón tablist, como Mis citas), `aria-pressed="true"`, `aria-current` o un radio marcado dentro (como el selector de tema).

```html
<div class="segmentado" role="tablist" aria-label="Tipo de citas">
  <button type="button" role="tab" class="segmentado__opcion" [attr.aria-selected]="alcance() === 'proximas'">Próximas</button>
  <button type="button" role="tab" class="segmentado__opcion" [attr.aria-selected]="alcance() === 'historial'">Historial</button>
</div>
```

**Listas de definición** — `dl.lista-datos` (etiqueta y valor en dos columnas desde 36rem); `dl.lista-datos.lista-datos--rejilla` con `<div><dt/><dd/></div>` por dato (rejilla de 2–3 columnas, etiqueta encima).

**Insignias** — `.insignia` (neutra), `.insignia--marca`, `.insignia--acento`.

**Disposición** — `.contenedor` (ancho máximo y márgenes), `.pila` (columna con separación; `.pila--sm`, `.pila--lg`), `.fila` (fila que se envuelve), `.rejilla` (tarjetas de 19rem mínimo; sirve en `ul`/`ol`, sin viñetas), `.rejilla-principal` (3fr + 2fr desde 60rem).

**Utilidades** — `.solo-lectores`, `.texto-suave`, `.texto-sm`, `.texto-xs`, `.tabular`, `.truncar`, `.sin-margen`, `.separador`, `.foco-resultado` (destino del foco tras una acción), `.explicacion-deshabilitado`.

### 7.4 Componentes

| Selector | Entradas | Notas |
|---|---|---|
| `<app-icono>` | `nombre` (obligatorio, `NombreIcono`), `tamano` (`number` en px o longitud CSS; por defecto `--icono-tamano`, 1.25rem), `trazo` (1.75), `etiqueta` (`string`; sin ella es `aria-hidden`) | Hereda `currentColor`. |
| `<app-marca>` | `tamano` (`'sm'│'md'│'lg'`), `conTexto` (`true`), `subtitulo` (`string│null`) | Isotipo decorativo + «SIGA-SP». |
| `<app-esqueleto>` | `forma` (`'texto'│'titulo'│'bloque'│'circulo'│'pildora'│'boton'`), `ancho`, `alto` (CSS), `lineas` (`number`) | `aria-hidden`; la última de varias líneas mide 65 %. |
| `<app-estado-vacio>` | `titulo` (obligatorio), `texto`, `ilustracion` (`'calendario'│'historial'│'busqueda'│'error'│'ninguna'`), `nivel` (`2│3`), `compacto` | Ranura `[acciones]`; el contenido sin atributo va bajo el texto. |
| `<app-encabezado-pagina>` | `titulo` (obligatorio, es el `h1`), `subtitulo`, `migas` (`Miga[]` = `{ texto, ruta? }`), `tituloId` | Ranuras `[junto-al-titulo]`, `[acciones]` y contenido libre. Migas en `nav[aria-label="Migas de pan"]`, la última con `aria-current="page"`. |
| `<app-ficha-fecha>` | `fecha` (obligatorio: ISO UTC, `Date` o ms), `tamano` (`'sm'│'md'│'lg'`), `destacada` | `<time datetime="YYYY-MM-DD">` en Lima; los lectores oyen «Miércoles, 4 de noviembre de 2026». Medidas fijas: sm 3 × 4.5rem, md 3.75 × 4.75rem, lg 4.75 × 5.5rem. |
| `<app-linea-tiempo>` | `eventos` (obligatorio, `EventoLineaTiempo[]`), `orden` (`'asc'` por defecto │ `'desc'`), `etiquetadoPor` (id del título) | El de mayor `secuencia` va destacado, con `aria-current="step"` y «Más reciente». `ICONO_EVENTO` exporta el icono por tipo. |
| `<app-estado-cita>` | `estado` (obligatorio), `etiqueta` (texto del servidor), `tamano` (`'md'│'sm'`) | **Entradas anteriores intactas.** Lee «Estado: Confirmada». Exporta `ETIQUETA_ESTADO` e `ICONO_ESTADO`. |
| `<app-aviso>` | `tipo` (`'info'│'exito'│'advertencia'│'error'`), `titulo`, `vivo` (`'polite'│'assertive'│null`) | **Entradas anteriores intactas** y mismas clases (`.aviso--error`…). Sin título, anuncia el tipo con un prefijo oculto («Error:»). Acciones dentro de `<div class="acciones">`. |

`app-aviso` y `app-estado-cita` viven en `shared/ui/` (los antiguos reexportes de `shared/components/` ya se eliminaron).

```html
<app-encabezado-pagina titulo="CIT001" subtitulo="Fechas y horas en hora de Lima"
  [migas]="[{ texto: 'Mis citas', ruta: '/paciente/citas' }, { texto: 'Detalle' }]">
  <app-estado-cita junto-al-titulo [estado]="c.estado" [etiqueta]="c.estadoEtiqueta" />
  <a acciones class="btn" [routerLink]="['/paciente/citas', c.id, 'reprogramar']"><app-icono nombre="calendar-clock" /> Reprogramar</a>
</app-encabezado-pagina>

<div class="fila">
  <app-ficha-fecha [fecha]="c.inicio" tamano="lg" destacada />
  <p class="sin-margen"><strong>{{ c.inicio | fechaLima: 'hora' }}</strong> · {{ cuenta }}</p>
</div>

<app-aviso tipo="exito" titulo="Cita confirmada"><p>Te esperamos el {{ c.inicio | fechaLima }}.</p></app-aviso>

<section class="tarjeta" aria-labelledby="titulo-historial">
  <h2 id="titulo-historial">Historial</h2>
  <app-linea-tiempo [eventos]="eventos()" etiquetadoPor="titulo-historial" />
</section>

<app-estado-vacio ilustracion="calendario" titulo="No tienes citas próximas"
  texto="Cuando tengas una cita registrada, aparecerá aquí." />
```

**Iconos disponibles** (39): estados `clock`, `check-circle`, `map-pin`, `hourglass`, `stethoscope`, `check-check`, `x-circle`, `user-x`; calendario `calendar`, `calendar-plus`, `calendar-clock`, `calendar-check`, `calendar-x`, `clipboard-check`; navegación `user`, `layout-dashboard`, `house`, `menu`, `x`, `chevron-down`, `chevron-right`, `chevron-left`, `arrow-left`, `arrow-right`, `log-out`, `search`; tema `sun`, `moon`, `monitor`; acciones y avisos `refresh-cw`, `info`, `alert-circle`, `alert-triangle`, `check`; datos `building`, `mail`, `phone`, `shield-check`, `heart-pulse`. Para añadir uno: copiar su trazo de Lucide a `iconos.ts` como un único `d` que empiece por `M` (la prueba lo verifica).

### 7.5 Patrón de esqueleto (tamaño reservado)
1. El contenedor que cambia lleva `aria-busy` mientras carga y un texto de estado solo para lectores.
2. El esqueleto **reproduce la caja final**: la misma clase de tarjeta (mismo relleno y borde), los mismos altos de línea y de botón, y el mismo número de elementos que se esperan (p. ej. 3 tarjetas). Así el cambio a contenido real no mueve nada (CLS ≈ 0).
3. Las imágenes o fichas de tamaño fijo se reservan con `forma="bloque"`/`"circulo"` y su `alto`/`ancho`.

```html
<div id="panel-citas" [attr.aria-busy]="cargando()">
  @if (cargando()) {
    <p class="solo-lectores" role="status">Cargando tus citas…</p>
    <ul class="rejilla" aria-hidden="true">
      @for (i of [1, 2, 3]; track i) {
        <li class="tarjeta">
          <div class="fila">
            <app-esqueleto forma="bloque" ancho="3.75rem" alto="4.75rem" />  <!-- = app-ficha-fecha md -->
            <app-esqueleto forma="titulo" ancho="40%" />
          </div>
          <app-esqueleto [lineas]="3" />
          <app-esqueleto forma="boton" />
        </li>
      }
    </ul>
  } @else { … }
</div>
```

### 7.6 Datos: `core/cache` (memoria y *stale-while-revalidate*)
`CacheService` (`providedIn: 'root'`). Nunca persiste (solo memoria), se vacía sola al cambiar de usuario/rol o cerrar sesión, no guarda errores y cancela la petición si nadie queda suscrito.

| Método | Uso |
|---|---|
| `obtener<T>(clave, fuente: () => Observable<T>, { vigenciaMs? })` | Catálogos y datos casi fijos. Lo guardado se reutiliza (por defecto toda la sesión); las peticiones simultáneas comparten una. |
| `swr<T>(clave, fuente, { vigenciaMs? })` → `Observable<ResultadoSwr<T>>` | Lista y detalle. Emite `{ datos, desdeCache: true, revalidando: true }` al instante si hay algo guardado y luego `{ datos, desdeCache: false, revalidando: false }`. Si la revalidación falla y había datos: `{ datos: guardados, desdeCache: true, revalidando: false, error }` y termina **sin error**. Sin datos guardados, el error se propaga (la pantalla muestra su estado de error de siempre). `vigenciaMs` > 0 evita revalidar si lo guardado es reciente. |
| `leer<T>(clave)` / `guardar(clave, valor)` | Leer sin pedir (p. ej. decidir si mostrar esqueleto) / guardar lo que devolvió una acción. |
| `invalidar(clave)` / `invalidarPrefijo(prefijo)` / `limpiar()` | Tras una acción que cambia datos. |

Claves recomendadas: `citas:proximas`, `citas:historial`, `cita:<id>`, `cita:<id>:linea-tiempo`, `perfil`, `operador:citas:<YYYY-MM-DD>`. Ya en uso: `catalogo:motivos:<TIPO>`.

```ts
private readonly cache = inject(CacheService);

cargar(): void {
  const clave = `citas:${this.alcance()}`;
  if (!this.cache.leer(clave)) this.carga.set({ estado: 'cargando' }); // esqueleto solo sin datos
  this.cache
    .swr(clave, () => this.api.listarCitas(this.alcance()))
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: ({ datos, revalidando, error }) => {
        this.carga.set({ estado: 'listo', citas: datos });
        this.actualizando.set(revalidando);                 // p. ej. un «Actualizando…» discreto
        if (error) this.avisoDesactualizado.set(true);      // «Mostramos lo último que cargamos»
      },
      error: (e) => this.carga.set({ estado: 'error', mensaje: this.errores.traducir(e).mensaje }),
    });
}

// Tras confirmar/cancelar/reprogramar con éxito:
this.cache.guardar(`cita:${cita.id}`, citaActualizada);
this.cache.invalidarPrefijo('citas:');
this.cache.invalidar(`cita:${cita.id}:linea-tiempo`);
```

Cuidado: no cachear respuestas de mutaciones salvo la cita devuelta; la idempotencia y los avisos de resultado no cambian. Si una revalidación cambia datos visibles, no muevas el foco ni anuncies nada nuevo salvo que la persona lo pida.

### 7.7 Tema, precarga y transiciones
- **Tema**: `TemaService` (`core/tema/tema.service.ts`): `preferencia()` (`'claro'│'oscuro'│'sistema'`), `temaEfectivo()` (`'claro'│'oscuro'`), `cambiar(preferencia)`. `core/tema/tema.ts` tiene `aplicarTemaInicial(document)` (lo llama `main.ts`), `leerPreferenciaTema`, `guardarPreferenciaTema` (try/catch) y `CLAVE_TEMA`.
- **Precarga**: `PrecargaPorRol` (`core/precarga/precarga-por-rol.ts`) con `withPreloading`. Una ruta lazy nueva se precarga sola si es hija de un módulo del rol; si es pública, añade `data: { precarga: false }`; si es de un rol, `data: { roles: [...] }`.
- **Transiciones de vista**: `withViewTransitions` con `omitirSiMovimientoReducido` (`core/transiciones`). Solo `main` (`view-transition-name: principal`) se anima; no pongas `view-transition-name` en otros elementos sin revisar `styles.css`.

### 7.8 Fechas (America/Lima)
Además de `fechaLima` y las funciones existentes, `shared/utils/fecha-lima.ts` ofrece `partesCalendarioLima(valor)` → `{ iso, dia, mes, diaSemana, anio }`, `diasHastaLima(valor, ahora?)` y `cuentaRegresivaLima(valor, ahora?)` → «hoy a las 09:00», «mañana a las 09:00», «en 3 días», «ayer», «hace 5 días».

### 7.9 Alias obsoletos
Ya no existen: todas las pantallas usan los tokens y clases de esta guía. Los antiguos alias (`--color-*`, `--esp-*`, `--texto-*`, `--radio-*`, `.sr-only`, etc.) y la capa `obsoleto` se eliminaron tras la migración.

### 7.10 Verificación
- `npx ng test --watch=false` — pruebas unitarias.
- `npx ng build` — sin avisos de presupuesto.
- `npm run presupuesto` — JS inicial ≤ 90 kB (brotli), tras el build.
- `npm run contraste` — WCAG 2.2 AA de todos los pares de tokens en los dos temas.
