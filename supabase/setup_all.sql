-- bbolog 전체 스키마(새 Supabase 프로젝트에 한 번만 실행). SQL Editor 에 전체를 붙여넣고 Run.
-- 이미 설치된 DB 는 scripts/db-migrate.sh 로 새 마이그레이션만 적용한다.
begin;
-- bbolog 멀티테넌트 SaaS 핵심 스키마 (초안 · 아직 어떤 DB에도 적용하지 않음)
-- 대상: Supabase(Postgres 15+). auth.users / auth.uid() 는 Supabase Auth 가 제공한다.
-- 원칙
--   1) 테넌트 데이터는 모두 tenant_id 로 분리하고 RLS 로 막는다.
--   2) 클라이언트가 보낸 tenant_id 는 믿지 않는다: 정책은 auth.uid() 의 소속(tenant_members)으로만 판단한다.
--   3) 사용량·구독·결제는 클라이언트가 쓸 수 없다(service_role 또는 security definer 함수만).
--   4) 기존 데이터는 브라우저 localStorage 에만 있으므로 삭제되는 DB 테이블은 없다.

create extension if not exists pgcrypto;

-- ───────────────────────── 테넌트 · 멤버 ─────────────────────────

create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(name) between 1 and 80),
  academy_type        text not null,                 -- 편입학원 | 영어학원 | ... | 기타
  academy_type_custom text,                          -- 기타 교육기관일 때 직접 입력
  branch_name         text,
  onboarding_step     smallint not null default 1,   -- 1~3, 완료 시 4
  subscription_status text not null default 'trial'
    check (subscription_status in ('trial', 'active', 'past_due', 'canceled', 'expired')),
  created_at          timestamptz not null default now()
);

create table public.tenant_members (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner', 'admin', 'editor')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index tenant_members_user_idx on public.tenant_members (user_id);

-- 서비스 운영자(전체 통계 접근). 테넌트 역할과 별개.
create table public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ───────────────────────── 학원 설정 ─────────────────────────

create table public.tenant_brands (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references public.tenants(id) on delete cascade,
  logo_url            text,                 -- Storage 경로(테넌트 폴더)
  logo_permission     boolean not null default false, -- 이미지에 로고 사용 권한 확인
  primary_color       text check (primary_color ~* '^#[0-9a-f]{6}$'),
  academy_description text,
  official_website    text,
  blog_url            text,
  location            text,
  sns_urls            text[] not null default '{}',
  features            text[] not null default '{}',   -- 학원의 특징
  instructors         jsonb  not null default '[]',   -- [{name, subject, intro}]
  representative_instructor text,
  main_subjects       text[] not null default '{}',
  brand_guidelines    jsonb  not null default '{}',   -- 인사말, 마무리 소제목, 예약 링크, 장소 등
  format_template     jsonb  not null default '{}',   -- 붙여넣기 서식(정렬·글자 크기·소제목)
  image_design        jsonb  not null default '{}',   -- 이미지 레이아웃·색
  updated_at          timestamptz not null default now()
);

create table public.tenant_content_settings (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null unique references public.tenants(id) on delete cascade,
  writing_tone           text,
  target_audience        text,
  courses                text[] not null default '{}',
  subjects               text[] not null default '{}',   -- 콘텐츠 주제
  seo_keywords           text[] not null default '{}',   -- 지역 SEO
  official_promo_phrases text[] not null default '{}',
  prohibited_expressions text[] not null default '{}',
  style_profile          jsonb  not null default '{}',   -- 업로드한 기존 글에서 분석한 문체·구성
  updated_at             timestamptz not null default now()
);

-- 홈페이지·SNS·업로드 자료 등 출처. 수집된 사실은 반드시 출처·확인일과 함께 저장.
create table public.tenant_sources (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants(id) on delete cascade,
  source_url          text,
  source_type         text not null check (source_type in
                        ('homepage', 'sns', 'blog_sample', 'upload', 'university_official', 'image_asset')),
  permission_status   text not null default 'unknown'
    check (permission_status in ('unknown', 'user_consented', 'robots_allowed', 'robots_disallowed', 'licensed', 'denied')),
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'verified', 'rejected')),
  license             text,          -- 예: CC BY-SA 4.0, 학교 서면 허락
  extracted           jsonb not null default '{}',   -- 추출 결과(추측 금지: 발견한 값만)
  checked_at          timestamptz,
  created_at          timestamptz not null default now()
);
create index tenant_sources_tenant_idx on public.tenant_sources (tenant_id, source_type);

