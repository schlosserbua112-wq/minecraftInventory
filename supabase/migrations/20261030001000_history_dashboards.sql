-- Verlauf-Dashboards: Jeder Benutzer baut sich beliebig viele Dashboards mit frei gewählten Items.
-- Gespeichert je Konto; andere sehen fremde Dashboards nicht.

create table if not exists public.history_dashboards (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  items text[] not null default '{}' check (cardinality(items) <= 24),
  days int not null default 14 check (days between 1 and 90),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists history_dashboards_user on public.history_dashboards (user_id, position);

alter table public.history_dashboards enable row level security;

drop policy if exists "Eigene Dashboards" on public.history_dashboards;
create policy "Eigene Dashboards" on public.history_dashboards for all to authenticated
  using (user_id = auth.uid() and private.is_friend())
  with check (user_id = auth.uid() and private.is_friend());

grant select, insert, update, delete on public.history_dashboards to authenticated;
