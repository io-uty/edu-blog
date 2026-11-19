-- 학원 중복 등록 방지 테스트
insert into auth.users values ('00000000-0000-0000-0000-0000000000f1'), ('00000000-0000-0000-0000-0000000000f2'), ('00000000-0000-0000-0000-0000000000f3');
do $$
declare a uuid; a2 uuid; b uuid; ok boolean; n int;
begin
  a  := create_tenant_for_user('00000000-0000-0000-0000-0000000000f1', '바른 영어학원', '영어학원');
  a2 := create_tenant_for_user('00000000-0000-0000-0000-0000000000f1', '다른이름학원', '영어학원');
  assert a = a2, '같은 계정에 학원이 두 번 만들어짐';
  select count(*) into n from tenants; assert n >= 1;

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

  -- 테이블에 직접 넣어도 한 계정에 두 학원 불가
  ok := false;
  begin
    insert into tenants (name, academy_type) values ('직접삽입', '영어학원');
    insert into tenant_members (tenant_id, user_id, role)
      values ((select id from tenants where name = '직접삽입'), '00000000-0000-0000-0000-0000000000f1', 'owner');
  exception when unique_violation then ok := true; end;
  assert ok, '한 계정이 두 학원에 소속됨';
  raise notice '중복 방지 테스트 통과';
end $$;