-- ───────────────────────── 콘텐츠 ─────────────────────────

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id) on delete cascade,
  created_by   uuid references auth.users(id) on delete set null,
  topic        text not null,
  content_type text not null,
  title        text,
  draft        jsonb,          -- 현재 Draft 구조 그대로
  plan         jsonb,
  status       text not null default 'draft' check (status in ('draft', 'ready', 'published_confirmed')),
  published_confirmed_at timestamptz, -- 사용자가 직접 확인한 발행(공식 연동 아님)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index projects_tenant_idx on public.projects (tenant_id, updated_at desc);

create table public.project_images (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id) on delete cascade,
  project_id        uuid not null references public.projects(id) on delete cascade,
  target_section    smallint,                -- null = 썸네일
  image_purpose     text,
  key_message       text,
  visual_description text,
  style             text,
  aspect_ratio      text not null default '1:1',
  negative_prompt   text,
  prompt            text,                    -- 실제 이미지 모델에 보낸 2~3문장
  storage_path      text,                    -- tenant_id/ 폴더 아래
  status            text not null default 'planned'
    check (status in ('planned', 'generating', 'verifying', 'ready', 'rejected', 'failed')),
  verification      jsonb not null default '{}',  -- Vision 검증 결과
  source_id         uuid references public.tenant_sources(id), -- 실제 사진 기반일 때
  is_real_photo_based boolean not null default false,
  attempts          smallint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index project_images_project_idx on public.project_images (project_id);

-- ───────────────────────── 요금제 · 사용량 · 결제 ─────────────────────────

create table public.plans (
  id            text primary key,              -- 'trial', 'basic', ...
  name          text not null,
  price         integer not null default 0,    -- 원
  content_limit integer,                       -- null = 무제한
  image_limit   integer,
  period_days   integer,                       -- 체험은 null 가능
  features      jsonb not null default '{}',
  is_trial      boolean not null default false,
  active        boolean not null default true
);

