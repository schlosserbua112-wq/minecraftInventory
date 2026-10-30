-- Projekte: Name, benötigte Items mit Menge und die Kisten, deren Inhalt zum Projekt zählt.
-- Eine Quelle ist entweder eine einzelne Kiste (container_id) oder ein Spieler (owner_key, Kontoname
-- klein geschrieben), dann zählen alle seine Kisten. Projekte sind für alle Mitglieder sichtbar
-- und von allen bearbeitbar; löschen darf nur, wer es angelegt hat, oder ein Admin.

create table if not exists public.build_projects (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 60),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.build_project_items (
  project_id bigint not null references public.build_projects (id) on delete cascade,
  item_id text not null,
  quantity int not null check (quantity between 1 and 10000000),
  added_at timestamptz not null default now(),
  primary key (project_id, item_id)
);

-- Kisten-IDs hängen an der Position ("<dimension>:<x>:<y>:<z>") und überstehen neue Scans,
-- deshalb ohne Fremdschlüssel auf containers.
create table if not exists public.build_project_sources (
  id bigint generated always as identity primary key,
  project_id bigint not null references public.build_projects (id) on delete cascade,
  container_id text,
  owner_key text,
  check ((container_id is null) <> (owner_key is null))
);
create unique index if not exists build_project_sources_container on public.build_project_sources (project_id, container_id) where container_id is not null;
create unique index if not exists build_project_sources_owner on public.build_project_sources (project_id, owner_key) where owner_key is not null;

alter table public.build_projects enable row level security;
alter table public.build_project_items enable row level security;
alter table public.build_project_sources enable row level security;

drop policy if exists "Freunde lesen" on public.build_projects;
create policy "Freunde lesen" on public.build_projects for select to authenticated using (private.is_friend());
drop policy if exists "Freunde legen an" on public.build_projects;
create policy "Freunde legen an" on public.build_projects for insert to authenticated
  with check (private.is_friend() and created_by = auth.uid());
drop policy if exists "Freunde benennen um" on public.build_projects;
create policy "Freunde benennen um" on public.build_projects for update to authenticated
  using (private.is_friend()) with check (private.is_friend());
drop policy if exists "Ersteller oder Admin löschen" on public.build_projects;
create policy "Ersteller oder Admin löschen" on public.build_projects for delete to authenticated
  using (private.is_friend() and (created_by = auth.uid() or private.is_admin()));

drop policy if exists "Freunde verwalten" on public.build_project_items;
create policy "Freunde verwalten" on public.build_project_items for all to authenticated
  using (private.is_friend()) with check (private.is_friend());
drop policy if exists "Freunde verwalten" on public.build_project_sources;
create policy "Freunde verwalten" on public.build_project_sources for all to authenticated
  using (private.is_friend()) with check (private.is_friend());

grant select, insert, update, delete on public.build_projects, public.build_project_items, public.build_project_sources to authenticated;

-- Live-Updates: Änderungen anderer erscheinen sofort
do $$ begin
  alter publication supabase_realtime add table public.build_projects;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.build_project_items;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.build_project_sources;
exception when duplicate_object then null;
end $$;
