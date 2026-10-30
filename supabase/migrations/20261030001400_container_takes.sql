-- Entnahmen aus fremden Kisten: Der Sammler vergleicht jede Abfrage mit der vorherigen. Fehlt in einer
-- Spielerkiste etwas und hat ein anderer Spieler in der Nähe genau dieses Item dazubekommen, landet das hier.
-- Vanilla protokolliert keine Kistenzugriffe, deshalb ist das eine Schätzung mit Sicherheitsstufe.
-- Sehen darf der Besitzer der Kiste und jeder Admin; beide können Einträge löschen.

create table if not exists public.container_takes (
  id bigint generated always as identity primary key,
  taken_at timestamptz not null default now(),
  container_id text not null,          -- wie containers.id
  owner_key text not null,             -- Kontoname klein, Besitzer der Kiste
  owner_label text not null,
  item_id text not null,
  count int not null check (count > 0),
  suspects text[] not null default '{}', -- Minecraft-Namen, wahrscheinlichster zuerst
  confidence text not null check (confidence in ('sicher', 'wahrscheinlich', 'möglich')),
  distance int                         -- Blöcke zwischen Verdächtigem und Kiste
);
create index if not exists container_takes_owner on public.container_takes (owner_key, taken_at desc);
create index if not exists container_takes_time on public.container_takes (taken_at desc);

-- Ist der angemeldete Benutzer der Besitzer (Kontoname klein)?
create or replace function private.is_owner(p_owner_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and lower(username) = p_owner_key);
$$;
revoke execute on function private.is_owner(text) from public, anon;
grant execute on function private.is_owner(text) to authenticated;

alter table public.container_takes enable row level security;

drop policy if exists "Besitzer oder Admin lesen" on public.container_takes;
create policy "Besitzer oder Admin lesen" on public.container_takes for select to authenticated
  using (private.is_friend() and (private.is_owner(owner_key) or private.is_admin()));
drop policy if exists "Besitzer oder Admin löschen" on public.container_takes;
create policy "Besitzer oder Admin löschen" on public.container_takes for delete to authenticated
  using (private.is_friend() and (private.is_owner(owner_key) or private.is_admin()));
-- Schreiben nur der Sammler (service_role)

grant select, delete on public.container_takes to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.container_takes;
exception when duplicate_object then null;
end $$;
