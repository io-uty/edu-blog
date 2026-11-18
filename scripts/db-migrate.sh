#!/usr/bin/env bash
# supabase/migrations/*.sql 을 이름 순서대로, 아직 적용하지 않은 것만 적용한다(파일마다 하나의 트랜잭션).
# 접속 정보는 .env.local 의 SUPABASE_DB_URL 에서 읽고 화면에 출력하지 않는다.
set -euo pipefail
cd "$(dirname "$0")/.."
DB_URL=${SUPABASE_DB_URL:-$(awk -F= '/^SUPABASE_DB_URL=/{print substr($0,index($0,"=")+1)}' .env.local 2>/dev/null | tr -d '"'"'")}
[ -n "$DB_URL" ] || { echo "SUPABASE_DB_URL 이 .env.local 에 없습니다."; exit 1; }
PSQL=(psql "$DB_URL" -q -v ON_ERROR_STOP=1 -X)

"${PSQL[@]}" -c "create table if not exists public._bbolog_migrations (name text primary key, applied_at timestamptz not null default now()); alter table public._bbolog_migrations enable row level security;"
for f in supabase/migrations/*.sql; do
  name=$(basename "$f")
  done_=$("${PSQL[@]}" -tA -c "select 1 from public._bbolog_migrations where name = '$name'")
  if [ "$done_" = "1" ]; then echo "건너뜀  $name (적용됨)"; continue; fi
  "${PSQL[@]}" -1 -f "$f" -c "insert into public._bbolog_migrations (name) values ('$name')"
  echo "적용    $name"
done
