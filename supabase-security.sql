-- ============================================================
-- LUNA — SUPABASE SECURITY HARDENING
-- Run this entire file in your Supabase SQL Editor
-- Dashboard → SQL Editor → New Query → Paste → Run
-- ============================================================


-- ============================================================
-- STEP 1: BASE TABLES (skip if already created)
-- ============================================================

create extension if not exists "uuid-ossp";

-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  cycle_avg int default 28 check (cycle_avg between 18 and 60),
  period_length int default 5 check (period_length between 1 and 20),
  last_period_date date,
  updated_at timestamptz default now()
);

-- Daily Logs
do $$ begin
  create type flow_level_enum as enum ('spotting', 'light', 'medium', 'heavy');
exception when duplicate_object then null; end $$;

create table if not exists daily_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  flow_level flow_level_enum,
  pad_count int default 0 check (pad_count between 0 and 50),
  symptoms jsonb default '[]',
  mood text,
  notes text,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- Vaginal Health
create table if not exists vaginal_health (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  discharge_colour text,
  discharge_consistency text,
  is_optional bool default true,
  created_at timestamptz default now(),
  unique(user_id, date)
);

-- Fasting Ledger
do $$ begin
  create type fasting_type_enum as enum ('missed', 'compensated');
exception when duplicate_object then null; end $$;

create table if not exists fasting_ledger (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type fasting_type_enum not null,
  reason text,
  count int default 1 check (count between 1 and 10),
  created_at timestamptz default now()
);


-- ============================================================
-- STEP 2: ENABLE RLS ON ALL TABLES
-- ============================================================

alter table profiles      enable row level security;
alter table daily_logs    enable row level security;
alter table vaginal_health enable row level security;
alter table fasting_ledger enable row level security;


-- ============================================================
-- STEP 3: DROP ANY OLD BROAD POLICIES, REPLACE WITH GRANULAR
-- Split SELECT / INSERT / UPDATE / DELETE so each operation
-- is explicitly allowed — nothing slips through by accident.
-- ============================================================

-- ── profiles ──────────────────────────────────────────────────
drop policy if exists "Users own their profile" on profiles;

create policy "profiles: select own"
  on profiles for select
  using (auth.uid() = id);

create policy "profiles: insert own"
  on profiles for insert
  with check (auth.uid() = id);

create policy "profiles: update own"
  on profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "profiles: delete own"
  on profiles for delete
  using (auth.uid() = id);

-- ── daily_logs ────────────────────────────────────────────────
drop policy if exists "Users own their logs" on daily_logs;

create policy "daily_logs: select own"
  on daily_logs for select
  using (auth.uid() = user_id);

create policy "daily_logs: insert own"
  on daily_logs for insert
  with check (
    auth.uid() = user_id
    -- Prevent backdating more than 2 years or future-dating more than 1 day
    and date >= (current_date - interval '2 years')
    and date <= (current_date + interval '1 day')
  );

create policy "daily_logs: update own"
  on daily_logs for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and date >= (current_date - interval '2 years')
    and date <= (current_date + interval '1 day')
  );

create policy "daily_logs: delete own"
  on daily_logs for delete
  using (auth.uid() = user_id);

-- ── vaginal_health ────────────────────────────────────────────
drop policy if exists "Users own their health data" on vaginal_health;

create policy "vaginal_health: select own"
  on vaginal_health for select
  using (auth.uid() = user_id);

create policy "vaginal_health: insert own"
  on vaginal_health for insert
  with check (
    auth.uid() = user_id
    and date >= (current_date - interval '2 years')
    and date <= (current_date + interval '1 day')
  );

create policy "vaginal_health: update own"
  on vaginal_health for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "vaginal_health: delete own"
  on vaginal_health for delete
  using (auth.uid() = user_id);

-- ── fasting_ledger ────────────────────────────────────────────
drop policy if exists "Users own their fasting data" on fasting_ledger;

create policy "fasting_ledger: select own"
  on fasting_ledger for select
  using (auth.uid() = user_id);

create policy "fasting_ledger: insert own"
  on fasting_ledger for insert
  with check (
    auth.uid() = user_id
    and date >= (current_date - interval '5 years')
    and date <= current_date
  );

