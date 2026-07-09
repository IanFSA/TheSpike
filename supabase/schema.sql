create extension if not exists pgcrypto;

create table if not exists public.cue_presets (
  id uuid primary key default gen_random_uuid(),
  room_name text not null default 'hotdrive',
  sender text not null check (sender in ('Ian', 'Spike')),
  label text not null check (char_length(label) > 0 and char_length(label) <= 80),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cue_presets_room_sender_idx
  on public.cue_presets (room_name, sender, sort_order);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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
  sender text not null check (sender in ('Ian', 'Spike')),
  body text not null check (char_length(body) > 0 and char_length(body) <= 1000),
  seen_by text[] not null default '{}',
  acknowledged_by text[] not null default '{}',
  flashing_for text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.chat_messages
  add column if not exists seen_by text[] not null default '{}',
  add column if not exists acknowledged_by text[] not null default '{}',
  add column if not exists flashing_for text[] not null default '{}';

alter table public.chat_messages
  drop constraint if exists chat_messages_body_check;

alter table public.chat_messages
  add constraint chat_messages_body_check
  check (char_length(body) > 0 and char_length(body) <= 1000);

alter table public.chat_messages
  drop constraint if exists chat_messages_seen_by_check,
  drop constraint if exists chat_messages_acknowledged_by_check,
  drop constraint if exists chat_messages_flashing_for_check;

alter table public.chat_messages
  add constraint chat_messages_seen_by_check
  check (seen_by <@ array['Ian', 'Spike']::text[]),
  add constraint chat_messages_acknowledged_by_check
  check (acknowledged_by <@ array['Ian', 'Spike']::text[]),
  add constraint chat_messages_flashing_for_check
  check (flashing_for <@ array['Ian', 'Spike']::text[]);

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

do $$
begin
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
      and tablename = 'score_contestants'
  ) then
    alter publication supabase_realtime add table public.score_contestants;
  end if;
end $$;
