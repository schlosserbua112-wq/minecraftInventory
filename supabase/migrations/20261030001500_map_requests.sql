-- "Karte neu zeichnen": Admins legen eine Anfrage mit kind = 'map' an, der Pi zeichnet die
-- Weltkarte dann sofort neu statt erst nachts. Normale Suchanfragen bleiben kind = 'scan'.
alter table public.scan_requests add column if not exists kind text not null default 'scan';
alter table public.scan_requests drop constraint if exists scan_requests_kind_check;
alter table public.scan_requests add constraint scan_requests_kind_check check (kind in ('scan', 'map'));

drop policy if exists "Freunde starten Suche" on public.scan_requests;
create policy "Freunde starten Suche" on public.scan_requests for insert to authenticated
  with check (private.is_friend() and (kind = 'scan' or private.is_admin()));
