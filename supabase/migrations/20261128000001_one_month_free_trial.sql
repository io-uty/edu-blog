-- 한 달 무료체험: 체험 요금제를 30일짜리로 바꾸고, 신규 학원은 만들 때부터 30일 뒤 만료로 시작한다.
-- 운영 계정(platform_admins)은 제외한다: 만료 없이 그대로 둔다.
update public.plans
   set name = '한 달 무료체험', period_days = 30,
       features = features || '{"summary": "가입 후 한 달 무료체험"}'
 where id = 'trial';

create or replace function public.create_tenant_for_user(p_user uuid, p_name text, p_type text, p_branch text default '')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext('create_tenant:' || p_user::text));
  select tenant_id into v_id from tenant_members where user_id = p_user order by created_at limit 1;
  if v_id is not null then return v_id; end if;
  insert into tenants (name, academy_type, branch_name) values (p_name, p_type, nullif(trim(p_branch), '')) returning id into v_id;
  insert into tenant_members (tenant_id, user_id, role) values (v_id, p_user, 'owner');
  insert into tenant_brands (tenant_id) values (v_id);
  insert into tenant_content_settings (tenant_id) values (v_id);
  insert into subscriptions (tenant_id, plan_id, status, expires_at)
    values (v_id, 'trial', 'trial',
            case when exists (select 1 from platform_admins where user_id = p_user) then null
                 else now() + make_interval(days => coalesce((select period_days from plans where id = 'trial'), 30)) end);
  return v_id;
end;
$$;
revoke all on function public.create_tenant_for_user(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.create_tenant_for_user(uuid, text, text, text) to service_role;

-- 이미 있는 계정: 만료일이 없는 체험 구독에 오늘부터 30일을 준다(운영 계정 소속 학원 제외).
update public.subscriptions s
   set expires_at = now() + interval '30 days'
 where s.status = 'trial' and s.plan_id = 'trial' and s.expires_at is null
   and not exists (select 1 from tenant_members m join platform_admins a on a.user_id = m.user_id where m.tenant_id = s.tenant_id);
