-- Erster Login mit Minecraft-Namen: Wer als Spieler auf dem Server bekannt ist (Tabelle players,
-- vom Sammler befüllt) und noch kein Konto hat, legt sein Passwort selbst fest.
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
  if exists (select 1 from public.profiles where lower(username) = lower(mc_name)) then
    raise exception 'Für % gibt es schon ein Konto. Melde dich mit deinem Passwort an.', mc_name;
  end if;
  perform private.create_login(mc_name, p_password, false, false);
end $$;

revoke execute on function public.claim_account(text, text) from public;
grant execute on function public.claim_account(text, text) to anon, authenticated;