create table public.subscriptions (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  plan_id    text not null references public.plans(id),
  status     text not null check (status in ('trial', 'active', 'past_due', 'canceled', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index subscriptions_tenant_idx on public.subscriptions (tenant_id, started_at desc);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  plan_id        text not null references public.plans(id),
  provider       text not null,                 -- 'toss' 등
  mode           text not null check (mode in ('test', 'live')),
  order_id       text not null unique,
  payment_key    text,
  amount         integer not null,
  status         text not null check (status in ('pending', 'paid', 'failed', 'canceled')),
  verified_at    timestamptz,                   -- PG 서버 검증 후에만 채움
  raw            jsonb not null default '{}',
  created_at     timestamptz not null default now()
);

-- 사용량 원장: 차감(+)·환불(-)을 행으로만 쌓는다. 같은 키 재요청은 무시(중복 차감 방지).
create table public.usage_ledger (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete set null,
  usage_type      text not null check (usage_type in ('content', 'image')),
  quantity        integer not null check (quantity <> 0),
  project_id      uuid references public.projects(id) on delete set null,
  idempotency_key text not null,
  created_at      timestamptz not null default now(),
  unique (tenant_id, usage_type, idempotency_key)
);
create index usage_ledger_tenant_idx on public.usage_ledger (tenant_id, usage_type, created_at);

-- ───────────────────────── 이벤트 ─────────────────────────

create table public.product_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references public.tenants(id) on delete cascade, -- 가입 직후 등은 null 가능
  user_id     uuid references auth.users(id) on delete set null,
  event_type  text not null check (event_type in (
    'signup_completed', 'onboarding_started', 'onboarding_completed',
    'content_generation_started', 'content_generation_completed', 'image_generation_completed',
    'content_edited', 'content_copied', 'image_downloaded', 'package_downloaded',
    'naver_write_opened', 'publish_confirmed', 'pricing_viewed', 'purchase_clicked',
    'checkout_started', 'payment_completed')),
  session_id  text,
  project_id  uuid references public.projects(id) on delete set null,
  metadata    jsonb not null default '{}',   -- 본문·개인정보 저장 금지(서버에서 허용 키만 통과)
  dedupe_key  text,                          -- 같은 사건의 중복 기록 방지
  occurred_at timestamptz not null default now(),
  unique (tenant_id, event_type, dedupe_key)
);
create index product_events_type_time_idx on public.product_events (event_type, occurred_at);
create index product_events_tenant_time_idx on public.product_events (tenant_id, occurred_at);

-- 분석 동의(필수 아님 이벤트 수집 여부)
create table public.user_consents (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  analytics    boolean not null default false,
  policy_version text not null,
  agreed_at    timestamptz not null default now()
);

-- ───────────────────────── 권한 함수 ─────────────────────────

create or replace function public.is_member(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_members m where m.tenant_id = t and m.user_id = auth.uid());
$$;

create or replace function public.is_tenant_admin(t uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from tenant_members m
                 where m.tenant_id = t and m.user_id = auth.uid() and m.role in ('owner', 'admin'));
$$;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins a where a.user_id = auth.uid());
$$;

-- 무료/유료 한도 안에서만 사용량을 차감한다. 같은 키로 다시 부르면 처음 결과를 돌려준다.
-- 서버(API 라우트)만 호출한다: anon/authenticated 에게 실행 권한을 주지 않는다.
create or replace function public.consume_usage(
  p_tenant uuid, p_user uuid, p_type text, p_qty integer, p_project uuid, p_key text
) returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_used  integer;
  v_since timestamptz;
begin
  -- 같은 테넌트 동시 요청 직렬화
  perform 1 from tenants where id = p_tenant for update;

  if exists (select 1 from usage_ledger where tenant_id = p_tenant and usage_type = p_type and idempotency_key = p_key) then
    select coalesce(sum(quantity), 0) into v_used from usage_ledger
      where tenant_id = p_tenant and usage_type = p_type;
    return query select true, v_used, null::integer;
    return;
  end if;

  select case when p_type = 'content' then pl.content_limit else pl.image_limit end, s.started_at
    into v_limit, v_since
  from subscriptions s join plans pl on pl.id = s.plan_id
  where s.tenant_id = p_tenant and s.status in ('trial', 'active')
    and (s.expires_at is null or s.expires_at > now())
  order by s.started_at desc limit 1;

  if not found then
    return query select false, 0, 0;
    return;
  end if;

  select coalesce(sum(quantity), 0) into v_used from usage_ledger
    where tenant_id = p_tenant and usage_type = p_type and created_at >= v_since;

  if v_limit is not null and v_used + p_qty > v_limit then
    return query select false, v_used, v_limit;
    return;
  end if;

  insert into usage_ledger (tenant_id, user_id, usage_type, quantity, project_id, idempotency_key)
  values (p_tenant, p_user, p_type, p_qty, p_project, p_key);
  return query select true, v_used + p_qty, v_limit;
end;
$$;
revoke all on function public.consume_usage(uuid, uuid, text, integer, uuid, text) from public, anon, authenticated;

-- ───────────────────────── RLS ─────────────────────────

