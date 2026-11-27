-- 학원이 가르치는 학년, 학원 유형 복수 선택
alter table public.tenant_content_settings add column if not exists grade_levels text[] not null default '{}';
alter table public.tenant_content_settings add column if not exists academy_types text[] not null default '{}';
