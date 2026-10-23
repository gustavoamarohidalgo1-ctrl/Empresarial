#!/usr/bin/env bash
# =====================================================================
# Base de datos local de desarrollo de SIGA-SP.
# Crea un clúster PostgreSQL propio del proyecto en siga-sp/.local/pgdata
# (puerto 5433), sin tocar otras instalaciones de PostgreSQL.
#
#   scripts/db.sh start    crea (si hace falta) y arranca el clúster
#   scripts/db.sh stop     lo detiene
#   scripts/db.sh status   muestra su estado
#   scripts/db.sh reset    lo borra y lo vuelve a crear vacío (datos demo frescos)
#   scripts/db.sh psql     abre una consola psql en la base siga_sp
#   scripts/db.sh respaldo [archivo]    respaldo completo (pg_dump, formato custom)
#   scripts/db.sh restaurar <archivo>   restaura en una base vacía de prueba (siga_sp_restaurada)
#                                       y verifica conteos, relaciones y la consulta de una cita (RNF10)
#
# Requiere los binarios de PostgreSQL (initdb, pg_ctl, psql) en el PATH.
# Alternativa con Docker: docker compose up -d (ver docker-compose.yml).
# =====================================================================
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATOS="$RAIZ/.local/pgdata"
LOG="$RAIZ/.local/postgres.log"
PUERTO="${SIGASP_DB_PORT:-5433}"
USUARIO="${SIGASP_DB_USER:-siga}"
CLAVE="${SIGASP_DB_PASSWORD:-siga-dev-local}"
BASE="siga_sp"

# Algunas instalaciones (p. ej. Postgres.app) solo enlazan parte de los binarios en el PATH:
# se agregan los que están junto a initdb.
if command -v initdb >/dev/null 2>&1; then
  PATH="$(dirname "$(readlink -f "$(command -v initdb)")"):$PATH"
fi

requerir() {
  for comando in initdb pg_ctl psql pg_dump pg_restore; do
    command -v "$comando" >/dev/null 2>&1 || { echo "Falta '$comando' en el PATH (instala PostgreSQL 16+)." >&2; exit 1; }
  done
}

crear() {
  mkdir -p "$RAIZ/.local"
  local archivo_clave
  archivo_clave="$(mktemp)"
  printf '%s' "$CLAVE" > "$archivo_clave"
  initdb -D "$DATOS" -U "$USUARIO" --pwfile="$archivo_clave" --auth=scram-sha-256 \
         --encoding=UTF8 --locale=C >/dev/null
  rm -f "$archivo_clave"
  {
    echo "port = $PUERTO"
    echo "listen_addresses = 'localhost'"
    echo "timezone = 'UTC'"
    echo "unix_socket_directories = '$RAIZ/.local'"
  } >> "$DATOS/postgresql.conf"
}

arrancar() {
  requerir
  [ -f "$DATOS/PG_VERSION" ] || crear
  if pg_ctl -D "$DATOS" status >/dev/null 2>&1; then
    echo "PostgreSQL ya está en marcha en el puerto $PUERTO."
  else
    pg_ctl -D "$DATOS" -l "$LOG" -w start >/dev/null
    echo "PostgreSQL iniciado en el puerto $PUERTO."
  fi
  if ! PGPASSWORD="$CLAVE" psql -h localhost -p "$PUERTO" -U "$USUARIO" -d postgres -tAc \
       "SELECT 1 FROM pg_database WHERE datname = '$BASE'" | grep -q 1; then
    PGPASSWORD="$CLAVE" psql -h localhost -p "$PUERTO" -U "$USUARIO" -d postgres -qc "CREATE DATABASE $BASE"
    echo "Base de datos '$BASE' creada."
  fi
}

sql() {  # sql <base> <consulta>
  PGPASSWORD="$CLAVE" psql -h localhost -p "$PUERTO" -U "$USUARIO" -d "$1" -tAc "$2"
}

respaldar() {
  requerir
  local archivo="${1:-$RAIZ/.local/respaldo-$(date +%Y%m%d-%H%M%S).dump}"
  PGPASSWORD="$CLAVE" pg_dump -h localhost -p "$PUERTO" -U "$USUARIO" -d "$BASE" -Fc -f "$archivo"
  echo "Respaldo creado: $archivo"
}

restaurar() {
  requerir
  local archivo="${1:?Indica el archivo de respaldo}"
  local destino="${BASE}_restaurada"
  sql postgres "DROP DATABASE IF EXISTS $destino" >/dev/null
  sql postgres "CREATE DATABASE $destino" >/dev/null
  PGPASSWORD="$CLAVE" pg_restore -h localhost -p "$PUERTO" -U "$USUARIO" -d "$destino" --no-owner "$archivo"
  echo "Restaurado en '$destino'. Verificación:"
  local tablas="usuario paciente cita cita_version_agenda cita_evento auditoria"
  local ok=1
  for tabla in $tablas; do
    local origen restaurado
    origen=$(sql "$BASE" "SELECT count(*) FROM $tabla")
    restaurado=$(sql "$destino" "SELECT count(*) FROM $tabla")
    printf '  %-22s origen=%-6s restaurada=%-6s %s\n' "$tabla" "$origen" "$restaurado" \
      "$([ "$origen" = "$restaurado" ] && echo OK || { ok=0; echo DIFERENTE; })"
  done
  local huerfanas
  huerfanas=$(sql "$destino" "SELECT count(*) FROM cita c LEFT JOIN paciente p ON p.id = c.paciente_id WHERE p.id IS NULL")
  echo "  citas sin paciente: $huerfanas"
  echo "  consulta de una cita: $(sql "$destino" "SELECT c.codigo || ' ' || c.estado || ' ' || v.inicio FROM cita c JOIN cita_version_agenda v ON v.cita_id = c.id AND v.vigente_hasta IS NULL ORDER BY c.codigo LIMIT 1")"
  [ "$ok" = 1 ] && [ "$huerfanas" = 0 ] && echo "Restauración verificada." || { echo "La verificación falló." >&2; exit 1; }
}

case "${1:-start}" in
  start)  arrancar ;;
  stop)   requerir; pg_ctl -D "$DATOS" -m fast stop ;;
  status) requerir; pg_ctl -D "$DATOS" status || true ;;
  reset)
    requerir
    pg_ctl -D "$DATOS" -m fast stop >/dev/null 2>&1 || true
    rm -rf "$DATOS"
    arrancar
    ;;
  psql)   PGPASSWORD="$CLAVE" psql -h localhost -p "$PUERTO" -U "$USUARIO" -d "$BASE" ;;
  respaldo)  respaldar "${2:-}" ;;
  restaurar) restaurar "${2:-}" ;;
  *)      echo "Uso: $0 {start|stop|status|reset|psql|respaldo [archivo]|restaurar <archivo>}" >&2; exit 2 ;;
esac
