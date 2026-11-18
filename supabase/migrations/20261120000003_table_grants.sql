-- 테이블 권한(행 접근은 RLS 가 결정). 최근 Supabase 는 SQL 로 만든 테이블에 권한을 자동 부여하지 않으므로 명시한다.
-- 클라이언트(authenticated)는 필요한 동작만, 사용량·구독·결제는 조회만 가능하다.
grant usage on schema public to anon, authenticated, service_role;

grant select, update                 on public.tenants                 to authenticated;
grant select                         on public.tenant_members          to authenticated;
grant select                         on public.platform_admins         to authenticated;
grant select, insert, update, delete on public.tenant_brands           to authenticated;
grant select, insert, update, delete on public.tenant_content_settings to authenticated;
grant select, insert, update, delete on public.tenant_sources          to authenticated;
grant select, insert, update, delete on public.projects                to authenticated;
grant select, insert, update, delete on public.project_images          to authenticated;
grant select                         on public.plans                   to anon, authenticated;
grant select                         on public.subscriptions           to authenticated;
grant select                         on public.payments                to authenticated;
grant select                         on public.usage_ledger            to authenticated;
grant select, insert                 on public.product_events          to authenticated;
grant select, insert, update, delete on public.user_consents           to authenticated;

-- 서버(service_role)는 RLS 를 우회하는 관리 작업용
grant all on all tables in schema public to service_role;
grant execute on function public.is_member(uuid), public.is_tenant_admin(uuid), public.is_platform_admin() to authenticated, service_role;

