-- Item-Icons: scripts/item-icons.mjs liest die Texturen aus dem eigenen Minecraft-Client
-- und legt sie als icons.json in den privaten Bucket "items". Die Texturen gehören Mojang
-- und liegen deshalb nicht im Repo; lesen dürfen nur angemeldete Freunde, hochladen nur Admins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('items', 'items', false, 10485760, array['application/json'])
on conflict (id) do nothing;

drop policy if exists "Freunde lesen Item-Icons" on storage.objects;
create policy "Freunde lesen Item-Icons" on storage.objects for select to authenticated
  using (bucket_id = 'items' and private.is_friend());

drop policy if exists "Admins laden Item-Icons hoch" on storage.objects;
create policy "Admins laden Item-Icons hoch" on storage.objects for insert to authenticated
  with check (bucket_id = 'items' and private.is_admin());

drop policy if exists "Admins ersetzen Item-Icons" on storage.objects;
create policy "Admins ersetzen Item-Icons" on storage.objects for update to authenticated
  using (bucket_id = 'items' and private.is_admin())
  with check (bucket_id = 'items' and private.is_admin());
