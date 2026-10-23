#!/usr/bin/env bash
# =====================================================================
# Construye el jar único de producción de SIGA-SP: el build de Angular
# queda dentro del jar de Spring Boot (classpath:/static) y un solo
# proceso sirve el SPA y la API en el mismo origen.
#
#   scripts/construir-produccion.sh                 build completo (con pruebas del backend)
#   scripts/construir-produccion.sh --sin-pruebas   omite las pruebas del backend
#   scripts/construir-produccion.sh --sin-npm-ci    reutiliza node_modules (sin reinstalar)
#
# Resultado: backend/target/siga-sp-backend-<versión>.jar
# Ejecución y variables de entorno: docs/despliegue.md
#
# Requiere Java 21, Node (la versión que exige Angular, ver README) y npm.
# =====================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND="$RAIZ/frontend"
BACKEND="$RAIZ/backend"
# Ruta por defecto del builder @angular/build:application (angular.json no define outputPath).
DIST="$FRONTEND/dist/frontend/browser"

PRUEBAS=1
NPM_CI=1
for argumento in "$@"; do
  case "$argumento" in
    --sin-pruebas) PRUEBAS=0 ;;
    --sin-npm-ci)  NPM_CI=0 ;;
    -h|--help)     sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $argumento (usa --help)" >&2; exit 2 ;;
  esac
done

paso() { printf '\n==> %s\n' "$1"; }

for comando in node npm; do
  command -v "$comando" >/dev/null 2>&1 || { echo "Falta '$comando' en el PATH." >&2; exit 1; }
done

# Java 21: en macOS se toma de java_home si JAVA_HOME no está definido.
if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ]; then
  JAVA_HOME="$(/usr/libexec/java_home -v 21 2>/dev/null || true)"
  [ -n "$JAVA_HOME" ] && export JAVA_HOME
fi
JAVA="${JAVA_HOME:+$JAVA_HOME/bin/}java"
if ! "$JAVA" -version 2>&1 | grep -Eq 'version "(2[1-9]|[3-9][0-9])'; then
  echo "Se necesita Java 21 o superior (define JAVA_HOME)." >&2
  exit 1
fi

paso "Frontend: dependencias"
cd "$FRONTEND"
if [ "$NPM_CI" = 1 ]; then
  npm ci --no-audit --no-fund
else
  [ -d node_modules ] || { echo "No hay node_modules: ejecuta sin --sin-npm-ci." >&2; exit 1; }
fi

paso "Frontend: ng build (producción, archivos con hash)"
rm -rf "$FRONTEND/dist"
npx --no-install ng build --configuration production
if [ ! -f "$DIST/index.html" ]; then
  echo "No se encontró $DIST/index.html: revisa outputPath en angular.json." >&2
  exit 1
fi

paso "Backend: jar con el frontend (perfil con-frontend)"
cd "$BACKEND"
OPCIONES=(-B -Pcon-frontend clean package)
[ "$PRUEBAS" = 0 ] && OPCIONES+=(-DskipTests)
./mvnw "${OPCIONES[@]}"

JAR="$(find "$BACKEND/target" -maxdepth 1 -name 'siga-sp-backend-*.jar' ! -name '*.original' | head -n 1)"
if [ -z "$JAR" ]; then
  echo "No se generó el jar en $BACKEND/target." >&2
  exit 1
fi

# Verificación: el jar debe llevar el index.html y los bundles con hash.
CONTENIDO="$("${JAVA_HOME:+$JAVA_HOME/bin/}jar" tf "$JAR" 2>/dev/null || unzip -Z1 "$JAR")"
if ! grep -qx 'BOOT-INF/classes/static/index.html' <<<"$CONTENIDO"; then
  echo "El jar no contiene BOOT-INF/classes/static/index.html." >&2
  exit 1
fi
ARCHIVOS="$(grep -c '^BOOT-INF/classes/static/.*[^/]$' <<<"$CONTENIDO" || true)"

paso "Listo"
echo "Jar:      $JAR ($(du -h "$JAR" | cut -f1))"
echo "Frontend: $ARCHIVOS archivos en BOOT-INF/classes/static"
echo
echo "Ejecutar (ver docs/despliegue.md):"
echo "  SIGASP_DB_URL=jdbc:postgresql://<host>:5432/siga_sp SIGASP_DB_USER=<usuario> \\"
echo "  SIGASP_DB_PASSWORD=<clave> java -jar $JAR"
