-- 호출 횟수 제한: 키(예: login:ip:1.2.3.4, refine:user:<uuid>)마다 정해진 시간 창 안의 호출 수를 센다.
create table if not exists public.rate_limits (
  key          text primary key,
  window_start timestamptz not null default now(),
  hits         integer not null default 0
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

-- 한 번 호출할 때마다 1을 더하고, 시간 창 안에서 p_max 이하면 true
create or replace function public.hit_rate_limit(p_key text, p_window integer, p_max integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hits integer;
begin
  insert into rate_limits as r (key, window_start, hits) values (p_key, now(), 1)
  on conflict (key) do update set
    hits = case when r.window_start < now() - make_interval(secs => p_window) then 1 else r.hits + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window) then now() else r.window_start end
  returning hits into v_hits;
  -- 가끔 오래된 기록 정리
  if random() < 0.01 then delete from rate_limits where window_start < now() - interval '2 days'; end if;
  return v_hits <= p_max;
end;
$$;
revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;
