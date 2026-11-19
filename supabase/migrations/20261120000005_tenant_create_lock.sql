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
