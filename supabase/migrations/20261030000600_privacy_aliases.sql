-- Jeder entscheidet selbst, ob andere sein Inventar und seine Enderkiste sehen.
-- Aliase: weitere Namen (z. B. der Minecraft-Name), unter denen Kisten und Inventar einem Konto gehören.
alter table public.profiles
  add column if not exists inventory_public boolean not null default true,
  add column if not exists aliases text[] not null default '{}';

-- Darf der aktuelle Benutzer das Inventar dieses Besitzers sehen?
-- Spieler ohne Konto bleiben sichtbar, weil sie nichts einstellen können.
create or replace function private.inventory_visible(p_owner_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (
    select 1 from public.profiles
    where lower(username) = p_owner_key and not inventory_public and id <> auth.uid()
  );
$$;
revoke execute on function private.inventory_visible(text) from public, anon;
grant execute on function private.inventory_visible(text) to authenticated;

alter policy "Freunde lesen" on public.stock_items
  using (private.is_friend() and (source_kind = 'container' or private.inventory_visible(owner_key)));

-- Eigene Einstellungen ändern
create or replace function public.update_own_settings(p_inventory_public boolean, p_aliases text[])
returns void
language plpgsql security definer set search_path = public as $$
declare
  clean text[];
  a text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  select coalesce(array_agg(distinct t), '{}') into clean
    from (select trim(x) as t from unnest(coalesce(p_aliases, '{}')) as x) s where t <> '';
  foreach a in array clean loop
    if lower(a) in ('allgemein') or lower(a) like 'projekt%' then
      raise exception '„%“ ist für Allgemein- und Projektkisten reserviert', a;
    end if;
    if exists (
      select 1 from public.profiles p
      where p.id <> auth.uid() and (lower(p.username) = lower(a) or exists (select 1 from unnest(p.aliases) x where lower(x) = lower(a)))
    ) then
      raise exception '„%“ gehört schon zu einem anderen Konto', a;
    end if;
  end loop;
  update public.profiles set inventory_public = coalesce(p_inventory_public, inventory_public), aliases = clean where id = auth.uid();
end $$;
revoke execute on function public.update_own_settings(boolean, text[]) from public, anon;
grant execute on function public.update_own_settings(boolean, text[]) to authenticated;

-- Verlauf: Summen eines Spielers nur zeigen, wenn sein Inventar sichtbar ist
alter policy "Freunde lesen" on public.stock_history
  using (private.is_friend() and (owner_type <> 'player' or private.inventory_visible(owner_key)));

-- Erster Login: Name darf auch nicht schon Alias eines anderen Kontos sein
create or replace function public.claim_account(p_username text, p_password text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  mc_name text;
begin
  select name into mc_name from public.players where lower(name) = lower(trim(p_username)) limit 1;
  if mc_name is null then
    raise exception 'Den Namen % kennt der Server nicht. Melde dich einmal im Spiel an oder frag einen Admin.', trim(p_username);
  end if;
  if exists (select 1 from public.profiles p where lower(p.username) = lower(mc_name) or exists (select 1 from unnest(p.aliases) x where lower(x) = lower(mc_name))) then
    raise exception 'Für % gibt es schon ein Konto. Melde dich mit deinem Passwort an.', mc_name;
  end if;
  perform private.create_login(mc_name, p_password, false, false);
end $$;
