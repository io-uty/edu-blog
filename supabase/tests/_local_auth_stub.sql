-- 로컬 PostgreSQL에서 RLS 테스트를 돌리기 위한 Supabase Auth 최소 흉내(실제 Supabase에는 적용하지 않음)
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
grant usage on schema auth, public to authenticated;
grant execute on function auth.uid() to authenticated;
