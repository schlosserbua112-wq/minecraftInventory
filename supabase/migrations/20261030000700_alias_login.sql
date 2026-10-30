-- Anmelden mit Alias: übersetzt einen Alias in den Kontonamen.
-- Läuft vor dem Login, darum auch für nicht angemeldete Besucher.
create or replace function public.login_name(p_name text) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select p.username from public.profiles p
      where lower(p.username) = lower(trim(p_name))
         or exists (select 1 from unnest(p.aliases) x where lower(x) = lower(trim(p_name)))
      order by lower(p.username) = lower(trim(p_name)) desc
      limit 1),
    trim(p_name));
$$;
revoke execute on function public.login_name(text) from public;
grant execute on function public.login_name(text) to anon, authenticated;
