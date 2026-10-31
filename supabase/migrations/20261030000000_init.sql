-- Minecraft-Ressourcen-Tracker: Grundschema
-- Schreiben darf nur der Pi (service_role, umgeht RLS).
-- Lesen dürfen angemeldete Freunde, deren E-Mail in public.friends steht.

create table public.friends (
  email text primary key,
  added_at timestamptz not null default now()
);

create or replace function public.is_friend() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.friends where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

create table public.players (
  uuid uuid primary key,
  name text not null,
  online boolean not null default false,
  last_seen timestamptz,
  updated_at timestamptz not null default now()
);

create type public.owner_type as enum ('player', 'common', 'project', 'unassigned');
create type public.source_kind as enum ('inventory', 'enderchest', 'container');

create table public.containers (
  id text primary key,                 -- "<dimension>:<x>:<y>:<z>"
  dimension text not null,
  x int not null,
  y int not null,
  z int not null,
  kind text not null,                  -- chest, trapped_chest, barrel, shulker_box
  custom_name text,
  owner_type public.owner_type,
  owner_key text,
  owner_label text,
  region text not null,                -- r.X.Z.mca
  last_seen_at timestamptz not null default now()
);
create index on public.containers (owner_type, owner_key);

-- Aktueller Stand: eine Zeile je Quelle und Item. Der Sammler ersetzt alle Zeilen einer Quelle auf einmal.
create table public.stock_items (
  source_kind public.source_kind not null,
  source_id text not null,             -- Spieler-UUID oder Container-ID
  owner_type public.owner_type not null,
  owner_key text not null,
  owner_label text not null,
  item_id text not null,
  count int not null check (count > 0),
  updated_at timestamptz not null default now(),
  primary key (source_kind, source_id, item_id)
);
create index on public.stock_items (item_id);
create index on public.stock_items (owner_type, owner_key);

-- Verlauf: stündliche Summen je Besitzer und Item (für Diagramme und Wochenvergleich).
create table public.stock_history (
  taken_at timestamptz not null,
  owner_type public.owner_type not null,
  owner_key text not null,
  item_id text not null,
  count int not null,
  primary key (taken_at, owner_type, owner_key, item_id)
);
create index on public.stock_history (item_id, taken_at);

create table public.projects (
  key text primary key,                -- klein geschrieben, z. B. "burg"
  label text not null,
  created_at timestamptz not null default now()
);

create table public.project_goals (
  project_key text not null references public.projects (key) on delete cascade,
  item_id text not null,
  target int not null check (target > 0),
  primary key (project_key, item_id)
);

create table public.zones (
  id bigint generated always as identity primary key,
  name text not null,
  dimension text not null default 'minecraft:overworld',
  center_x int not null,
  center_z int not null,
  radius int not null check (radius > 0),
  is_main boolean not null default false,
  created_at timestamptz not null default now()
);

-- "Jetzt nach neuen Kisten suchen": die Website legt eine Anfrage an, der Pi arbeitet sie ab.
create table public.scan_requests (
  id bigint generated always as identity primary key,
  requested_at timestamptz not null default now(),
  requested_by text default (auth.jwt() ->> 'email'),
  started_at timestamptz,
  finished_at timestamptz,
  result text
);

-- Lebenszeichen des Sammlers, genau eine Zeile.
create table public.collector_status (
  id int primary key default 1 check (id = 1),
  heartbeat_at timestamptz not null default now(),
  last_live_poll_at timestamptz,
  last_zone_scan_at timestamptz,
  last_full_scan_at timestamptz,
  version text,
  mode text,                           -- "mock" oder "live"
  message text
);

-- Summen je Besitzer und Item
create view public.owner_totals with (security_invoker = true) as
  select owner_type, owner_key, min(owner_label) as owner_label, item_id, sum(count)::int as count
  from public.stock_items
  group by owner_type, owner_key, item_id;

-- Summen je Item über alles
create view public.item_totals with (security_invoker = true) as
  select item_id, sum(count)::int as count, count(distinct source_id)::int as places
  from public.stock_items
  group by item_id;

-- Fundorte eines Items inkl. Koordinaten
create view public.item_locations with (security_invoker = true) as
  select s.item_id, s.count, s.source_kind, s.source_id, s.owner_type, s.owner_key, s.owner_label,
         c.dimension, c.x, c.y, c.z, c.kind, c.custom_name
  from public.stock_items s
  left join public.containers c on s.source_kind = 'container' and c.id = s.source_id;

