-- is_friend() nicht über die REST-API aufrufbar machen (Supabase-Sicherheitshinweis)
create schema if not exists private;
grant usage on schema private to authenticated;
alter function public.is_friend() set schema private;
revoke execute on function private.is_friend() from public, anon;
grant execute on function private.is_friend() to authenticated;
