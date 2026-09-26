#!/usr/bin/env bash
# Idempotent bootstrap for the Birka CRM Cloud Agent environment.
# Runs after the repository is checked out. Prepares system packages, local env
# files, Node dependencies, the Prisma client, and the seeded local database.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CURSOR_DIR="${ROOT}/.cursor"

log() { echo "[install] $*"; }

# --- 1. System packages: PostgreSQL (no-op when the base snapshot already has it) ---
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  log "Installing PostgreSQL..."
  sudo apt-get update -y
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends postgresql postgresql-contrib
fi

# --- 2. Bring up the database (reuses the per-boot start script) ---
bash "${CURSOR_DIR}/start.sh"

# --- 3. Local env files (git-ignored; safe dev-only defaults) ---
if [[ ! -f "${ROOT}/backend/.env" ]]; then
  log "Creating backend/.env"
  cat > "${ROOT}/backend/.env" <<'ENV'
DATABASE_URL="postgresql://birka_admin:birka_password_2024@localhost:5432/birka_crm?schema=public"
JWT_SECRET="dev-local-jwt-secret-change-in-production"
JWT_EXPIRES_IN="7d"
PORT=3001
FRONTEND_URL="http://localhost:3000"
UPLOAD_DIR="./uploads"
MAX_FILE_SIZE="52428800"
ENV
fi

if [[ ! -f "${ROOT}/frontend/.env.local" ]]; then
  log "Creating frontend/.env.local"
  echo 'NEXT_PUBLIC_API_URL=http://localhost:3001/api' > "${ROOT}/frontend/.env.local"
fi

# --- 4. Node dependencies ---
log "Installing backend dependencies..."
cd "${ROOT}/backend"
npm ci --no-audit --no-fund

log "Generating Prisma client..."
npx prisma generate

# Sync schema to the database. `db push` is used because the committed migration
# history is not linearly applicable to a fresh database; schema.prisma is the
# source of truth for local development.
log "Syncing database schema (prisma db push)..."
npx prisma db push --skip-generate

# Seed a default admin user (idempotent: seed checks for existing user).
log "Seeding database..."
npx prisma db seed || log "Seed skipped or already applied."

log "Installing frontend dependencies..."
cd "${ROOT}/frontend"
npm ci --no-audit --no-fund

log "Install complete."
