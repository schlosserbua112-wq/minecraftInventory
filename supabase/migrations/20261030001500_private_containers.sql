-- Private Kiste: Jeder Spieler darf höchstens eine seiner Kisten als privat markieren.
-- Sie und ihr Inhalt sind dann für alle anderen unsichtbar (Suche, Karte, Projekte, Kistenlisten),
-- auch für Admins. Die Markierung hängt wie „Meine“ an der Position und übersteht neue Scans.
-- Gehört die Kiste nicht mehr dem Spieler (umbenannt, freigegeben), ist sie wieder für alle sichtbar.

create table if not exists public.container_private (
  container_id text primary key,       -- wie containers.id
  owner_id uuid not null unique references public.profiles (id) on delete cascade, -- höchstens eine je Spieler
  marked_at timestamptz not null default now()
);
alter table public.container_private enable row level security;

-- Jeder sieht nur seine eigene Markierung; Schreiben nur über set_container_private()
drop policy if exists "Eigene lesen" on public.container_private;
create policy "Eigene lesen" on public.container_private for select to authenticated
  using (private.is_friend() and owner_id = auth.uid());
grant select on public.container_private to authenticated;

-- Darf der angemeldete Benutzer diese Kiste sehen? Nein, wenn ein anderer sie als privat markiert hat
-- und sie ihm noch gehört.
create or replace function private.container_visible(p_container text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1
    from public.container_private cp
    join public.profiles p on p.id = cp.owner_id
    join public.containers c on c.id = cp.container_id
    where cp.container_id = p_container
      and cp.owner_id <> auth.uid()
      and c.owner_type = 'player' and c.owner_key = lower(p.username)
  );
$$;
revoke execute on function private.container_visible(text) from public, anon;
grant execute on function private.container_visible(text) to authenticated;

alter policy "Freunde lesen" on public.containers
  using (private.is_friend() and private.container_visible(id));

alter policy "Freunde lesen" on public.stock_items
  using (private.is_friend()
         and (source_kind <> 'container' or private.container_visible(source_id))
         and (source_kind = 'container' or private.inventory_visible(owner_key)));

-- Eigene Kiste privat machen (p_private = true) oder wieder freigeben (false).
-- Ist schon eine andere Kiste privat, muss die erst freigegeben werden.
create or replace function public.set_container_private(p_container text, p_private boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  other text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Nicht angemeldet'; end if;

  if not p_private then
    delete from public.container_private where container_id = p_container and owner_id = me.id;
    return;
  end if;

  if not exists (
    select 1 from public.containers
    where id = p_container and owner_type = 'player' and owner_key = lower(me.username)
  ) then
    raise exception 'Privat markieren kannst du nur eine Kiste, die dir gehört.';
  end if;

  -- Alte Markierung auf einer Kiste, die nicht mehr dir gehört, zählt nicht mehr
  delete from public.container_private cp
    where cp.owner_id = me.id and not exists (
      select 1 from public.containers c
      where c.id = cp.container_id and c.owner_type = 'player' and c.owner_key = lower(me.username)
    );

  select container_id into other from public.container_private where owner_id = me.id and container_id <> p_container;
  if other is not null then
    raise exception 'Du hast schon eine private Kiste (%). Gib sie erst frei, dann kannst du diese privat machen.',
      regexp_replace(other, '^.*:(-?\d+):(-?\d+):(-?\d+)$', '\1 \2 \3');
  end if;

  insert into public.container_private (container_id, owner_id) values (p_container, me.id)
    on conflict (container_id) do nothing;
end $$;
revoke execute on function public.set_container_private(text, boolean) from public, anon;
grant execute on function public.set_container_private(text, boolean) to authenticated;

-- „Nicht meine“ hebt auch die private Markierung auf
create or replace function private.drop_private_on_release() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.container_private where container_id = old.container_id and owner_id = old.claimed_by;
  return old;
end $$;
drop trigger if exists drop_private_on_release on public.container_claims;
create trigger drop_private_on_release after delete on public.container_claims
  for each row execute function private.drop_private_on_release();
