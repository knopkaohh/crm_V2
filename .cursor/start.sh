#!/usr/bin/env bash
# Per-boot startup for the Birka CRM Cloud Agent environment.
# Brings up the local PostgreSQL cluster and makes sure the app role/database exist.
# Must be idempotent: it runs on every environment boot.
set -euo pipefail

PG_USER="birka_admin"
PG_PASSWORD="birka_password_2024"
PG_DB="birka_crm"

log() { echo "[start] $*"; }

# Discover the installed PostgreSQL major version (e.g. "16").
PG_VER="$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1 || true)"
if [[ -z "${PG_VER}" ]]; then
  log "PostgreSQL is not installed; nothing to start. (install.sh installs it.)"
  exit 0
fi

# Start the default cluster if it is not already accepting connections.
if ! sudo -u postgres pg_isready -q 2>/dev/null; then
  log "Starting PostgreSQL ${PG_VER} cluster 'main'..."
  sudo pg_ctlcluster "${PG_VER}" main start || true
  # Wait up to ~30s for readiness.
  for _ in $(seq 1 30); do
    if sudo -u postgres pg_isready -q 2>/dev/null; then break; fi
    sleep 1
  done
fi

if ! sudo -u postgres pg_isready -q 2>/dev/null; then
  log "ERROR: PostgreSQL did not become ready." >&2
  exit 1
fi
log "PostgreSQL is ready."

# Ensure the application role and database exist (idempotent).
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${PG_USER}') THEN
    CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASSWORD}';
  END IF;
END \$\$;
ALTER ROLE ${PG_USER} CREATEDB;
SELECT 'CREATE DATABASE ${PG_DB} OWNER ${PG_USER}'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${PG_DB}')\gexec
GRANT ALL PRIVILEGES ON DATABASE ${PG_DB} TO ${PG_USER};
SQL

log "Database '${PG_DB}' and role '${PG_USER}' are ready."
