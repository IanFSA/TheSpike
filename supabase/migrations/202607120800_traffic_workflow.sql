-- Additive migration: preserves every existing report and listener record.
alter table public.traffic_reports alter column published set default false;
alter table public.traffic_reports add column if not exists version bigint;
alter table public.traffic_reports add column if not exists status text not null default 'draft';
alter table public.traffic_reports add column if not exists generation_kind text not null default 'manual';
alter table public.traffic_reports add column if not exists manually_edited boolean not null default false;
alter table public.traffic_reports add column if not exists published_at timestamptz;
alter table public.traffic_reports add column if not exists published_by text;
alter table public.traffic_reports add column if not exists model text;
alter table public.traffic_reports add column if not exists input_tokens integer not null default 0;
alter table public.traffic_reports add column if not exists output_tokens integer not null default 0;
alter table public.traffic_reports add column if not exists total_tokens integer not null default 0;
alter table public.traffic_reports add column if not exists generation_ms integer not null default 0;
alter table public.traffic_reports add column if not exists error_message text;
alter table public.traffic_reports add column if not exists active_published boolean not null default false;
alter table public.traffic_reports add column if not exists superseded_at timestamptz;
update public.traffic_reports set version = floor(extract(epoch from created_at)*1000)::bigint where version is null;
update public.traffic_reports set status='published', published_at=coalesce(published_at,created_at) where published=true;
with latest as (select id from public.traffic_reports where published=true order by created_at desc limit 1)
update public.traffic_reports set active_published=(id in (select id from latest));
update public.traffic_reports set published=false,status='superseded',superseded_at=coalesce(superseded_at,now()) where status='published' and active_published=false;
alter table public.traffic_reports alter column version set not null;
create unique index if not exists traffic_reports_version_idx on public.traffic_reports(version);
create unique index if not exists traffic_one_active_published_idx on public.traffic_reports(active_published) where active_published=true;

create table if not exists public.traffic_snapshots(id uuid primary key default gen_random_uuid(), checked_at timestamptz not null default now(), incident_count integer not null, meaningful_changes integer not null default 0, incidents jsonb not null default '[]', content_hash text, error_message text);
alter table public.traffic_snapshots add column if not exists content_hash text;
create index if not exists traffic_snapshots_checked_idx on public.traffic_snapshots(checked_at desc);
create unique index if not exists traffic_snapshots_content_hash_idx on public.traffic_snapshots(content_hash) where content_hash is not null;
alter table public.traffic_snapshots enable row level security;

create table if not exists public.traffic_read_acknowledgements(id uuid primary key default gen_random_uuid(), report_id uuid not null references public.traffic_reports(id), read_at timestamptz not null default now(), read_by text, undone_at timestamptz);
create index if not exists traffic_read_report_idx on public.traffic_read_acknowledgements(report_id,read_at desc);
alter table public.traffic_read_acknowledgements enable row level security;

create table if not exists public.traffic_workflow_state(id boolean primary key default true check(id), locked_until timestamptz, lock_token uuid, last_successful_check_at timestamptz, last_check_error text, last_check_error_at timestamptz, last_generation_error text, last_generation_error_at timestamptz, pending_generation boolean not null default false, pending_change_count integer not null default 0, pending_since timestamptz, pending_snapshot_id uuid references public.traffic_snapshots(id));
alter table public.traffic_workflow_state add column if not exists last_check_error_at timestamptz;
alter table public.traffic_workflow_state add column if not exists last_generation_error_at timestamptz;
alter table public.traffic_workflow_state add column if not exists pending_generation boolean not null default false;
alter table public.traffic_workflow_state add column if not exists pending_change_count integer not null default 0;
alter table public.traffic_workflow_state add column if not exists pending_since timestamptz;
alter table public.traffic_workflow_state add column if not exists pending_snapshot_id uuid references public.traffic_snapshots(id);
insert into public.traffic_workflow_state(id) values(true) on conflict(id) do nothing;
alter table public.traffic_workflow_state enable row level security;

drop policy if exists "Traffic reports are readable by anon clients" on public.traffic_reports;
drop policy if exists "Published traffic reports are readable by anon clients" on public.traffic_reports;
create policy "Published traffic reports are readable by anon clients" on public.traffic_reports for select to anon using(active_published=true);
drop policy if exists "Traffic reports can be inserted by anon clients" on public.traffic_reports;
drop policy if exists "Traffic listener reports are readable by anon clients" on public.traffic_listener_reports;
drop policy if exists "Traffic listener reports can be inserted by anon clients" on public.traffic_listener_reports;
drop policy if exists "Traffic listener reports can be updated by anon clients" on public.traffic_listener_reports;

create or replace function public.acquire_traffic_workflow_lock(p_token uuid, p_seconds integer default 120)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  update public.traffic_workflow_state set lock_token=p_token,locked_until=now()+make_interval(secs=>greatest(30,least(p_seconds,300)))
  where id=true and (locked_until is null or locked_until<now());
  return found;
end;$$;

create or replace function public.release_traffic_workflow_lock(p_token uuid)
returns void language sql security definer set search_path=public as $$
update public.traffic_workflow_state set lock_token=null,locked_until=null where id=true and lock_token=p_token;$$;

create or replace function public.publish_traffic_report(p_report_id uuid,p_actor text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.traffic_reports where id=p_report_id and status='draft') then raise exception 'Draft changed or is no longer publishable'; end if;
  if exists(select 1 from public.traffic_reports where id=p_report_id and generation_kind='test') then raise exception 'Test reports must be adopted before publication'; end if;
  update public.traffic_reports set active_published=false,published=false,status='superseded',superseded_at=now() where active_published=true and id<>p_report_id;
  update public.traffic_reports set published=true,status='published',active_published=true,published_at=now(),published_by=p_actor where id=p_report_id and status='draft';
end;$$;

revoke all on function public.acquire_traffic_workflow_lock(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_traffic_workflow_lock(uuid) from public, anon, authenticated;
revoke all on function public.publish_traffic_report(uuid, text) from public, anon, authenticated;
grant execute on function public.acquire_traffic_workflow_lock(uuid, integer) to service_role;
grant execute on function public.release_traffic_workflow_lock(uuid) to service_role;
grant execute on function public.publish_traffic_report(uuid, text) to service_role;
