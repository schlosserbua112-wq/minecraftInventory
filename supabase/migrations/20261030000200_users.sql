-- Login mit Benutzername + Passwort statt E-Mail.
-- Supabase Auth bleibt die Grundlage; jeder Benutzer bekommt eine interne Adresse
-- <name>@users.mc-tracker.local, die niemand zu Gesicht bekommt.
-- Zugriff hat nur, wer ein Profil hat. Profile legen ausschließlich Admins an.

create extension if not exists pgcrypto with schema extensions;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{2,32}$'),
  is_admin boolean not null default false,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower on public.profiles (lower(username));
alter table public.profiles enable row level security;

-- Zugriffsprüfung: angemeldet und mit Profil
create or replace function private.is_friend() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and is_admin);
$$;
revoke execute on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

create policy "Mitglieder sehen Benutzer" on public.profiles for select to authenticated using (private.is_friend());

drop table public.friends;

create or replace function private.login_email(p_username text) returns text
language sql immutable as $$ select lower(p_username) || '@users.mc-tracker.local' $$;

-- Interne Hilfsfunktion: legt Login + Profil an (ohne Rechteprüfung, nur aus anderen Funktionen)
create or replace function private.create_login(p_username text, p_password text, p_is_admin boolean, p_must_change boolean)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare
  uid uuid := gen_random_uuid();
  mail text := private.login_email(p_username);
begin
  if p_username !~ '^[A-Za-z0-9_]{2,32}$' then raise exception 'Name: 2–32 Zeichen, nur Buchstaben, Ziffern und _'; end if;
  if length(p_password) < 8 then raise exception 'Passwort: mindestens 8 Zeichen'; end if;
  if exists (select 1 from public.profiles where lower(username) = lower(p_username)) then
    raise exception 'Den Namen % gibt es schon', p_username;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                          confirmation_token, recovery_token, email_change_token_new, email_change)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', mail,
          crypt(p_password, gen_salt('bf')), now(),
          '{"provider":"email","providers":["email"]}', jsonb_build_object('username', p_username), now(), now(),
          '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', mail, 'email_verified', true),
          'email', now(), now(), now());
  insert into public.profiles (id, username, is_admin, must_change_password) values (uid, p_username, p_is_admin, p_must_change);
  return uid;
end $$;
revoke execute on function private.create_login(text, text, boolean, boolean) from public, anon, authenticated;

-- Ersten Admin anlegen: funktioniert nur, solange es noch keinen Admin gibt (im SQL-Editor ausführen)
create or replace function private.bootstrap_admin(p_username text, p_password text)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where is_admin) then raise exception 'Es gibt schon einen Admin'; end if;
  return private.create_login(p_username, p_password, true, false);
end $$;
revoke execute on function private.bootstrap_admin(text, text) from public, anon, authenticated;

-- Benutzer anlegen (nur Admins)
create or replace function public.admin_create_user(p_username text, p_password text, p_is_admin boolean default false)
returns uuid
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Nur Admins dürfen Benutzer anlegen'; end if;
  return private.create_login(p_username, p_password, p_is_admin, true);
end $$;

-- Passwort eines Benutzers setzen (nur Admins); der Benutzer muss es danach selbst ändern
create or replace function public.admin_set_password(p_user uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not private.is_admin() then raise exception 'Nur Admins dürfen Passwörter setzen'; end if;
  if length(p_password) < 8 then raise exception 'Passwort: mindestens 8 Zeichen'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  update public.profiles set must_change_password = (p_user <> auth.uid()) where id = p_user;
end $$;

create or replace function public.admin_set_admin(p_user uuid, p_is_admin boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Nur Admins dürfen Rechte ändern'; end if;
  if p_user = auth.uid() and not p_is_admin then raise exception 'Du kannst dir die Admin-Rechte nicht selbst nehmen'; end if;
  update public.profiles set is_admin = p_is_admin where id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_admin() then raise exception 'Nur Admins dürfen Benutzer löschen'; end if;
  if p_user = auth.uid() then raise exception 'Du kannst dich nicht selbst löschen'; end if;
  delete from auth.users where id = p_user;
end $$;

-- Eigenes Passwort ändern (prüft das alte Passwort)
create or replace function public.change_own_password(p_old text, p_new text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  if length(p_new) < 8 then raise exception 'Passwort: mindestens 8 Zeichen'; end if;
  if not exists (select 1 from auth.users where id = auth.uid() and encrypted_password = crypt(p_old, encrypted_password)) then
    raise exception 'Das alte Passwort stimmt nicht';
  end if;
  update auth.users set encrypted_password = crypt(p_new, gen_salt('bf')), updated_at = now() where id = auth.uid();
  update public.profiles set must_change_password = false where id = auth.uid();
end $$;

revoke execute on function public.admin_create_user(text, text, boolean) from public, anon;
revoke execute on function public.admin_set_password(uuid, text) from public, anon;
revoke execute on function public.admin_set_admin(uuid, boolean) from public, anon;
revoke execute on function public.admin_delete_user(uuid) from public, anon;
revoke execute on function public.change_own_password(text, text) from public, anon;
grant execute on function public.admin_create_user(text, text, boolean) to authenticated;
grant execute on function public.admin_set_password(uuid, text) to authenticated;
grant execute on function public.admin_set_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.change_own_password(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Ersten Admin anlegen: Passwort unten einsetzen und diese Zeile mit ausführen.
-- select private.bootstrap_admin('Valentin', 'HIER-DEIN-PASSWORT');
