-- Spielerstatistiken für den Tab „Statistiken“: Der Sammler liest bei jedem Zonen-Scan die Stats-Dateien
-- des Servers (<welt>/stats/<uuid>.json) und speichert je Spieler eine Zusammenfassung als JSON
-- (Spielzeit, Tode, Kills, Strecken, Summen und Top-Listen für Abgebautes, Getötetes …).
-- Lesen dürfen alle Freunde, schreiben nur der Sammler (service_role).

create table if not exists public.player_stats (
  uuid text primary key,               -- Minecraft-UUID wie players.uuid
  name text not null,
  stats jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.player_stats enable row level security;

drop policy if exists "Freunde lesen" on public.player_stats;
create policy "Freunde lesen" on public.player_stats for select to authenticated
  using (private.is_friend());

grant select on public.player_stats to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.player_stats;
exception when duplicate_object then null;
end $$;
