#!/usr/bin/env bash
# Démarre un MySQL/MariaDB jetable pour le test d'intégration.
# Datadir temporaire, port 3307, tables de droits ignorées : le serveur de la
# machine n'est ni touché ni concurrencé. Arrêt : tools/db-it-stop.sh
set -u

T=$(mktemp -d)
echo "$T" > /tmp/balance-it-dir

if command -v mariadb-install-db >/dev/null 2>&1; then
  mariadb-install-db --datadir="$T/data" --auth-root-authentication-method=normal >"$T/install.log" 2>&1
elif command -v mysql_install_db >/dev/null 2>&1; then
  mysql_install_db --datadir="$T/data" >"$T/install.log" 2>&1
else
  # MySQL 8 n'expose plus mysql_install_db : on initialise un datadir vide.
  mkdir -p "$T/data"
  mysqld --no-defaults --initialize-insecure --datadir="$T/data" >"$T/install.log" 2>&1 || {
    echo "FAILED"
    tail -20 "$T/install.log"
    exit 1
  }
fi

USER_OPT=()
if [ "$(id -u)" -eq 0 ]; then
  USER_OPT=(--user=root)
fi

nohup mysqld --no-defaults "${USER_OPT[@]}" --datadir="$T/data" --socket="$T/m.sock" \
  --port=3307 --bind-address=127.0.0.1 --mysqlx=0 \
  --pid-file="$T/m.pid" >"$T/server.log" 2>&1 &
disown

for _ in $(seq 1 30); do
  mysql --socket="$T/m.sock" -uroot -e "SELECT 1" >/dev/null 2>&1 && mysql -h127.0.0.1 -P3307 -uroot -e "SELECT 1" >/dev/null 2>&1 && { echo "READY on 127.0.0.1:3307 (datadir $T)"; exit 0; }
  sleep 1
done

echo "FAILED"
tail -20 "$T/server.log"
