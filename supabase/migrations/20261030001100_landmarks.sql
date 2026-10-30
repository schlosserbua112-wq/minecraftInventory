-- Landmarks: benannte, farbige Punkte auf der Karte, für alle Mitglieder sichtbar.
-- Anlegen darf jedes Mitglied; ändern und löschen nur, wer es angelegt hat, oder ein Admin.

create table if not exists public.landmarks (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 60),
  color text not null default '#e9c46a' check (color ~ '^#[0-9a-f]{6}$'),
  dimension text not null default 'minecraft:overworld',
  x int not null,
  z int not null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.landmarks enable row level security;

drop policy if exists "Freunde lesen" on public.landmarks;
create policy "Freunde lesen" on public.landmarks for select to authenticated using (private.is_friend());
drop policy if exists "Freunde legen an" on public.landmarks;
create policy "Freunde legen an" on public.landmarks for insert to authenticated
  with check (private.is_friend() and created_by = auth.uid());
drop policy if exists "Ersteller oder Admin ändern" on public.landmarks;
create policy "Ersteller oder Admin ändern" on public.landmarks for update to authenticated
  using (private.is_friend() and (created_by = auth.uid() or private.is_admin()))
  with check (private.is_friend());
drop policy if exists "Ersteller oder Admin löschen" on public.landmarks;
create policy "Ersteller oder Admin löschen" on public.landmarks for delete to authenticated
  using (private.is_friend() and (created_by = auth.uid() or private.is_admin()));

grant select, insert, update, delete on public.landmarks to authenticated;

-- Live-Updates: neue Landmarks und Zonen erscheinen sofort bei allen
do $$ begin
  alter publication supabase_realtime add table public.landmarks;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter publication supabase_realtime add table public.zones;
exception when duplicate_object then null;
end $$;

-- Scan-Zonen anlegen, ändern und löschen dürfen nur noch Admins (lesen weiterhin alle Mitglieder).
drop policy if exists "Freunde verwalten Zonen" on public.zones;
drop policy if exists "Admins verwalten Zonen" on public.zones;
create policy "Admins verwalten Zonen" on public.zones for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
