#!/usr/bin/env bash
# WP5: учебное восстановление из бэкапа.
#
# Бэкап, из которого ни разу не восстанавливались, бэкапом не является
# (§2.2.1 docs/implementation-prompt.md). Этот скрипт делает именно это:
# снимает дамп схемы public, уничтожает данные и поднимает их обратно.
#
# Запуск: npm run db:start && npm run db:drill
# Требует локальный Postgres на порту 54322 и инструменты pg_dump / pg_restore.

set -euo pipefail

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
DUMP_DIR="${DUMP_DIR:-/tmp/africonnecta-backup-drill}"
DUMP_FILE="${DUMP_DIR}/public.dump"
MARKER_ID="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
# Хостовый pg_dump на Intel-Mac часто старше сервера в контейнере (14 vs 17).
# Дамп и restore делаем утилитами из того же образа Postgres.
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-$(docker ps --filter name=supabase_db --format '{{.Names}}' | head -1)}"

if [[ -z "$DB_CONTAINER" ]]; then
  echo "FAIL: контейнер supabase_db не найден. Запусти npm run db:start" >&2
  exit 1
fi

mkdir -p "$DUMP_DIR"

query() {
  psql "$DATABASE_URL" -qAtc "$1"
}

require_row() {
  local sql="$1"
  local label="$2"
  local value
  value="$(query "$sql")"
  if [[ -z "$value" || "$value" == "0" ]]; then
    echo "FAIL: ${label} — ожидалась строка, получено «${value}»" >&2
    exit 1
  fi
  echo "  ${label}: ${value}"
}

echo "== 1. Состояние до дампа =="
require_row "select first_name || ' ' || last_name from public.experts where id = '${MARKER_ID}'" \
  "маркерный эксперт"
BEFORE_EXPERTS="$(query "select count(*) from public.experts")"
BEFORE_USERS="$(query "select count(*) from public.users")"
BEFORE_INSTITUTIONS="$(query "select count(*) from public.institutions")"
echo "  experts=${BEFORE_EXPERTS} users=${BEFORE_USERS} institutions=${BEFORE_INSTITUTIONS}"

if [[ "${BEFORE_EXPERTS}" -lt 1 ]]; then
  echo "FAIL: база пуста. Сначала npm run db:reset" >&2
  exit 1
fi

echo "== 2. Дамп пользовательских таблиц =="
# Справочники (countries, languages, expertise, plan_limits) не дампим:
# они из миграций и после truncate всё равно остаются. Дамп всей public
# плюс --disable-triggers требует суперпользователя — роль postgres в
# контейнере Supabase его не имеет.
docker exec "$DB_CONTAINER" pg_dump -U postgres -d postgres \
  --format=custom --no-owner --data-only \
  --table=public.users \
  --table=public.institutions \
  --table=public.institution_members \
  --table=public.files \
  --table=public.experts \
  --table=public.expert_expertise \
  --table=public.expert_languages \
  --table=public.audit_log \
  --table=public.contact_disclosures \
  --file=/tmp/public.dump
docker cp "$DB_CONTAINER:/tmp/public.dump" "$DUMP_FILE"
echo "  записан ${DUMP_FILE} ($(wc -c < "$DUMP_FILE") байт) из ${DB_CONTAINER}"

echo "== 3. Уничтожение данных (имитация потери) =="
psql "$DATABASE_URL" -q <<'SQL'
truncate table
  public.contact_disclosures,
  public.audit_log,
  public.expert_expertise,
  public.expert_languages,
  public.experts,
  public.institution_members,
  public.institutions,
  public.files,
  public.users
restart identity cascade;
SQL

GONE="$(query "select count(*) from public.experts")"
if [[ "$GONE" != "0" ]]; then
  echo "FAIL: после truncate в experts осталось ${GONE} строк" >&2
  exit 1
fi
echo "  experts=0 — данные уничтожены"

echo "== 4. Восстановление из дампа =="
docker cp "$DUMP_FILE" "$DB_CONTAINER:/tmp/public.dump"
docker exec "$DB_CONTAINER" pg_restore -U postgres -d postgres \
  --data-only --no-owner /tmp/public.dump

echo "== 5. Сверка =="
AFTER_EXPERTS="$(query "select count(*) from public.experts")"
AFTER_USERS="$(query "select count(*) from public.users")"
AFTER_INSTITUTIONS="$(query "select count(*) from public.institutions")"
AFTER_NAME="$(query "select first_name || ' ' || last_name from public.experts where id = '${MARKER_ID}'")"

echo "  experts:       ${BEFORE_EXPERTS} → ${AFTER_EXPERTS}"
echo "  users:         ${BEFORE_USERS} → ${AFTER_USERS}"
echo "  institutions:  ${BEFORE_INSTITUTIONS} → ${AFTER_INSTITUTIONS}"
echo "  маркер:        ${AFTER_NAME}"

if [[ "$AFTER_EXPERTS" != "$BEFORE_EXPERTS" ||
      "$AFTER_USERS" != "$BEFORE_USERS" ||
      "$AFTER_INSTITUTIONS" != "$BEFORE_INSTITUTIONS" ||
      "$AFTER_NAME" != "Yves Habimana" ]]; then
  echo "FAIL: восстановление не совпало с исходным состоянием" >&2
  exit 1
fi

echo "OK: восстановление из бэкапа проверено"
