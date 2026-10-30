-- Entfernt alle Testdaten aus supabase/testdata/load.sql wieder.
-- Gelöscht wird nur, was in private.testdata vermerkt ist. Benutzer bleiben unberührt.
-- Im Supabase SQL-Editor komplett ausführen.
begin;

delete from public.stock_items s using private.testdata t
  where t.tbl in ('players', 'containers') and s.source_id = t.key;
delete from public.containers c using private.testdata t where t.tbl = 'containers' and c.id = t.key;
delete from public.players p using private.testdata t where t.tbl = 'players' and p.uuid::text = t.key;
-- Aufgaben, Ziele und Materiallisten hängen per on delete cascade am Projekt
delete from public.projects p using private.testdata t where t.tbl = 'projects' and p.key = t.key;
delete from public.zones z using private.testdata t where t.tbl = 'zones' and z.id::text = t.key;
delete from public.scan_requests s using private.testdata t where t.tbl = 'scan_requests' and s.id::text = t.key;
delete from public.collector_status c using private.testdata t where t.tbl = 'collector_status' and c.version = 'testdaten';
-- Verlauf: alles bis zum Zeitpunkt, an dem die Testdaten geladen wurden
delete from public.stock_history h
  where h.taken_at <= (select max(loaded_at) from private.testdata where tbl = 'stock_history');

drop table private.testdata;

commit;

-- Kontrolle: Es sollten nur noch echte Spieler und Kisten übrig sein
select (select count(*) from public.players where uuid::text like '00000000-0000-4000-8000-%') as test_spieler_uebrig,
       (select count(*) from public.players) as spieler,
       (select count(*) from public.containers) as kisten,
       (select count(*) from public.projects) as projekte,
       (select count(*) from public.profiles) as benutzer;
