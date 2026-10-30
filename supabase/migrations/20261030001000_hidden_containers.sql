-- Unbenannte Kisten ausblenden, die keine Spielerkisten sind (z. B. schon geöffnete Loot-Kisten
-- in Strukturen). Hängt wie „Meine“ an der Position und übersteht neue Scans.

create table if not exists public.container_hidden (
  container_id text primary key,       -- wie containers.id
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_at timestamptz not null default now()
);
alter table public.container_hidden enable row level security;
drop policy if exists "Freunde lesen" on public.container_hidden;
create policy "Freunde lesen" on public.container_hidden for select to authenticated using (private.is_friend());
-- Schreiben nur über hide_container()

create or replace function public.hide_container(p_container text, p_hidden boolean)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_friend() then raise exception 'Nicht angemeldet'; end if;
  if p_hidden then
    if exists (select 1 from public.container_claims where container_id = p_container) then
      raise exception 'Die Kiste gehört schon jemandem. Erst mit „Nicht meine“ freigeben.';
    end if;
    insert into public.container_hidden (container_id, hidden_by) values (p_container, auth.uid())
      on conflict (container_id) do nothing;
    -- Sofort von der Website nehmen, der Sammler lässt sie ab jetzt weg
    delete from public.stock_items where source_kind = 'container' and source_id = p_container;
    delete from public.containers where id = p_container and custom_name is null;
  else
    -- Wieder einblenden: erscheint mit der nächsten Runde des Sammlers
    delete from public.container_hidden where container_id = p_container;
  end if;
end $$;
revoke execute on function public.hide_container(text, boolean) from public, anon;
grant execute on function public.hide_container(text, boolean) to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.container_hidden;
exception when duplicate_object then null;
end $$;
