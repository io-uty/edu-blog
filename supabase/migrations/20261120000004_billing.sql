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
