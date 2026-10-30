-- Private Kiste: Admins sehen sie doch (Inhalt, Karte, Suche) und auch, welche Kiste privat ist.

create or replace function private.container_visible(p_container text) returns boolean
language sql stable security definer set search_path = public as $$
  select private.is_admin() or not exists (
    select 1
    from public.container_private cp
    join public.profiles p on p.id = cp.owner_id
    join public.containers c on c.id = cp.container_id
    where cp.container_id = p_container
      and cp.owner_id <> auth.uid()
      and c.owner_type = 'player' and c.owner_key = lower(p.username)
  );
$$;

drop policy if exists "Eigene lesen" on public.container_private;
create policy "Eigene lesen" on public.container_private for select to authenticated
  using (private.is_friend() and (owner_id = auth.uid() or private.is_admin()));
