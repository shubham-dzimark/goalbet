#!/usr/bin/env bash
# Local Postgres + Redis without Docker (used on machines where Docker is unavailable).
#   bash scripts/local-services.sh start|stop|status
# Postgres: project cluster in .local/pgdata on port 5434 (trust auth, user goalbet, DBs goalbet + goalbet_test)
# Redis:    binary in .local/redis on port 6379
# With Docker instead: `docker compose up -d postgres redis` and use the URLs from .env.example comments.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="${PG_BIN:-/c/Program Files/PostgreSQL/18/bin}"
PG_DATA=".local/pgdata"
PG_PORT=5434
REDIS_DIR=".local/redis"

pg() { "$PG_BIN/$1" "${@:2}"; }

init_pg() {
  [ -d "$PG_DATA" ] && return
  echo "initialising Postgres cluster in $PG_DATA"
  pg initdb.exe -D "$PG_DATA" -U goalbet --auth=trust -E UTF8 --locale=C >/dev/null
  sed -i "s/^#port = 5432/port = $PG_PORT/" "$PG_DATA/postgresql.conf"
}

start() {
  init_pg
  if pg pg_isready.exe -h 127.0.0.1 -p $PG_PORT >/dev/null 2>&1; then
    echo "postgres already running on $PG_PORT"
  else
    # pg_ctl keeps stdout open on Windows; detach it.
    pg pg_ctl.exe -D "$PG_DATA" -l .local/pg.log start >/dev/null 2>&1 &
    for _ in $(seq 1 20); do pg pg_isready.exe -h 127.0.0.1 -p $PG_PORT >/dev/null 2>&1 && break; sleep 0.5; done
    echo "postgres started on $PG_PORT"
  fi
  for db in goalbet goalbet_test; do
    pg createdb.exe -h 127.0.0.1 -p $PG_PORT -U goalbet "$db" 2>/dev/null || true
  done

  if [ ! -x "$REDIS_DIR/redis-server.exe" ] && ! command -v redis-server >/dev/null; then
    echo "Redis not found: download a Windows build (e.g. github.com/redis-windows/redis-windows) into $REDIS_DIR" >&2
    exit 1
  fi
  local cli="$REDIS_DIR/redis-cli.exe"; command -v "$cli" >/dev/null || cli=redis-cli
  if "$cli" -p 6379 ping >/dev/null 2>&1; then
    echo "redis already running on 6379"
  else
    local srv="$REDIS_DIR/redis-server.exe"; [ -x "$srv" ] || srv=redis-server
    "$srv" --port 6379 --save "" --appendonly no > .local/redis.log 2>&1 &
    sleep 1
    echo "redis started on 6379"
  fi
}

stop() {
  pg pg_ctl.exe -D "$PG_DATA" stop -m fast 2>/dev/null || true
  "$REDIS_DIR/redis-cli.exe" -p 6379 shutdown nosave 2>/dev/null || redis-cli -p 6379 shutdown nosave 2>/dev/null || true
  echo "stopped"
}

status() {
  pg pg_isready.exe -h 127.0.0.1 -p $PG_PORT || true
  "$REDIS_DIR/redis-cli.exe" -p 6379 ping 2>/dev/null || echo "redis down"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  status) status ;;
  *) echo "usage: $0 start|stop|status" >&2; exit 1 ;;
esac
