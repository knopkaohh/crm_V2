#!/usr/bin/env bash
# Деплой CRM на сервер одной командой из корня репозитория:
#   chmod +x scripts/deploy.sh
#   ./scripts/deploy.sh
#
# Переменные окружения (опционально):
#   DEPLOY_BRANCH=main          — ветка для git pull
#   SKIP_PULL=1                  — не делать git pull (уже обновили вручную)
#   SKIP_MIGRATE=1               — не запускать prisma migrate deploy (только generate + build)

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_PULL="${SKIP_PULL:-0}"
SKIP_MIGRATE="${SKIP_MIGRATE:-0}"

echo "==> Корень проекта: $ROOT"

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

echo "==> Backend: npm ci, prisma, build"
cd "${ROOT}/backend"
npm ci
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

npm run build

echo "==> Frontend: npm ci, build"
cd "${ROOT}/frontend"
npm ci
npm run build

echo "==> PM2: restart crm-backend, crm-frontend"
pm2 restart crm-backend crm-frontend --update-env
pm2 save

echo "==> Готово."
