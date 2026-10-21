-- Run once in Supabase: SQL Editor > New query > paste > Run
-- !! Replace YOUR_EMAIL below with the email you will log in with !!
create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  added date default ((now() at time zone 'America/New_York')::date),
  name text not null,
  stage text default 'New Lead',
  email text, phone text, age int, assets numeric,
  intent text, score int, source text,
  link text unique,
  consent text, next_followup date,
  signal text, draft text, notes text
);
create table if not exists agent_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz default now(),
  found int, added int, note text
);
alter table leads enable row level security;
alter table agent_runs enable row level security;
create policy "owner all leads" on leads for all to authenticated
  using ((auth.jwt()->>'email') = 'YOUR_EMAIL') with check ((auth.jwt()->>'email') = 'YOUR_EMAIL');
create policy "owner read runs" on agent_runs for select to authenticated
  using ((auth.jwt()->>'email') = 'YOUR_EMAIL');

-- Added for Seamless integration (stores pagination cursors between daily runs)
create table if not exists agent_state (key text primary key, value text);
alter table agent_state enable row level security;   -- no policies: only the service key can read/write
