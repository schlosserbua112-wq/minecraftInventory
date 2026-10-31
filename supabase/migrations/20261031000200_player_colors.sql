-- Feste Farbe pro Spieler für Kisten-Pins, Legende und Suche.
-- Bisher hing die Farbe an der Reihenfolge der Spielerliste und war deshalb je nach Betrachter anders.
-- Jetzt hat jedes Konto eine gespeicherte Farbe. Neue Konten bekommen automatisch die erste freie
-- aus der Palette; ändern kann sie jeder unter "Konto" und Admins unter "Benutzer".
-- Zwei Konten dürfen nicht dieselbe Farbe haben.

alter table public.profiles
  add column if not exists color text check (color ~ '^#[0-9a-f]{6}$');
create unique index if not exists profiles_color_unique on public.profiles (color) where color is not null;

-- Palette (muss zu PLAYER_COLORS in apps/web/lib/search.ts passen)
create or replace function private.player_palette() returns text[]
language sql immutable as $$
  select array['#4ea8ff', '#ff8a3d', '#6ad15a', '#ff5fa2', '#2fd4c4', '#ffd43b', '#a67cff', '#e8483f', '#c8a27a', '#f2f2f2'];
$$;

-- Erste freie Palettenfarbe, sonst eine zufällige
create or replace function private.free_player_color() returns text
language sql volatile security definer set search_path = public as $$
  select coalesce(
    (select c from unnest(private.player_palette()) with ordinality as p(c, i)
      where not exists (select 1 from public.profiles where color = c) order by i limit 1),
    '#' || lpad(to_hex((random() * 16777215)::int), 6, '0')
  );
$$;

create or replace function private.assign_player_color() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.color is null then new.color := private.free_player_color(); end if;
  return new;
end $$;

drop trigger if exists profiles_assign_color on public.profiles;
create trigger profiles_assign_color before insert on public.profiles
  for each row execute function private.assign_player_color();

-- Bestehende Konten in fester Reihenfolge (ältestes zuerst) einfärben
do $$
declare r record;
begin
  for r in select id from public.profiles where color is null order by created_at, username loop
    update public.profiles set color = private.free_player_color() where id = r.id;
  end loop;
end $$;

-- Farbe setzen: die eigene, als Admin auch die anderer
create or replace function public.set_player_color(p_user uuid, p_color text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  c text := lower(trim(p_color));
  other text;
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if p_user <> auth.uid() and not private.is_admin() then raise exception 'Nur Admins dürfen die Farbe anderer ändern'; end if;
  if c !~ '^#[0-9a-f]{6}$' then raise exception 'Ungültige Farbe'; end if;
  select username into other from public.profiles where color = c and id <> p_user;
  if other is not null then raise exception 'Diese Farbe hat schon %', other; end if;
  update public.profiles set color = c where id = p_user;
end $$;
revoke execute on function public.set_player_color(uuid, text) from public, anon;
grant execute on function public.set_player_color(uuid, text) to authenticated;