-- Projektfortschritt
create view public.project_progress with (security_invoker = true) as
  select g.project_key, p.label, g.item_id, g.target, coalesce(t.count, 0) as have
  from public.project_goals g
  join public.projects p on p.key = g.project_key
  left join public.owner_totals t on t.owner_type = 'project' and t.owner_key = g.project_key and t.item_id = g.item_id;

-- RLS
alter table public.friends enable row level security;
alter table public.players enable row level security;
alter table public.containers enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_history enable row level security;
alter table public.projects enable row level security;
alter table public.project_goals enable row level security;
alter table public.zones enable row level security;
alter table public.scan_requests enable row level security;
alter table public.collector_status enable row level security;

create policy "Freunde lesen" on public.players for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.containers for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.stock_items for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.stock_history for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.projects for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.project_goals for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.zones for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.scan_requests for select to authenticated using (public.is_friend());
create policy "Freunde lesen" on public.collector_status for select to authenticated using (public.is_friend());

-- Verwaltung über die Website: Freunde dürfen Zonen, Projektziele und Suchanfragen anlegen.
create policy "Freunde verwalten Zonen" on public.zones for all to authenticated using (public.is_friend()) with check (public.is_friend());
create policy "Freunde verwalten Projekte" on public.projects for all to authenticated using (public.is_friend()) with check (public.is_friend());
create policy "Freunde verwalten Ziele" on public.project_goals for all to authenticated using (public.is_friend()) with check (public.is_friend());
create policy "Freunde starten Suche" on public.scan_requests for insert to authenticated with check (public.is_friend());

-- Live-Updates für die Website
alter publication supabase_realtime add table public.stock_items, public.players, public.collector_status, public.scan_requests;

-- Projektplanung: Kanban-Aufgaben je Projekt
create type public.task_status as enum ('todo', 'in_progress', 'done', 'cancelled');

create table public.project_tasks (
  id bigint generated always as identity primary key,
  project_key text not null references public.projects (key) on delete cascade,
  title text not null,
  description text,
  assignee text,                       -- Spielername
  status public.task_status not null default 'todo',
  position int not null default 0,     -- Reihenfolge innerhalb einer Spalte
  created_by text default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.project_tasks (project_key, status, position);

-- Hochgeladene Materiallisten (Originaltext bleibt erhalten, Ziele landen in project_goals)
create table public.material_lists (
  id bigint generated always as identity primary key,
  project_key text not null references public.projects (key) on delete cascade,
  title text,
  raw_text text not null,
  uploaded_by text default (auth.jwt() ->> 'email'),
  uploaded_at timestamptz not null default now()
);

-- Item-Namen, die der Parser nicht sicher zuordnen konnte, mit manueller Zuordnung
create table public.item_aliases (
  name text primary key,               -- klein geschrieben, z. B. "glas"
  item_id text not null
);

alter table public.project_tasks enable row level security;
alter table public.material_lists enable row level security;
alter table public.item_aliases enable row level security;

create policy "Freunde verwalten Aufgaben" on public.project_tasks for all to authenticated using (public.is_friend()) with check (public.is_friend());
create policy "Freunde verwalten Listen" on public.material_lists for all to authenticated using (public.is_friend()) with check (public.is_friend());
create policy "Freunde verwalten Aliase" on public.item_aliases for all to authenticated using (public.is_friend()) with check (public.is_friend());

-- Abgleich benötigt vs. vorhanden (Projektkisten zuerst, dann Allgemeingut)
create view public.project_balance with (security_invoker = true) as
  select g.project_key, g.item_id, g.target as needed,
         coalesce(p.count, 0) as in_project,
         coalesce(c.count, 0) as in_common,
         greatest(g.target - coalesce(p.count, 0) - coalesce(c.count, 0), 0) as missing
  from public.project_goals g
  left join public.owner_totals p on p.owner_type = 'project' and p.owner_key = g.project_key and p.item_id = g.item_id
  left join public.owner_totals c on c.owner_type = 'common' and c.item_id = g.item_id;

alter publication supabase_realtime add table public.project_tasks;
