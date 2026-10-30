-- Beispiel: Freunde freischalten und Hauptzone anlegen (E-Mails anpassen)
-- insert into public.friends (email) values ('deine@mail.de');
insert into public.zones (name, center_x, center_z, radius, is_main) values ('Hauptbasis', 0, 0, 400, true);
insert into public.projects (key, label) values ('burg', 'Burg'), ('hafen', 'Hafen');
insert into public.project_goals (project_key, item_id, target) values
  ('burg', 'minecraft:stone_bricks', 3000),
  ('burg', 'minecraft:glass', 800),
  ('hafen', 'minecraft:oak_log', 1000);
