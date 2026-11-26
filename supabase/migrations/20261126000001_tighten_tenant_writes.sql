-- 1) tenants: 로그인 사용자는 학원 정보 컬럼만 고칠 수 있다(구독 상태 등은 서버·DB 함수만).
revoke update on public.tenants from authenticated;
grant update (name, academy_type, academy_type_custom, branch_name, onboarded_at, onboarding_step) on public.tenants to authenticated;

-- 2) 학원 설정·출처: 쓰기는 학원 관리자(owner/admin)만. 편집자는 읽기만(예약 링크 등을 바꿔 관리자를 노리는 것 방지).
do $$
declare t text;
begin
  foreach t in array array['tenant_brands', 'tenant_content_settings', 'tenant_sources'] loop
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('create policy %1$s_insert on public.%1$s for insert with check (public.is_tenant_admin(tenant_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update using (public.is_tenant_admin(tenant_id)) with check (public.is_tenant_admin(tenant_id))', t);
  end loop;
end $$;
