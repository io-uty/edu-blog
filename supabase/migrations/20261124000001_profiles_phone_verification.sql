-- 가입 정보(이름·전화·아이디)와 휴대폰 인증번호. 전화번호·아이디는 중복될 수 없다(DB 제약이 최종 보증).
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text not null,
  phone      text not null constraint profiles_phone_key unique,    -- 숫자만(01012345678)
  email      text not null,
  login_id   text not null constraint profiles_login_id_key unique, -- 소문자로 저장
  created_at timestamptz not null default now()
);

create table if not exists public.phone_verifications (
  phone       text primary key,
  code_hash   text not null,
  expires_at  timestamptz not null,
  sent_at     timestamptz not null default now(),
  attempts    int not null default 0,
  verified_at timestamptz
);

alter table public.profiles enable row level security;
alter table public.phone_verifications enable row level security;
revoke all on public.profiles, public.phone_verifications from anon, authenticated;
grant all on public.profiles, public.phone_verifications to service_role;

-- 인증번호 확인: 시도 횟수 증가와 비교를 한 번에(동시에 여러 번 찍어 보는 것을 막는다). 5회까지, 만료 전까지만.
create or replace function public.verify_phone(p_phone text, p_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_hash text;
begin
  update phone_verifications set attempts = attempts + 1
   where phone = p_phone and verified_at is null and attempts < 5 and expires_at > now()
   returning code_hash into v_hash;
  if v_hash is null or v_hash <> p_hash then return false; end if;
  update phone_verifications set verified_at = now() where phone = p_phone;
  return true;
end;
$$;
revoke all on function public.verify_phone(text, text) from public, anon, authenticated;
grant execute on function public.verify_phone(text, text) to service_role;
