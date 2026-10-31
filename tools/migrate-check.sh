#!/usr/bin/env bash
# Vérifie toute la chaîne de migrations SQL sur un serveur jetable.
# Instance jetable : datadir temporaire, pas de TCP, socket dédiée — le serveur
# de production de la machine n'est ni touché ni concurrencé.
set -u

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
ROOT=$(cd -- "$SCRIPT_DIR/.." && pwd)
T=$(mktemp -d)
trap 'kill %1 2>/dev/null; sleep 1; rm -rf "$T"' EXIT

if command -v mariadb-install-db >/dev/null 2>&1; then
  mariadb-install-db --datadir="$T/data" --auth-root-authentication-method=normal >"$T/install.log" 2>&1
else
  mysql_install_db --datadir="$T/data" >"$T/install.log" 2>&1
fi

mysqld --user=root --datadir="$T/data" --socket="$T/m.sock" --skip-networking \
  --skip-grant-tables --pid-file="$T/m.pid" >"$T/server.log" 2>&1 &

for _ in $(seq 1 30); do
  [ -S "$T/m.sock" ] && break
  sleep 1
done

mysql --socket="$T/m.sock" -uroot -e "SELECT VERSION() AS version"

mysql --socket="$T/m.sock" -uroot --default-character-set=utf8mb4 \
  -e "CREATE DATABASE probe CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

for migration in "$ROOT"/migrations/[0-9][0-9][0-9]_*.sql; do
  echo "Applying $(basename "$migration")"
  if ! mysql --socket="$T/m.sock" -uroot --default-character-set=utf8mb4 probe < "$migration"; then
    echo "MIGRATION_FAILED: $(basename "$migration")"
    exit 1
  fi
done
echo "MIGRATION_OK"

mysql --socket="$T/m.sock" -uroot --default-character-set=utf8mb4 probe -e "
  SELECT COUNT(*) AS tables FROM information_schema.tables WHERE table_schema = 'probe';
  SELECT code, name, name_ar FROM locations;
  SELECT COUNT(*) AS stock_rows FROM v_stock_moves;
"
