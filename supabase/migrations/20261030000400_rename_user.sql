-- Benutzer umbenennen (nur Admins). Der Login-Name ändert sich mit, das Passwort bleibt.
create or replace function public.admin_rename_user(p_user uuid, p_username text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  mail text := private.login_email(p_username);
begin
  if not private.is_admin() then raise exception 'Nur Admins dürfen Benutzer umbenennen'; end if;
  if p_username !~ '^[A-Za-z0-9_]{2,32}$' then raise exception 'Name: 2–32 Zeichen, nur Buchstaben, Ziffern und _'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'Benutzer nicht gefunden'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username) and id <> p_user) then
    raise exception 'Den Namen % gibt es schon', p_username;
  end if;
  update public.profiles set username = p_username where id = p_user;
  update auth.users
     set email = mail,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('username', p_username),
         updated_at = now()
   where id = p_user;
  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', mail), updated_at = now()
   where user_id = p_user and provider = 'email';
end $$;

revoke execute on function public.admin_rename_user(uuid, text) from public, anon;
grant execute on function public.admin_rename_user(uuid, text) to authenticated;
