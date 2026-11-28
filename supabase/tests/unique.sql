-- 학원 중복 등록 방지 테스트
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2'), ('00000000-0000-0000-0000-0000000000f3');
do $$
declare a uuid; a2 uuid; a3 uuid; b uuid; ok boolean; n int; r record;
begin
  a  := create_tenant_for_user('00000000-0000-0000-0000-0000000000f1', '바른 영어학원', '영어학원');
  -- 같은 요청 재전송은 같은 학원을 돌려준다
  a3 := create_tenant_for_user('00000000-0000-0000-0000-0000000000f1', '바른 영어학원', '영어학원');
  assert a = a3, '같은 요청 재전송에 학원이 두 번 만들어짐';
  -- 한 계정이 다른 학원을 추가할 수 있다. 체험은 첫 학원에만.
  a2 := create_tenant_for_user('00000000-0000-0000-0000-0000000000f1', '다른이름학원', '영어학원');
  assert a <> a2, '두 번째 학원이 만들어지지 않음';
  select count(*) into n from subscriptions where tenant_id in (a, a2); assert n = 1, '학원마다 체험이 생김';
  -- 한도는 계정 전체로 나눠 쓴다: 두 번째 학원에서도 첫 학원 체험으로 생성 가능, 사용량은 합산
  update plans set content_limit = 2 where id = 'trial';
  select * into r from consume_usage(a, null, 'content', 1, null, 'u1'); assert r.allowed;
  select * into r from consume_usage(a2, null, 'content', 1, null, 'u2'); assert r.allowed and r.used = 2, '두 번째 학원이 체험을 못 씀';
  select * into r from consume_usage(a2, null, 'content', 1, null, 'u3'); assert not r.allowed, '계정 한도를 넘김';

  -- 같은 이름(공백·대소문자만 다름)을 다른 계정이 등록하면 거부
  ok := false;
  begin perform create_tenant_for_user('00000000-0000-0000-0000-0000000000f2', '바른영어학원', '영어학원');
  exception when unique_violation then ok := true; end;
  assert ok, '같은 이름 학원이 중복 등록됨';

  -- 같은 이름이라도 지점명이 다르면 허용
  b := create_tenant_for_user('00000000-0000-0000-0000-0000000000f2', '바른영어학원', '영어학원', '분당점');
  assert b <> a, '지점이 다른 학원이 거부됨';

  -- 같은 이름+같은 지점은 거부
  ok := false;
  begin perform create_tenant_for_user('00000000-0000-0000-0000-0000000000f3', '바른영어학원', '영어학원', '분당점');
  exception when unique_violation then ok := true; end;
  assert ok, '같은 이름·같은 지점이 중복 등록됨';

  raise notice '중복 방지 테스트 통과';
end $$;
