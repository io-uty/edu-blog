-- 계좌이체(개인 계좌 직접 입금) 결제 지원
-- 주문에 입금자명·만료·확인 주체를 붙이고, 들어온 입금 알림을 기록한다(중복 처리 방지·추적용).

alter table public.payments
  add column if not exists depositor_name text,
  add column if not exists expires_at timestamptz,
  add column if not exists confirmed_by text,     -- 'auto:<거래번호>' | 'admin:<이메일>'
  add column if not exists deposit_tx_id text;    -- 이 주문을 확인한 입금 거래번호
create unique index if not exists payments_deposit_tx_unique on public.payments (deposit_tx_id) where deposit_tx_id is not null;

create table if not exists public.deposit_events (
  id             uuid primary key default gen_random_uuid(),
  tx_id          text not null unique,            -- 같은 입금 알림이 두 번 와도 한 번만 처리
  amount         integer not null check (amount > 0),
  depositor_name text not null,
  occurred_at    timestamptz,
  status         text not null check (status in ('matched', 'unmatched', 'ambiguous', 'resolved')),
  order_id       text,
  source         text not null default 'webhook',
  created_at     timestamptz not null default now()
);
create index if not exists deposit_events_status_idx on public.deposit_events (status, created_at desc);
alter table public.deposit_events enable row level security;
revoke all on public.deposit_events from anon, authenticated;
grant all on public.deposit_events to service_role;
