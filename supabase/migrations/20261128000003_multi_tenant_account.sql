-- 한 계정이 학원을 여러 개 가진다. 무료체험·생성권은 계정 단위로 묶어 그 계정의 학원들이 나눠 쓴다.
-- 계정 = 학원의 owner. 체험은 계정의 첫 학원을 만들 때 한 번만 준다.

drop index if exists public.tenant_members_one_per_user;

-- 같은 계정(owner)이 가진 학원 전부. owner 가 없는 학원은 자기 자신만.
create or replace function public.account_tenants(p_tenant uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select array_agg(distinct m2.tenant_id order by m2.tenant_id)
       from tenant_members m1 join tenant_members m2 on m2.user_id = m1.user_id and m2.role = 'owner'
      where m1.tenant_id = p_tenant and m1.role = 'owner'),
    array[p_tenant]);
$$;
revoke all on function public.account_tenants(uuid) from public, anon, authenticated;
grant execute on function public.account_tenants(uuid) to service_role;

create or replace function public.create_tenant_for_user(p_user uuid, p_name text, p_type text, p_branch text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_first boolean;
begin
  perform pg_advisory_xact_lock(hashtext('create_tenant:' || p_user::text));
  v_first := not exists (select 1 from tenant_members where user_id = p_user);
  begin
    insert into tenants (name, academy_type, branch_name) values (p_name, p_type, nullif(trim(p_branch), '')) returning id into v_id;
  exception when unique_violation then
    -- 같은 요청을 두 번 보낸 경우: 이미 이 계정의 학원이면 그 학원을 돌려준다
    select t.id into v_id from tenants t join tenant_members m on m.tenant_id = t.id and m.user_id = p_user
     where t.name_key = lower(regexp_replace(p_name, '\s', '', 'g')) || '|' || lower(regexp_replace(coalesce(nullif(trim(p_branch), ''), ''), '\s', '', 'g'));
    if v_id is not null then return v_id; end if;
    raise;
  end;
  insert into tenant_members (tenant_id, user_id, role) values (v_id, p_user, 'owner');
  insert into tenant_brands (tenant_id) values (v_id);
  insert into tenant_content_settings (tenant_id) values (v_id);
  if v_first then
    insert into subscriptions (tenant_id, plan_id, status, expires_at)
      values (v_id, 'trial', 'trial',
              case when exists (select 1 from platform_admins where user_id = p_user) then null
                   else now() + make_interval(days => coalesce((select period_days from plans where id = 'trial'), 30)) end);
  end if;
  return v_id;
end;
$$;
revoke all on function public.create_tenant_for_user(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_tenant_for_user(uuid, text, text, text) to service_role;

-- 사용 차감: 계정의 모든 학원에 걸린 유효한 체험·생성권 한도를 더하고, 계정 전체 사용량과 비교한다.
create or replace function public.consume_usage(
  p_tenant uuid, p_user uuid, p_type text, p_qty integer, p_project uuid, p_key text
) returns table (allowed boolean, used integer, usage_limit integer)
language plpgsql security definer set search_path = public as $$
declare
  v_tenants uuid[] := account_tenants(p_tenant);
  v_limit integer;
  v_unlimited boolean;
  v_used integer;
  v_since timestamptz;
begin
  perform 1 from tenants where id = any(v_tenants) order by id for update;  -- 계정 단위 잠금(id 순서라 교착 없음)

  if exists (select 1 from usage_ledger where tenant_id = p_tenant and usage_type = p_type and idempotency_key = p_key) then
    select coalesce(sum(quantity), 0) into v_used from usage_ledger where tenant_id = any(v_tenants) and usage_type = p_type;
    return query select true, v_used, null::integer;
    return;
  end if;

  select sum(case when p_type = 'content' then pl.content_limit else pl.image_limit end),
         bool_or((case when p_type = 'content' then pl.content_limit else pl.image_limit end) is null),
         min(s.started_at)
    into v_limit, v_unlimited, v_since
  from subscriptions s join plans pl on pl.id = s.plan_id
  where s.tenant_id = any(v_tenants) and s.status in ('trial', 'active')
    and (s.expires_at is null or s.expires_at > now());

  if v_since is null then
    return query select false, 0, 0;
    return;
  end if;
  if v_unlimited then v_limit := null; end if;

  select coalesce(sum(quantity), 0) into v_used from usage_ledger
    where tenant_id = any(v_tenants) and usage_type = p_type and created_at >= v_since;

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
grant execute on function public.consume_usage(uuid, uuid, text, integer, uuid, text) to service_role;
