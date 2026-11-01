-- Doppelkisten als eine Kiste
-- Der Sammler erkennt Doppelkisten am Block-State und führt sie unter der ID der rechten Hälfte zusammen.
-- Für jede neu erkannte Doppelkiste ruft er merge_double_chests auf: Name, Zuordnung („Meine“ / Allgemeinheit),
-- Ausblenden, private Kiste, Projekt-Quellen und der Diebstahl-Verlauf der zweiten Hälfte ziehen auf die Kiste um.
-- Hat die Kiste selbst schon einen Eintrag, gewinnt dieser; der doppelte der Hälfte fällt weg.
-- Mehrfach aufrufen schadet nicht.

create or replace function public.merge_double_chests(p_keep text[], p_drop text[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  k text;
  d text;
begin
  if coalesce(array_length(p_keep, 1), 0) <> coalesce(array_length(p_drop, 1), 0) then
    raise exception 'p_keep und p_drop müssen gleich lang sein';
  end if;
  for i in 1 .. coalesce(array_length(p_keep, 1), 0) loop
    k := p_keep[i];
    d := p_drop[i];
    if k is null or d is null or k = d then
      continue;
    end if;

    -- Umbenennen
    if exists (select 1 from container_labels where container_id = k) then
      delete from container_labels where container_id = d;
    else
      update container_labels set container_id = k where container_id = d;
    end if;

    -- Private Kiste (eine je Konto). Vor den Zuordnungen, weil das Löschen einer Zuordnung
    -- per Trigger die private Kiste an derselben Stelle mitlöscht.
    if exists (select 1 from container_private where container_id = k) then
      delete from container_private where container_id = d;
    else
      update container_private set container_id = k where container_id = d;
    end if;

    -- Zuordnung unbenannter Kisten
    if exists (select 1 from container_claims where container_id = k) then
      delete from container_claims where container_id = d;
    else
      update container_claims set container_id = k where container_id = d;
    end if;

    -- Ausgeblendet („keine Spielerkiste“)
    if exists (select 1 from container_hidden where container_id = k) then
      delete from container_hidden where container_id = d;
    else
      update container_hidden set container_id = k where container_id = d;
    end if;

    -- Projekt-Quellen
    delete from build_project_sources s
      where s.container_id = d
        and exists (select 1 from build_project_sources o where o.project_id = s.project_id and o.container_id = k);
    update build_project_sources set container_id = k where container_id = d;

    -- Diebstahl-Tracker: Verlauf bleibt erhalten und zeigt auf die ganze Kiste
    update container_takes set container_id = k where container_id = d;

    -- Die Hälfte selbst verschwindet aus Kistenliste und Beständen
    delete from stock_items where source_kind = 'container' and source_id = d;
    delete from containers where id = d;
  end loop;
end;
$$;

revoke all on function public.merge_double_chests(text[], text[]) from public, anon, authenticated;
grant execute on function public.merge_double_chests(text[], text[]) to service_role;
