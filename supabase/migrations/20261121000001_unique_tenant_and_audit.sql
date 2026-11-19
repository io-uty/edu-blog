-- 1) 학원 중복 등록을 DB 에서 막는다(서버 코드가 놓쳐도 저장되지 않게)
--    - 한 계정은 학원 하나만 소속된다
--    - 같은 학원명(+지점명)은 한 번만 등록된다(공백·대소문자 무시)

create unique index if not exists tenant_members_one_per_user on public.tenant_members (user_id);

alter table public.tenants
  add column if not exists name_key text generated always as (
    lower(regexp_replace(name, '\s', '', 'g')) || '|' || lower(regexp_replace(coalesce(branch_name, ''), '\s', '', 'g'))
  ) stored;
create unique index if not exists tenants_name_key_unique on public.tenants (name_key);

-- 학원 생성은 지점명도 함께 받는다(이름만 먼저 만들면 같은 이름·다른 지점이 서로 충돌하므로)
drop function if exists public.create_tenant_for_user(uuid, text, text);
create or replace function public.create_tenant_for_user(p_user uuid, p_name text, p_type text, p_branch text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('create_tenant:' || p_user::text));
  select tenant_id into v_id from tenant_members where user_id = p_user order by created_at limit 1;
  if v_id is not null then return v_id; end if;   -- 이미 학원이 있으면 새로 만들지 않고 기존 학원을 돌려준다
  insert into tenants (name, academy_type, branch_name) values (p_name, p_type, nullif(trim(p_branch), '')) returning id into v_id;
  insert into tenant_members (tenant_id, user_id, role) values (v_id, p_user, 'owner');
  insert into tenant_brands (tenant_id) values (v_id);
  insert into tenant_content_settings (tenant_id) values (v_id);
  insert into subscriptions (tenant_id, plan_id, status) values (v_id, 'trial', 'trial');
  return v_id;
end;
$$;
revoke all on function public.create_tenant_for_user(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_tenant_for_user(uuid, text, text, text) to service_role;

-- 2) 운영자 작업 기록(삭제·초기화). 데이터 초기화로도 지워지지 않고, 서버(service_role)만 읽고 쓴다.
create table if not exists public.admin_audit (
  id          uuid primary key default gen_random_uuid(),
  admin_email text,
  action      text not null,
  target      text,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
alter table public.admin_audit enable row level security;
revoke all on public.admin_audit from anon, authenticated;
grant all on public.admin_audit to service_role;