alter table public.tenants                 enable row level security;
alter table public.tenant_members          enable row level security;
alter table public.platform_admins         enable row level security;
alter table public.tenant_brands           enable row level security;
alter table public.tenant_content_settings enable row level security;
alter table public.tenant_sources          enable row level security;
alter table public.projects                enable row level security;
alter table public.project_images          enable row level security;
alter table public.plans                   enable row level security;
alter table public.subscriptions           enable row level security;
alter table public.payments                enable row level security;
alter table public.usage_ledger            enable row level security;
alter table public.product_events          enable row level security;
alter table public.user_consents           enable row level security;

-- 테넌트: 소속 멤버만 조회, 관리자만 수정. 생성은 서버(온보딩 API)에서 service_role 로.
create policy tenants_select on public.tenants for select using (public.is_member(id) or public.is_platform_admin());
create policy tenants_update on public.tenants for update using (public.is_tenant_admin(id)) with check (public.is_tenant_admin(id));

create policy members_select on public.tenant_members for select using (public.is_member(tenant_id) or public.is_platform_admin());
-- 멤버 추가·삭제는 서버 API(초대 흐름)에서만.

create policy platform_admins_self on public.platform_admins for select using (user_id = auth.uid());

-- 학원 설정·출처·콘텐츠: 같은 테넌트 멤버만 읽고 쓴다.
do $$
declare t text;
begin
  foreach t in array array['tenant_brands', 'tenant_content_settings', 'tenant_sources', 'projects', 'project_images'] loop
    execute format('create policy %1$s_select on public.%1$s for select using (public.is_member(tenant_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_member(tenant_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_member(tenant_id)) with check (public.is_member(tenant_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete using (public.is_tenant_admin(tenant_id))', t);
  end loop;
end $$;

-- 요금제는 누구나 조회(활성만), 수정은 service_role.
create policy plans_select on public.plans for select using (active or public.is_platform_admin());

-- 구독·결제·사용량: 멤버는 자기 학원 것만 조회. 쓰기 정책 없음 = 클라이언트 쓰기 불가.
create policy subscriptions_select on public.subscriptions for select using (public.is_member(tenant_id) or public.is_platform_admin());
create policy payments_select      on public.payments      for select using (public.is_tenant_admin(tenant_id) or public.is_platform_admin());
create policy usage_select         on public.usage_ledger  for select using (public.is_member(tenant_id) or public.is_platform_admin());

-- 이벤트: 본인 명의로 자기 학원 이벤트만 기록. 조회는 운영자만.
create policy events_insert on public.product_events for insert
  with check (user_id = auth.uid() and (tenant_id is null or public.is_member(tenant_id)));
create policy events_select on public.product_events for select using (public.is_platform_admin());

create policy consents_self on public.user_consents for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── 기본 데이터(예시값 · 관리자 화면에서 변경) ─────────────────────────

insert into public.plans (id, name, price, content_limit, image_limit, period_days, is_trial, features)
values ('trial', '무료 체험', 0, 3, 2, null, true, '{"edit": true, "download": true}')
on conflict (id) do nothing;

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

-- 서버(service_role)만 사용량 차감·테넌트 생성 함수를 실행할 수 있게 한다.
grant execute on function public.consume_usage(uuid, uuid, text, integer, uuid, text) to service_role;
grant execute on function public.create_tenant_for_user(uuid, text, text) to service_role;

-- 테이블 권한(행 접근은 RLS 가 결정). 최근 Supabase 는 SQL 로 만든 테이블에 권한을 자동 부여하지 않으므로 명시한다.
-- 클라이언트(authenticated)는 필요한 동작만, 사용량·구독·결제는 조회만 가능하다.
grant usage on schema public to anon, authenticated, service_role;

grant select, update                 on public.tenants                 to authenticated;
grant select                         on public.tenant_members          to authenticated;
grant select                         on public.platform_admins         to authenticated;
grant select, insert, update, delete on public.tenant_brands           to authenticated;
grant select, insert, update, delete on public.tenant_content_settings to authenticated;
grant select, insert, update, delete on public.tenant_sources          to authenticated;
grant select, insert, update, delete on public.projects                to authenticated;
grant select, insert, update, delete on public.project_images          to authenticated;
grant select                         on public.plans                   to anon, authenticated;
grant select                         on public.subscriptions           to authenticated;
grant select                         on public.payments                to authenticated;
grant select                         on public.usage_ledger            to authenticated;
grant select, insert                 on public.product_events          to authenticated;
grant select, insert, update, delete on public.user_consents           to authenticated;

