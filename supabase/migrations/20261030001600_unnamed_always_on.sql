-- Unbenannte Kisten ordnet man jetzt direkt in der Suche zu; den eigenen Tab und den Admin-Schalter
-- dafür gibt es nicht mehr. Der Schalter steht deshalb fest auf an: Der Sammler liefert unbenannte
-- Kisten in den Zonen, und „Meine“ / „Allgemeinheit“ funktionieren immer.

alter table public.app_settings alter column show_unnamed set default true;
insert into public.app_settings (id, show_unnamed) values (1, true)
  on conflict (id) do update set show_unnamed = true;
