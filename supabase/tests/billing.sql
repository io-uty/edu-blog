-- 무료 체험 2회 · 결제 후 이용권 활성화 테스트(로컬 PostgreSQL)
insert into auth.users values ('00000000-0000-0000-0000-0000000000d1');
do $$
declare t uuid; r record; s uuid; s2 uuid; n int;
begin
  t := create_tenant_for_user('00000000-0000-0000-0000-0000000000d1', '결제테스트학원', '수학학원');
  select * into r from consume_usage(t, null, 'content', 1, null, 'g1'); assert r.allowed and r.used = 1;
  select * into r from consume_usage(t, null, 'content', 1, null, 'g2'); assert r.allowed and r.used = 2;
  select * into r from consume_usage(t, null, 'content', 1, null, 'g3'); assert not r.allowed and r.usage_limit = 2, '무료 2회 넘게 허용됨';
  -- 실패 환불(-1) 뒤에는 다시 1회 가능
  insert into usage_ledger (tenant_id, usage_type, quantity, idempotency_key) values (t, 'content', -1, 'refund:g2');
  select * into r from consume_usage(t, null, 'content', 1, null, 'g4'); assert r.allowed, '환불 후 재사용 불가';
  select * into r from consume_usage(t, null, 'content', 1, null, 'g5'); assert not r.allowed;

  -- 결제: 주문 생성 → 승인 → 새 이용권으로 한도 초기화
  insert into payments (tenant_id, plan_id, provider, mode, order_id, amount, status) values (t, 'basic', 'test', 'test', 'o1', 29000, 'pending');
  s  := activate_subscription('o1', 'test_k', '{}');
  s2 := activate_subscription('o1', 'test_k', '{}');
  assert s = s2, '같은 주문 승인이 두 번 반영됨';
  select count(*) into n from subscriptions where tenant_id = t and status = 'active'; assert n = 1;
  select count(*) into n from subscriptions where tenant_id = t and status = 'trial'; assert n = 0, '체험 구독이 남음';
  assert (select subscription_status from tenants where id = t) = 'active';
  assert (select status from payments where order_id = 'o1') = 'paid';
  select * into r from consume_usage(t, null, 'content', 1, null, 'p1'); assert r.allowed and r.usage_limit = 30, '결제 후 한도가 바뀌지 않음';
  raise notice '결제·무료 2회 테스트 통과';
end $$;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000d1';
do $$
declare ok boolean := false;
begin
  begin perform activate_subscription('o1', 'x', '{}');
  exception when insufficient_privilege then ok := true; end;
  assert ok, '클라이언트가 이용권 활성화 함수를 직접 호출함';
  ok := false;
  begin update payments set status = 'paid';
  exception when insufficient_privilege then ok := true; end;
  assert ok, '클라이언트가 결제 상태를 바꿈';
  raise notice '결제 권한 테스트 통과';
end $$;
reset role;