-- 서버(service_role)는 RLS 를 우회하는 관리 작업용
grant all on all tables in schema public to service_role;
grant execute on function public.is_member(uuid), public.is_tenant_admin(uuid), public.is_platform_admin() to authenticated, service_role;


-- 무료 체험 2회 + 유료 이용권(예시 가격 · 관리자가 plans 테이블에서 변경)
update public.plans set content_limit = 2, image_limit = 2 where id = 'trial';

insert into public.plans (id, name, price, content_limit, image_limit, period_days, is_trial, features, active) values
  ('basic', '베이직', 29000, 30, 30, 30, false, '{"summary": "월 30편 · 이미지 30장", "note": "예시 가격"}', true),
  ('pro',   '프로',   59000, 100, 100, 30, false, '{"summary": "월 100편 · 이미지 100장", "note": "예시 가격"}', true)
on conflict (id) do nothing;

-- PG 승인 검증을 마친 주문만 서버가 호출한다. 결제 기록·구독·학원 상태를 한 번에 바꾼다.
create or replace function public.activate_subscription(p_order text, p_payment_key text, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pay payments%rowtype;
  v_days integer;
  v_sub uuid;
begin
  select * into v_pay from payments where order_id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if v_pay.status = 'paid' then
    select id into v_sub from subscriptions where tenant_id = v_pay.tenant_id and status = 'active' order by started_at desc limit 1;
    return v_sub; -- 같은 주문을 두 번 승인해도 한 번만 반영
  end if;
  if v_pay.status <> 'pending' then raise exception 'order not payable'; end if;

  select coalesce(period_days, 30) into v_days from plans where id = v_pay.plan_id;
  update payments set status = 'paid', payment_key = p_payment_key, verified_at = now(), raw = coalesce(p_raw, '{}') where id = v_pay.id;
  update subscriptions set status = 'canceled' where tenant_id = v_pay.tenant_id and status in ('trial', 'active');
  insert into subscriptions (tenant_id, plan_id, status, started_at, expires_at)
    values (v_pay.tenant_id, v_pay.plan_id, 'active', now(), now() + make_interval(days => v_days))
    returning id into v_sub;
  update tenants set subscription_status = 'active' where id = v_pay.tenant_id;
  return v_sub;
end;
$$;
revoke all on function public.activate_subscription(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_subscription(text, text, jsonb) to service_role;

-- 같은 사용자가 학원 등록을 동시에 두 번 보내도 학원이 하나만 생기게 한다(사용자 단위 잠금)
create or replace function public.create_tenant_for_user(p_user uuid, p_name text, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('create_tenant:' || p_user::text));
  select tenant_id into v_id from tenant_members where user_id = p_user order by created_at limit 1;
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
grant execute on function public.create_tenant_for_user(uuid, text, text) to service_role;

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

-- 계좌이체(개인 계좌 직접 입금) 결제 지원
-- 주문에 입금자명·만료·확인 주체를 붙이고, 들어온 입금 알림을 기록한다(중복 처리 방지·추적용).

alter table public.payments
  add column if not exists depositor_name text,
  add column if not exists expires_at timestamptz,
  add column if not exists confirmed_by text,     -- 'auto:<거래번호>' | 'admin:<이메일>'
  add column if not exists deposit_tx_id text;    -- 이 주문을 확인한 입금 거래번호
create unique index if not exists payments_deposit_tx_unique on public.payments (deposit_tx_id) where deposit_tx_id is not null;

create table if not exists public.deposit_events (
  id             uuid primary key default gen_random_uuid(),
  tx_id          text not null unique,            -- 같은 입금 알림이 두 번 와도 한 번만 처리
  amount         integer not null check (amount > 0),
  depositor_name text not null,
  occurred_at    timestamptz,
  status         text not null check (status in ('matched', 'unmatched', 'ambiguous', 'resolved')),
  order_id       text,
  source         text not null default 'webhook',
  created_at     timestamptz not null default now()
);
create index if not exists deposit_events_status_idx on public.deposit_events (status, created_at desc);
alter table public.deposit_events enable row level security;
revoke all on public.deposit_events from anon, authenticated;
grant all on public.deposit_events to service_role;

update public.plans set image_limit = 6 where id = 'trial';  -- 20261123000001_trial_image_limit

-- 가입 정보(이름·전화·아이디)와 휴대폰 인증번호. 전화번호·아이디는 중복될 수 없다(DB 제약이 최종 보증).
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  phone      text not null constraint profiles_phone_key unique,    -- 숫자만(01012345678)
  email      text not null,
  login_id   text not null constraint profiles_login_id_key unique, -- 소문자로 저장
  created_at timestamptz not null default now()
);

create table if not exists public.phone_verifications (
  phone       text primary key,
  code_hash   text not null,
  expires_at  timestamptz not null,
  sent_at     timestamptz not null default now(),
  attempts    int not null default 0,
  verified_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.phone_verifications enable row level security;
revoke all on public.profiles, public.phone_verifications from anon, authenticated;
grant all on public.profiles, public.phone_verifications to service_role;

-- 인증번호 확인: 시도 횟수 증가와 비교를 한 번에(동시에 여러 번 찍어 보는 것을 막는다). 5회까지, 만료 전까지만.
create or replace function public.verify_phone(p_phone text, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  update phone_verifications set attempts = attempts + 1
   where phone = p_phone and verified_at is null and attempts < 5 and expires_at > now()
   returning code_hash into v_hash;
  if v_hash is null or v_hash <> p_hash then return false; end if;
  update phone_verifications set verified_at = now() where phone = p_phone;
  return true;
end;
$$;
revoke all on function public.verify_phone(text, text) from public, anon, authenticated;
grant execute on function public.verify_phone(text, text) to service_role;  -- 20261124000001_profiles_phone_verification

-- 요금제 → 생성권 묶음: 5개 4,900원 / 10개 8,900원 / 30개 19,900원(구매 후 1년 유효).
-- 생성권은 쌓인다: 새로 사도 남은 생성권(체험 포함)이 사라지지 않는다. 글 1개당 이미지 3장(글당 이미지는 썸네일 포함 2~5장, 평균 3장 기준).
update public.plans set active = false where id in ('basic', 'pro');

insert into public.plans (id, name, price, content_limit, image_limit, period_days, is_trial, features, active) values
  ('pack5',  '생성권 5개',  4900,  5,  15, 365, false, '{"summary": "블로그 글 5개 · 이미지 15장"}', true),
  ('pack10', '생성권 10개', 8900,  10, 30, 365, false, '{"summary": "블로그 글 10개 · 이미지 30장"}', true),
  ('pack30', '생성권 30개', 19900, 30, 90, 365, false, '{"summary": "블로그 글 30개 · 이미지 90장"}', true)
on conflict (id) do update set name = excluded.name, price = excluded.price, content_limit = excluded.content_limit,
  image_limit = excluded.image_limit, period_days = excluded.period_days, features = excluded.features, active = true;

-- 결제 확인: 기존 생성권(체험 포함)을 취소하지 않고 새 묶음을 더한다.
create or replace function public.activate_subscription(p_order text, p_payment_key text, p_raw jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_pay payments%rowtype;
  v_days integer;
  v_sub uuid;
begin
  select * into v_pay from payments where order_id = p_order for update;
  if not found then raise exception 'order not found'; end if;
  if v_pay.status = 'paid' then
    select id into v_sub from subscriptions where tenant_id = v_pay.tenant_id and status = 'active' order by started_at desc limit 1;
    return v_sub; -- 같은 주문을 두 번 승인해도 한 번만 반영
  end if;
  if v_pay.status <> 'pending' then raise exception 'order not payable'; end if;

  select coalesce(period_days, 365) into v_days from plans where id = v_pay.plan_id;
  update payments set status = 'paid', payment_key = p_payment_key, verified_at = now(), raw = coalesce(p_raw, '{}') where id = v_pay.id;
  insert into subscriptions (tenant_id, plan_id, status, started_at, expires_at)
    values (v_pay.tenant_id, v_pay.plan_id, 'active', now(), now() + make_interval(days => v_days))
    returning id into v_sub;
  update tenants set subscription_status = 'active' where id = v_pay.tenant_id;
  return v_sub;
end;
$$;
revoke all on function public.activate_subscription(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.activate_subscription(text, text, jsonb) to service_role;

-- 사용 차감: 유효한 생성권(체험 + 구매 묶음)의 한도를 모두 더하고, 그중 가장 이른 시작 이후 사용량과 비교한다.
-- shortcut: 오래된 묶음이 먼저 만료되면 그 묶음에서 쓴 양도 계속 합산된다(1년 안에는 해당 없음). 만료가 잦아지면 묶음별 차감 장부로 바꾼다.
create or replace function public.consume_usage(
  p_tenant uuid, p_user uuid, p_type text, p_qty integer, p_project uuid, p_key text
) returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
  v_unlimited boolean;
  v_used  integer;
  v_since timestamptz;
begin
  perform 1 from tenants where id = p_tenant for update;

  if exists (select 1 from usage_ledger where tenant_id = p_tenant and usage_type = p_type and idempotency_key = p_key) then
    select coalesce(sum(quantity), 0) into v_used from usage_ledger where tenant_id = p_tenant and usage_type = p_type;
    return query select true, v_used, null::integer;
    return;
  end if;

  select sum(case when p_type = 'content' then pl.content_limit else pl.image_limit end),
         bool_or((case when p_type = 'content' then pl.content_limit else pl.image_limit end) is null),
         min(s.started_at)
    into v_limit, v_unlimited, v_since
  from subscriptions s join plans pl on pl.id = s.plan_id
  where s.tenant_id = p_tenant and s.status in ('trial', 'active')
    and (s.expires_at is null or s.expires_at > now());

  if v_since is null then
    return query select false, 0, 0;
    return;
  end if;
  if v_unlimited then v_limit := null; end if;

  select coalesce(sum(quantity), 0) into v_used from usage_ledger
    where tenant_id = p_tenant and usage_type = p_type and created_at >= v_since;

  if v_limit is not null and v_used + p_qty > v_limit then
    return query select false, v_used, v_limit;
    return;
  end if;

  insert into usage_ledger (tenant_id, user_id, usage_type, quantity, project_id, idempotency_key)
  values (p_tenant, p_user, p_type, p_qty, p_project, p_key);
  return query select true, v_used + p_qty, v_limit;
end;
$$;
revoke all on function public.consume_usage(uuid, uuid, text, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.consume_usage(uuid, uuid, text, integer, uuid, text) to service_role;  -- 20261124000002_generation_packs

create table if not exists public._bbolog_migrations (name text primary key, applied_at timestamptz not null default now());
alter table public._bbolog_migrations enable row level security;
insert into public._bbolog_migrations (name) values ('20261119000001_saas_core.sql'), ('20261120000001_app_fields.sql'), ('20261120000002_service_role_grants.sql'), ('20261120000003_table_grants.sql'), ('20261120000004_billing.sql'), ('20261120000005_tenant_create_lock.sql'), ('20261121000001_unique_tenant_and_audit.sql'), ('20261122000001_bank_transfer.sql'), ('20261123000001_trial_image_limit.sql'), ('20261124000001_profiles_phone_verification.sql'), ('20261124000002_generation_packs.sql') on conflict do nothing;
commit;
