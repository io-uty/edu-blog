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
grant execute on function public.consume_usage(uuid, uuid, text, integer, uuid, text) to service_role;
