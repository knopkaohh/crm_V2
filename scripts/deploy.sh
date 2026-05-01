#!/usr/bin/env bash
# Деплой CRM на сервер одной командой из корня репозитория:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Переменные окружения (опционально):
#   DEPLOY_BRANCH=main          — ветка для git pull
#   SKIP_PULL=1                  — не делать git pull (уже обновили вручную)
#   SKIP_MIGRATE=1               — не запускать prisma migrate deploy (только generate + build)
#   NODE_BUILD_MEMORY_MB=4096    — лимит heap только для next build (по умолчанию 3072).
#   SKIP_NPM_CI=1                — не делать npm ci (главная причина OOM на VPS). Зависимости ставь вручную
#                                  когда менялся package.json: cd backend && npm ci && cd ../frontend && npm ci
#                                  На слабом VPS: почти всегда деплой с SKIP_NPM_CI=1 после первичной установки.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_PULL="${SKIP_PULL:-0}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"
SKIP_NPM_CI="${SKIP_NPM_CI:-0}"
NODE_BUILD_MEMORY_MB="${NODE_BUILD_MEMORY_MB:-3072}"

# Глобальный NODE_OPTIONS ломает слабые VPS: Prisma/npm каждый поднимают тяжёлый процесс Node.
unset NODE_OPTIONS 2>/dev/null || true

echo "==> Корень проекта: $ROOT"
echo "==> Heap для next build: ${NODE_BUILD_MEMORY_MB} MiB | SKIP_NPM_CI=${SKIP_NPM_CI}"

if [[ "${SKIP_PULL}" != "1" ]]; then
  if [[ ! -d .git ]]; then
    echo "Нет каталога .git — пропускаю git pull (положи репозиторий с git или используй SKIP_PULL=1)." >&2
  else
    echo "==> git pull origin ${DEPLOY_BRANCH}"
    git fetch origin
    git pull --ff-only origin "${DEPLOY_BRANCH}"
  fi
else
  echo "==> SKIP_PULL=1 — git pull пропущен"
fi

echo "==> Backend: зависимости, prisma, build"
cd "${ROOT}/backend"
if [[ "${SKIP_NPM_CI}" == "1" ]]; then
  if [[ ! -d node_modules ]]; then
    echo "Ошибка: SKIP_NPM_CI=1, но нет backend/node_modules. Один раз выполни: cd ${ROOT}/backend && npm ci" >&2
    exit 1
  fi
  echo "==> SKIP_NPM_CI=1 — backend npm ci пропущен"
else
  echo "==> backend npm ci (ограничение сокетов — меньше пик памяти)"
  npm_config_maxsockets=2 npm ci --no-audit --no-fund
fi
npx prisma generate

if [[ "${SKIP_MIGRATE}" == "1" ]]; then
  echo "==> SKIP_MIGRATE=1 — prisma migrate deploy пропущен"
else
  echo "==> prisma migrate deploy"
  if ! npx prisma migrate deploy; then
    echo >&2
    echo "Ошибка migrate deploy. Варианты:" >&2
    echo "  • поправить миграции / состояние БД и снова запустить деплой;" >&2
    echo "  • временно: SKIP_MIGRATE=1 ./scripts/deploy.sh (осторожно);" >&2
    echo "  • восстановление схемы только для dev: вручную prisma db push." >&2
    exit 1
  fi
fi

echo "==> backend npm run build (heap см. backend/package.json script build)"
npm run build

echo "==> Frontend: зависимости, build"
cd "${ROOT}/frontend"
if [[ "${SKIP_NPM_CI}" == "1" ]]; then
  if [[ ! -d node_modules ]]; then
    echo "Ошибка: SKIP_NPM_CI=1, но нет frontend/node_modules. Один раз выполни: cd ${ROOT}/frontend && npm ci" >&2
    exit 1
  fi
  echo "==> SKIP_NPM_CI=1 — frontend npm ci пропущен"
else
  echo "==> frontend npm ci"
  npm_config_maxsockets=2 npm ci --no-audit --no-fund
fi
NODE_OPTIONS="--max-old-space-size=${NODE_BUILD_MEMORY_MB}" npm run build

echo "==> PM2: restart crm-backend, crm-frontend"
pm2 restart crm-backend crm-frontend --update-env
pm2 save

echo "==> Готово."
