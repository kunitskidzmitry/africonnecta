#!/usr/bin/env bash
#
# Массовый сид профилей для замеров производительности поиска.
#
#   npm run db:seed:bulk          # 10 000 профилей
#   npm run db:seed:bulk 100000   # столько, сколько требует §3
#
# Работает только против локального стека: сам скрипт лишь передаёт SQL внутрь
# контейнера, а предохранитель по домену example.test стоит в scripts/seed-bulk.sql.
# Возврат к чистому состоянию — npm run db:reset.

set -euo pipefail

COUNT="${1:-10000}"
CONTAINER="${SUPABASE_DB_CONTAINER:-supabase_db_AfriConnecta}"

if ! [[ "$COUNT" =~ ^[0-9]+$ ]]; then
  echo "Количество профилей должно быть целым числом, получено: $COUNT" >&2
  exit 1
fi

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "Контейнер базы $CONTAINER не запущен. Сначала npm run db:start." >&2
  exit 1
fi

echo "Засеваю ${COUNT} профилей в ${CONTAINER}…"

docker exec -i "$CONTAINER" \
  psql -U postgres -d postgres -v ON_ERROR_STOP=1 -v "count=$COUNT" -f - \
  < "$(dirname "$0")/seed-bulk.sql"
