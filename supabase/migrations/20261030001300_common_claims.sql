-- Unbenannte Kisten der Allgemeinheit zuordnen: Jeder kann eine freie unbenannte Kiste als
-- „Allgemeinheit“ markieren. Sie zählt dann wie eine Kiste mit dem Namen „Allgemein“.
-- Die Zuordnung hängt wie „Meine“ an der Position und übersteht neue Scans.

alter table public.container_claims add column if not exists common boolean not null default false;

-- „Allgemeinheit“
create or replace function public.claim_container_common(p_container text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  owner_name text;
begin
  if not private.is_friend() then raise exception 'Nicht angemeldet'; end if;
  if not (select show_unnamed from public.app_settings where id = 1) then
    raise exception 'Unbenannte Kisten sind gerade ausgeschaltet';
  end if;
  if not exists (select 1 from public.containers where id = p_container and custom_name is null) then
    raise exception 'Diese Kiste gibt es nicht oder sie hat einen Namen. Benannte Kisten ordnet der Name zu.';
  end if;
  select case when c.common then 'der Allgemeinheit' else p.username end into owner_name
    from public.container_claims c left join public.profiles p on p.id = c.claimed_by
    where c.container_id = p_container;
  if owner_name is not null then
    raise exception 'Die Kiste gehört schon %. Erst muss die Zuordnung aufgehoben werden.', owner_name;
  end if;
  insert into public.container_claims (container_id, claimed_by, common) values (p_container, auth.uid(), true);
  update public.containers set owner_type = 'common', owner_key = 'allgemein', owner_label = 'Allgemein'
    where id = p_container and custom_name is null;
  update public.stock_items set owner_type = 'common', owner_key = 'allgemein', owner_label = 'Allgemein'
    where source_kind = 'container' and source_id = p_container;
end $$;
revoke execute on function public.claim_container_common(text) from public, anon;
grant execute on function public.claim_container_common(text) to authenticated;

-- „Meine“ / „Nicht meine“ wie bisher; neu: eine Allgemeinheit-Kiste darf jeder wieder freigeben
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
    select case when c.common then 'der Allgemeinheit' else p.username end into owner_name
      from public.container_claims c left join public.profiles p on p.id = c.claimed_by
      where c.container_id = p_container and (c.common or c.claimed_by <> me.id);
    if owner_name is not null then
      raise exception 'Die Kiste gehört schon %. Erst muss die Zuordnung aufgehoben werden.', owner_name;
    end if;
    insert into public.container_claims (container_id, claimed_by) values (p_container, me.id)
      on conflict (container_id) do nothing;
    update public.containers set owner_type = 'player', owner_key = lower(me.username), owner_label = me.username
      where id = p_container and custom_name is null;
    update public.stock_items set owner_type = 'player', owner_key = lower(me.username), owner_label = me.username
      where source_kind = 'container' and source_id = p_container;
  else
    -- Eigene Markierung oder eine der Allgemeinheit aufheben; Admins dürfen jede aufheben
    delete from public.container_claims
      where container_id = p_container and (claimed_by = me.id or common or me.is_admin);
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