create policy "fasting_ledger: update own"
  on fasting_ledger for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "fasting_ledger: delete own"
  on fasting_ledger for delete
  using (auth.uid() = user_id);


-- ============================================================
-- STEP 4: FASTING BALANCE VIEW (with security barrier)
-- security_barrier prevents the planner leaking data via
-- side-channel optimisation tricks
-- ============================================================

drop view if exists fasting_balance;

create view fasting_balance with (security_barrier = true) as
  select
    user_id,
    sum(case when type = 'missed'      then count else 0 end)::int as total_missed,
    sum(case when type = 'compensated' then count else 0 end)::int as total_compensated,
    greatest(0,
      sum(case when type = 'missed'      then count else 0 end) -
      sum(case when type = 'compensated' then count else 0 end)
    )::int as balance
  from fasting_ledger
  where user_id = auth.uid()   -- filter at view level too
  group by user_id;

-- RLS on the view itself
alter view fasting_balance owner to authenticated;


-- ============================================================
-- STEP 5: CONSTRAIN TEXT FIELD LENGTHS
-- Stops someone stuffing huge payloads through the anon key.
-- Uses DO blocks so it's safe to re-run (won't error if the
-- constraint already exists).
-- ============================================================

-- profiles: drop the nonsensical old constraint if it exists, nothing to replace
do $$ begin
  alter table profiles drop constraint if exists profiles_notes_len;
exception when others then null; end $$;

-- daily_logs
do $$ begin
  alter table daily_logs add constraint daily_logs_mood_len
    check (char_length(mood) < 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table daily_logs add constraint daily_logs_notes_len
    check (char_length(notes) < 2000);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table daily_logs add constraint daily_logs_symptoms_size
    check (octet_length(symptoms::text) < 4096);
exception when duplicate_object then null; end $$;

-- vaginal_health
do $$ begin
  alter table vaginal_health add constraint vh_colour_len
    check (char_length(discharge_colour) < 50);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table vaginal_health add constraint vh_consistency_len
    check (char_length(discharge_consistency) < 50);
exception when duplicate_object then null; end $$;

-- fasting_ledger
do $$ begin
  alter table fasting_ledger add constraint fl_reason_len
    check (char_length(reason) < 500);
exception when duplicate_object then null; end $$;


-- ============================================================
-- STEP 6: RATE-LIMIT INSERTS PER USER PER HOUR
-- Uses a simple counter function. Prevents a compromised
-- account from flooding the database.
-- ============================================================

create or replace function check_insert_rate_limit(
  p_user_id uuid,
  p_table text,
  p_limit int default 100
) returns boolean
language plpgsql security definer as $$
declare
  recent_count int;
begin
  execute format(
    'select count(*) from %I where user_id = $1 and created_at > now() - interval ''1 hour''',
    p_table
  ) into recent_count using p_user_id;
  return recent_count < p_limit;
end;
$$;

-- Tighten daily_logs insert to call rate limiter
drop policy if exists "daily_logs: insert own" on daily_logs;
create policy "daily_logs: insert own"
  on daily_logs for insert
  with check (
    auth.uid() = user_id
    and date >= (current_date - interval '2 years')
    and date <= (current_date + interval '1 day')
    and check_insert_rate_limit(auth.uid(), 'daily_logs', 50)
  );

drop policy if exists "fasting_ledger: insert own" on fasting_ledger;
create policy "fasting_ledger: insert own"
  on fasting_ledger for insert
  with check (
    auth.uid() = user_id
    and date >= (current_date - interval '5 years')
    and date <= current_date
    and check_insert_rate_limit(auth.uid(), 'fasting_ledger', 30)
  );


-- ============================================================
-- STEP 7: UPDATED_AT TRIGGER ON PROFILES
-- ============================================================

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();


-- ============================================================
-- STEP 8: VERIFY EVERYTHING
-- Run this SELECT to confirm all tables have RLS enabled
-- ============================================================

select
  schemaname,
  tablename,
  rowsecurity as rls_enabled
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles','daily_logs','vaginal_health','fasting_ledger')
order by tablename;

-- Should show rls_enabled = true for all 4 rows
