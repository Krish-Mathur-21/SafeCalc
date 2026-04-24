-- SafeCalc Supabase schema
-- Run this in Supabase SQL Editor for the project used by backend/.env

create table if not exists public.bank_users (
  phone text primary key,
  currency text not null default 'INR',
  opening_balance numeric not null default 0,
  profile_enc text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_transactions (
  id text primary key,
  phone text not null references public.bank_users(phone) on delete cascade,
  type text not null check (type in ('credit', 'debit')),
  amount numeric not null,
  category text not null default 'general',
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_bank_transactions_phone_created_at
  on public.bank_transactions(phone, created_at desc);

create index if not exists idx_bank_transactions_phone_type
  on public.bank_transactions(phone, type);

create or replace function public.touch_bank_users_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_bank_users_updated_at on public.bank_users;
create trigger trg_bank_users_updated_at
before update on public.bank_users
for each row
execute function public.touch_bank_users_updated_at();
