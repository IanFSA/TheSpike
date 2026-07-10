create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.session_people (
  id uuid primary key default gen_random_uuid(),
  room_name text not null default 'hotdrive',
  name text not null check (char_length(name) > 0 and char_length(name) <= 40),
  sort_order integer not null default 0,
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_name, name)
);

alter table public.session_people
  add column if not exists last_seen_at timestamptz;

create index if not exists session_people_room_sort_idx
  on public.session_people (room_name, active, sort_order, name);

drop trigger if exists session_people_set_updated_at on public.session_people;
create trigger session_people_set_updated_at
before update on public.session_people
for each row
execute function public.set_updated_at();

alter table public.session_people enable row level security;

drop policy if exists "Session people are readable by anon clients" on public.session_people;
create policy "Session people are readable by anon clients"
on public.session_people for select
to anon
using (true);

drop policy if exists "Session people can be inserted by anon clients" on public.session_people;
create policy "Session people can be inserted by anon clients"
on public.session_people for insert
to anon
with check (true);

drop policy if exists "Session people can be updated by anon clients" on public.session_people;
create policy "Session people can be updated by anon clients"
on public.session_people for update
to anon
using (true)
with check (true);

create table if not exists public.cue_presets (
  id uuid primary key default gen_random_uuid(),
  room_name text not null default 'hotdrive',
  sender text not null,
  label text not null check (char_length(label) > 0 and char_length(label) <= 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.cue_presets
  drop constraint if exists cue_presets_sender_check;

create index if not exists cue_presets_room_sender_idx
  on public.cue_presets (room_name, sender, sort_order);

drop trigger if exists cue_presets_set_updated_at on public.cue_presets;
create trigger cue_presets_set_updated_at
before update on public.cue_presets
for each row
execute function public.set_updated_at();

alter table public.cue_presets enable row level security;

drop policy if exists "Cue presets are readable by anon clients" on public.cue_presets;
create policy "Cue presets are readable by anon clients"
on public.cue_presets for select
to anon
using (true);

drop policy if exists "Cue presets can be inserted by anon clients" on public.cue_presets;
create policy "Cue presets can be inserted by anon clients"
on public.cue_presets for insert
to anon
with check (true);

drop policy if exists "Cue presets can be updated by anon clients" on public.cue_presets;
create policy "Cue presets can be updated by anon clients"
on public.cue_presets for update
to anon
using (true)
with check (true);

drop policy if exists "Cue presets can be deleted by anon clients" on public.cue_presets;
create policy "Cue presets can be deleted by anon clients"
on public.cue_presets for delete
to anon
using (true);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_name text not null default 'hotdrive',
  sender text not null,
  recipient text not null default 'Everyone',
  body text not null check (char_length(body) > 0 and char_length(body) <= 1000),
  seen_by text[] not null default '{}',
  acknowledged_by text[] not null default '{}',
  flashing_for text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists recipient text not null default 'Everyone',
  add column if not exists seen_by text[] not null default '{}',
  add column if not exists acknowledged_by text[] not null default '{}',
  add column if not exists flashing_for text[] not null default '{}';

alter table public.chat_messages
  drop constraint if exists chat_messages_sender_check,
  drop constraint if exists chat_messages_body_check,
  drop constraint if exists chat_messages_seen_by_check,
  drop constraint if exists chat_messages_acknowledged_by_check,
  drop constraint if exists chat_messages_flashing_for_check;

alter table public.chat_messages
  add constraint chat_messages_body_check
  check (char_length(body) > 0 and char_length(body) <= 1000);

create index if not exists chat_messages_room_created_idx
  on public.chat_messages (room_name, created_at desc);

alter table public.chat_messages enable row level security;

drop policy if exists "Chat messages are readable by anon clients" on public.chat_messages;
create policy "Chat messages are readable by anon clients"
on public.chat_messages for select
to anon
using (true);

drop policy if exists "Chat messages can be inserted by anon clients" on public.chat_messages;
create policy "Chat messages can be inserted by anon clients"
on public.chat_messages for insert
to anon
with check (true);

drop policy if exists "Chat messages can be updated by anon clients" on public.chat_messages;
create policy "Chat messages can be updated by anon clients"
on public.chat_messages for update
to anon
using (true)
with check (true);

drop policy if exists "Chat messages can be deleted by anon clients" on public.chat_messages;
create policy "Chat messages can be deleted by anon clients"
on public.chat_messages for delete
to anon
using (true);

create table if not exists public.attention_requests (
  id uuid primary key default gen_random_uuid(),
  room_name text not null default 'hotdrive',
  requester text not null,
  target text not null default 'Everyone',
  status text not null default 'active'
    check (status in ('active', 'acknowledged', 'cancelled', 'expired')),
  acknowledged_by text,
  cancelled_by text,
  expires_at timestamptz not null default (now() + interval '30 seconds'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attention_requests_room_status_idx
  on public.attention_requests (room_name, status, expires_at desc);

drop trigger if exists attention_requests_set_updated_at on public.attention_requests;
create trigger attention_requests_set_updated_at
before update on public.attention_requests
for each row
execute function public.set_updated_at();

alter table public.attention_requests enable row level security;

drop policy if exists "Attention requests are readable by anon clients" on public.attention_requests;
create policy "Attention requests are readable by anon clients"
on public.attention_requests for select
to anon
using (true);

drop policy if exists "Attention requests can be inserted by anon clients" on public.attention_requests;
create policy "Attention requests can be inserted by anon clients"
on public.attention_requests for insert
to anon
with check (true);

drop policy if exists "Attention requests can be updated by anon clients" on public.attention_requests;
create policy "Attention requests can be updated by anon clients"
on public.attention_requests for update
to anon
using (true)
with check (true);

create table if not exists public.score_contestants (
  id uuid primary key default gen_random_uuid(),
  room_name text not null default 'hotdrive',
  name text not null default '',
  correct_count integer not null default 0 check (correct_count >= 0),
  wrong_count integer not null default 0 check (wrong_count >= 0),
  sort_order integer not null check (sort_order between 1 and 4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (room_name, sort_order)
);

create index if not exists score_contestants_room_sort_idx
  on public.score_contestants (room_name, sort_order);

drop trigger if exists score_contestants_set_updated_at on public.score_contestants;
create trigger score_contestants_set_updated_at
before update on public.score_contestants
for each row
execute function public.set_updated_at();

alter table public.score_contestants enable row level security;

drop policy if exists "Score contestants are readable by anon clients" on public.score_contestants;
create policy "Score contestants are readable by anon clients"
on public.score_contestants for select
to anon
using (true);

drop policy if exists "Score contestants can be inserted by anon clients" on public.score_contestants;
create policy "Score contestants can be inserted by anon clients"
on public.score_contestants for insert
to anon
with check (true);

drop policy if exists "Score contestants can be updated by anon clients" on public.score_contestants;
create policy "Score contestants can be updated by anon clients"
on public.score_contestants for update
to anon
using (true)
with check (true);

insert into public.session_people (room_name, name, sort_order)
values
  ('hotdrive', 'Ian', 10),
  ('hotdrive', 'Spike', 20)
on conflict (room_name, name) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'session_people'
  ) then
    alter publication supabase_realtime add table public.session_people;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'cue_presets'
  ) then
    alter publication supabase_realtime add table public.cue_presets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'attention_requests'
  ) then
    alter publication supabase_realtime add table public.attention_requests;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'score_contestants'
  ) then
    alter publication supabase_realtime add table public.score_contestants;
  end if;
end $$;

create table if not exists public.traffic_reports (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  bulletin text not null,
  natasha_headline text not null,
  closer text not null default '',
  incident_ids text[] not null default '{}',
  source_checked_at timestamptz not null default now(),
  generated_by text not null default 'openai' check (generated_by in ('openai', 'fallback')),
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists traffic_reports_published_created_idx
  on public.traffic_reports (published, created_at desc);

alter table public.traffic_reports enable row level security;

drop policy if exists "Traffic reports are readable by anon clients" on public.traffic_reports;
create policy "Traffic reports are readable by anon clients"
on public.traffic_reports for select to anon using (true);

drop policy if exists "Traffic reports can be inserted by anon clients" on public.traffic_reports;
create policy "Traffic reports can be inserted by anon clients"
on public.traffic_reports for insert to anon with check (true);

create table if not exists public.traffic_listener_reports (
  id uuid primary key default gen_random_uuid(),
  road_name text not null,
  road_crossing text,
  location text,
  heading text,
  incident_type text not null,
  description text not null,
  listener_name text,
  verified boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists traffic_listener_reports_expires_idx
  on public.traffic_listener_reports (expires_at desc);

drop trigger if exists traffic_listener_reports_set_updated_at on public.traffic_listener_reports;
create trigger traffic_listener_reports_set_updated_at before update on public.traffic_listener_reports
for each row execute function public.set_updated_at();

alter table public.traffic_listener_reports enable row level security;

drop policy if exists "Traffic listener reports are readable by anon clients" on public.traffic_listener_reports;
create policy "Traffic listener reports are readable by anon clients"
on public.traffic_listener_reports for select to anon using (true);

drop policy if exists "Traffic listener reports can be inserted by anon clients" on public.traffic_listener_reports;
create policy "Traffic listener reports can be inserted by anon clients"
on public.traffic_listener_reports for insert to anon with check (true);

drop policy if exists "Traffic listener reports can be updated by anon clients" on public.traffic_listener_reports;
create policy "Traffic listener reports can be updated by anon clients"
on public.traffic_listener_reports for update to anon using (true) with check (true);
