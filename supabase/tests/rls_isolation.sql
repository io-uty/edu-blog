-- 학원 간 데이터 격리 테스트. 실패하면 예외로 중단된다.
-- 실행: psql -v ON_ERROR_STOP=1 -f _local_auth_stub.sql -f ../migrations/*.sql -f rls_isolation.sql
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function public.is_member(uuid), public.is_tenant_admin(uuid), public.is_platform_admin() to authenticated;

-- 준비: 학원 A, B / 사용자 a(A 소속), b(B 소속)
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
insert into tenants (id, name, academy_type) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'A학원', '영어학원'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'B학원', '편입학원');
insert into tenant_members (tenant_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'owner');
insert into tenant_brands (tenant_id, primary_color) values
  ('aaaaaaaa-0000-0000-0000-000000000000', '#112233'), ('bbbbbbbb-0000-0000-0000-000000000000', '#445566');
insert into projects (id, tenant_id, topic, content_type) values
  ('a1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'A 주제', '영어'),
  ('b1000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'B 주제', '편입영어');
insert into subscriptions (tenant_id, plan_id, status) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'trial', 'trial'), ('bbbbbbbb-0000-0000-0000-000000000000', 'trial', 'trial');
insert into product_events (tenant_id, user_id, event_type) values
  ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000b', 'signup_completed');

-- ── 사용자 a 로 접속 ──
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';

do $$
declare n int; ok boolean;
begin
  select count(*) into n from tenants;            assert n = 1, '다른 학원 tenants 가 보임';
  select count(*) into n from projects;           assert n = 1, '다른 학원 projects 가 보임';
  select count(*) into n from projects where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000';
                                                  assert n = 0, 'tenant_id 지정으로 B 콘텐츠 조회됨';
  select count(*) into n from tenant_brands;      assert n = 1, '다른 학원 브랜드가 보임';
  select count(*) into n from subscriptions;      assert n = 1, '다른 학원 구독이 보임';
  select count(*) into n from product_events;     assert n = 0, '일반 사용자가 이벤트를 조회함';

  update projects set title = '해킹' where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000';
  get diagnostics n = row_count;                  assert n = 0, 'B 콘텐츠 수정됨';
  delete from tenant_brands where tenant_id = 'bbbbbbbb-0000-0000-0000-000000000000';
  get diagnostics n = row_count;                  assert n = 0, 'B 브랜드 삭제됨';

  -- 클라이언트가 tenant_id 를 B 로 바꿔 넣어도 거부
  ok := false;
  begin insert into projects (tenant_id, topic, content_type) values ('bbbbbbbb-0000-0000-0000-000000000000', 'x', 'x');
  exception when insufficient_privilege then ok := true; end;
  assert ok, 'B 학원에 콘텐츠 생성됨';

  -- 자기 학원 콘텐츠는 정상 생성
  insert into projects (tenant_id, topic, content_type) values ('aaaaaaaa-0000-0000-0000-000000000000', 'A 두번째', '영어');

  -- 사용량·구독 직접 조작 불가
  ok := false;
  begin insert into usage_ledger (tenant_id, usage_type, quantity, idempotency_key) values ('aaaaaaaa-0000-0000-0000-000000000000', 'content', -100, 'x');
  exception when insufficient_privilege then ok := true; end;
  assert ok, '클라이언트가 사용량을 조작함';
  ok := false;
  begin update subscriptions set status = 'active';
    get diagnostics n = row_count; ok := (n = 0);
  exception when insufficient_privilege then ok := true; end;
  assert ok, '클라이언트가 구독을 활성화함';
  ok := false;
  begin perform public.consume_usage('aaaaaaaa-0000-0000-0000-000000000000', null, 'content', -5, null, 'k');
  exception when insufficient_privilege then ok := true; end;
  assert ok, '클라이언트가 consume_usage 를 직접 호출함';

  -- 이벤트: 남의 학원·남의 user_id 로 기록 불가
  ok := false;
  begin insert into product_events (tenant_id, user_id, event_type) values ('bbbbbbbb-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'content_copied');
  exception when insufficient_privilege then ok := true; end;
  assert ok, '다른 학원 이벤트가 기록됨';
  insert into product_events (tenant_id, user_id, event_type) values ('aaaaaaaa-0000-0000-0000-000000000000', '00000000-0000-0000-0000-00000000000a', 'content_copied');
  raise notice 'RLS 격리 테스트 통과';
end $$;

reset role;

-- ── 사용량 차감(서버 전용 함수): 한도·중복 키 ──
do $$
declare r record;
begin
  select * into r from consume_usage('aaaaaaaa-0000-0000-0000-000000000000', null, 'content', 1, null, 'req-1'); assert r.allowed and r.used = 1, '1회차';
  select * into r from consume_usage('aaaaaaaa-0000-0000-0000-000000000000', null, 'content', 1, null, 'req-1'); assert r.allowed and r.used = 1, '같은 키 재시도가 중복 차감됨';
  select * into r from consume_usage('aaaaaaaa-0000-0000-0000-000000000000', null, 'content', 1, null, 'req-2'); assert r.used = 2;
  select * into r from consume_usage('aaaaaaaa-0000-0000-0000-000000000000', null, 'content', 1, null, 'req-3'); assert r.used = 3;
  select * into r from consume_usage('aaaaaaaa-0000-0000-0000-000000000000', null, 'content', 1, null, 'req-4'); assert not r.allowed, '무료 한도(3)를 넘어 차감됨';
  select * into r from consume_usage('bbbbbbbb-0000-0000-0000-000000000000', null, 'content', 1, null, 'req-1'); assert r.allowed and r.used = 1, 'B 사용량이 A와 섞임';
  raise notice '사용량 차감 테스트 통과';
end $$;
