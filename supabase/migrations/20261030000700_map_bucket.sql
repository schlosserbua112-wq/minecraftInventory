-- Weltkarte: der Sammler legt Kacheln (overworld/r.X.Z.png) und overworld/index.json in den
-- privaten Bucket "map". Lesen dürfen nur angemeldete Freunde, schreiben nur der Service-Key.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('map', 'map', false, 5242880, array['image/png', 'application/json'])
on conflict (id) do nothing;

drop policy if exists "Freunde lesen Karte" on storage.objects;
create policy "Freunde lesen Karte" on storage.objects for select to authenticated
  using (bucket_id = 'map' and private.is_friend());
