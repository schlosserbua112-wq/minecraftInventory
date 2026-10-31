-- Eigene Kisten umbenennen: ein Anzeigename nur auf der Website.
-- Der Name im Amboss bleibt, wie er ist, und entscheidet weiter, wem die Kiste gehört
-- (der Sammler liest die Welt nur). Der Anzeigename hängt an der Position und übersteht neue Scans.

create table if not exists public.container_labels (
  container_id text primary key,       -- wie containers.id
  label text not null check (char_length(label) between 1 and 60),
  set_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.container_labels enable row level security;

-- Lesen dürfen alle Freunde, solange sie die Kiste selbst sehen dürfen (private Kiste)
drop policy if exists "Freunde lesen" on public.container_labels;
create policy "Freunde lesen" on public.container_labels for select to authenticated
  using (private.is_friend() and private.container_visible(container_id));
grant select on public.container_labels to authenticated;

-- Anzeigenamen setzen; leerer Name entfernt ihn. Nur für eigene Kisten, Admins dürfen alle.
create or replace function public.rename_container(p_container text, p_label text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  me public.profiles;
  clean text := nullif(btrim(regexp_replace(coalesce(p_label, ''), '\s+', ' ', 'g')), '');
begin
  select * into me from public.profiles where id = auth.uid();
  if me.id is null then raise exception 'Nicht angemeldet'; end if;

  if not me.is_admin and not exists (
    select 1 from public.containers
    where id = p_container and owner_type = 'player' and owner_key = lower(me.username)
  ) then
    raise exception 'Umbenennen kannst du nur eine Kiste, die dir gehört.';
  end if;

  if clean is null then
    delete from public.container_labels where container_id = p_container;
    return;
  end if;
  if char_length(clean) > 60 then raise exception 'Der Name darf höchstens 60 Zeichen lang sein.'; end if;

  insert into public.container_labels (container_id, label, set_by, updated_at)
    values (p_container, clean, me.id, now())
    on conflict (container_id) do update set label = excluded.label, set_by = excluded.set_by, updated_at = now();
end $$;
revoke execute on function public.rename_container(text, text) from public, anon;
grant execute on function public.rename_container(text, text) to authenticated;

-- Live-Aktualisierung auf der Website
do $$ begin
  alter publication supabase_realtime add table public.container_labels;
exception when duplicate_object or undefined_object then null;
end $$;
