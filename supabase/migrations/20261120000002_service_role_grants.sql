-- 서버(service_role)만 사용량 차감·테넌트 생성 함수를 실행할 수 있게 한다.
grant execute on function public.consume_usage(uuid, uuid, text, integer, uuid, text) to service_role;
grant execute on function public.create_tenant_for_user(uuid, text, text) to service_role;
