-- Unbenannte Kisten: Ein Admin schaltet in der Benutzerverwaltung ein, ob sie auf der Website erscheinen.
-- Dann kann jeder Spieler eine anklicken und „Meine“ wählen. Die Zuordnung hängt an der Position
-- (Kisten-ID "<dimension>:<x>:<y>:<z>") und übersteht damit jeden neuen Scan.

create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  show_unnamed boolean not null default false
);
insert into public.app_settings (id) values (1) on conflict (id) do nothing;

create table if not exists public.container_claims (
  container_id text primary key,       -- wie containers.id
  claimed_by uuid not null references public.profiles (id) on delete cascade,
  claimed_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.container_claims enable row level security;

drop policy if exists "Freunde lesen" on public.app_settings;
create policy "Freunde lesen" on public.app_settings for select to authenticated using (private.is_friend());
drop policy if exists "Admins ändern" on public.app_settings;
create policy "Admins ändern" on public.app_settings for update to authenticated using (private.is_admin()) with check (private.is_admin());

drop policy if exists "Freunde lesen" on public.container_claims;
create policy "Freunde lesen" on public.container_claims for select to authenticated using (private.is_friend());
-- Schreiben nur über claim_container()

-- „Meine“ (p_mine = true) oder „Nicht meine“ (false). Schreibt den neuen Besitzer sofort in
-- containers und stock_items, damit die Website nicht auf die nächste Abfrage des Sammlers warten muss.
create or replace function public.claim_container(p_container text, p_mine boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  owner_name text;
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Nicht angemeldet'; end if;

  if p_mine then
    if not (select show_unnamed from public.app_settings where id = 1) then
      raise exception 'Unbenannte Kisten sind gerade ausgeschaltet';
    end if;
    if not exists (select 1 from public.containers where id = p_container and custom_name is null) then
      raise exception 'Diese Kiste gibt es nicht oder sie hat einen Namen. Benannte Kisten ordnet der Name zu.';
    end if;
    select p.username into owner_name
      from public.container_claims c join public.profiles p on p.id = c.claimed_by
      where c.container_id = p_container and c.claimed_by <> me.id;
    if owner_name is not null then
      raise exception 'Die Kiste gehört schon %. Erst muss % sie mit „Nicht meine“ freigeben.', owner_name, owner_name;
    end if;
    insert into public.container_claims (container_id, claimed_by) values (p_container, me.id)
      on conflict (container_id) do nothing;
    update public.containers set owner_type = 'player', owner_key = lower(me.username), owner_label = me.username
      where id = p_container and custom_name is null;
    update public.stock_items set owner_type = 'player', owner_key = lower(me.username), owner_label = me.username
      where source_kind = 'container' and source_id = p_container;
  else
    -- Eigene Markierung aufheben; Admins dürfen jede aufheben
    delete from public.container_claims
      where container_id = p_container and (claimed_by = me.id or me.is_admin);
    if not found then return; end if;
    if (select show_unnamed from public.app_settings where id = 1) then
      update public.containers set owner_type = 'unassigned', owner_key = 'unbenannt', owner_label = 'Unbenannt'
        where id = p_container and custom_name is null;
      update public.stock_items set owner_type = 'unassigned', owner_key = 'unbenannt', owner_label = 'Unbenannt'
        where source_kind = 'container' and source_id = p_container;
    else
      delete from public.stock_items where source_kind = 'container' and source_id = p_container;
      delete from public.containers where id = p_container and custom_name is null;
    end if;
  end if;
end $$;
revoke execute on function public.claim_container(text, boolean) from public, anon;
grant execute on function public.claim_container(text, boolean) to authenticated;

-- Live-Updates: Schalter und Markierungen
do $$ begin
  alter publication supabase_realtime add table public.app_settings, public.container_claims;
exception when duplicate_object then null;
end $$;
