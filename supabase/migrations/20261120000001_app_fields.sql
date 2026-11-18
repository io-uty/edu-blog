-- 현재 앱 화면이 쓰는 필드 추가(기존 테이블에 컬럼만 덧붙임, 삭제 없음)

alter table public.tenants
  add column if not exists onboarded_at timestamptz;

alter table public.tenant_content_settings
  add column if not exists style_excerpts text[] not null default '{}';

alter table public.tenant_sources
  add column if not exists robots text,
  add column if not exists consent boolean not null default false,
  add column if not exists fields text[] not null default '{}';

-- 지금의 Canvas 이미지 카드(문구·레이아웃) 목록. AI 이미지 파이프라인(Phase 2)은 project_images 를 쓴다.
alter table public.projects
  add column if not exists image_items jsonb not null default '[]',
  add column if not exists region_index smallint,
  add column if not exists is_mock boolean not null default false;

-- 서버 API(service_role)가 테넌트를 만들 때 쓰는 한 번의 트랜잭션.
-- 이미 소속된 학원이 있으면 새로 만들지 않는다(가입자 1명 = 학원 1곳, MVP).
create or replace function public.create_tenant_for_user(p_user uuid, p_name text, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select tenant_id into v_id from tenant_members where user_id = p_user limit 1;
  if v_id is not null then return v_id; end if;
  insert into tenants (name, academy_type) values (p_name, p_type) returning id into v_id;
  insert into tenant_members (tenant_id, user_id, role) values (v_id, p_user, 'owner');
  insert into tenant_brands (tenant_id) values (v_id);
  insert into tenant_content_settings (tenant_id) values (v_id);
  insert into subscriptions (tenant_id, plan_id, status) values (v_id, 'trial', 'trial');
  return v_id;
end;
$$;
revoke all on function public.create_tenant_for_user(uuid, text, text) from public, anon, authenticated;

-- Supabase 기본 권한(authenticated 에 테이블 권한)은 유지하고, 행 접근은 RLS 로만 결정한다.
