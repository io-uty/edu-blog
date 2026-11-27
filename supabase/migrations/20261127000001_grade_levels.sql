-- 학원이 가르치는 학년(유아·초등·중등·고등·성인) 복수 선택
alter table public.tenant_content_settings add column if not exists grade_levels text[] not null default '{}';
