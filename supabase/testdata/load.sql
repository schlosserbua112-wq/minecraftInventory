-- Testdaten für die Website. Erzeugt von scripts/testdata.mjs, nicht von Hand ändern.
-- Alles, was hier angelegt wird, steht in private.testdata und lässt sich mit delete.sql wieder entfernen.
-- Benutzer (profiles/auth.users) werden nicht angefasst.
begin;

create table if not exists private.testdata (
  tbl text not null,
  key text not null,
  loaded_at timestamptz not null default now(),
  primary key (tbl, key)
);
revoke all on private.testdata from public, anon, authenticated;


insert into public.players (uuid, name, online, last_seen) values
  ('00000000-0000-4000-8000-000000000001', 'Vale', false, null),
  ('00000000-0000-4000-8000-000000000002', 'Max', false, null),
  ('00000000-0000-4000-8000-000000000003', 'Lena', false, null),
  ('00000000-0000-4000-8000-000000000004', 'Jonas', false, null),
  ('00000000-0000-4000-8000-000000000005', 'Mia', false, null),
  ('00000000-0000-4000-8000-000000000006', 'Paul', false, null),
  ('00000000-0000-4000-8000-000000000007', 'Emma', true, null),
  ('00000000-0000-4000-8000-000000000008', 'Leon', false, null),
  ('00000000-0000-4000-8000-000000000009', 'Sophie', true, null),
  ('00000000-0000-4000-8000-000000000010', 'Finn', true, null);

update public.players set last_seen = case when online then now() else now() - (substr(uuid::text, 25)::int * interval '3 hours 40 minutes') end
  where uuid::text like '00000000-0000-4000-8000-%';

insert into private.testdata (tbl, key) values
  ('players', '00000000-0000-4000-8000-000000000001'),
  ('players', '00000000-0000-4000-8000-000000000002'),
  ('players', '00000000-0000-4000-8000-000000000003'),
  ('players', '00000000-0000-4000-8000-000000000004'),
  ('players', '00000000-0000-4000-8000-000000000005'),
  ('players', '00000000-0000-4000-8000-000000000006'),
  ('players', '00000000-0000-4000-8000-000000000007'),
  ('players', '00000000-0000-4000-8000-000000000008'),
  ('players', '00000000-0000-4000-8000-000000000009'),
  ('players', '00000000-0000-4000-8000-000000000010');

insert into public.containers (id, dimension, x, y, z, kind, custom_name, owner_type, owner_key, owner_label, region) values
  ('minecraft:overworld:145:68:184', 'minecraft:overworld', 145, 68, 184, 'chest', 'Vale', 'player', 'vale', 'Vale', 'r.0.0.mca'),
  ('minecraft:overworld:82:70:265', 'minecraft:overworld', 82, 70, 265, 'trapped_chest', 'vale', 'player', 'vale', 'Vale', 'r.0.0.mca'),
  ('minecraft:overworld:-208:69:310', 'minecraft:overworld', -208, 69, 310, 'shulker_box', 'Max', 'player', 'max', 'Max', 'r.-1.0.mca'),
  ('minecraft:overworld:-292:66:14', 'minecraft:overworld', -292, 66, 14, 'chest', 'max', 'player', 'max', 'Max', 'r.-1.0.mca'),
  ('minecraft:overworld:-449:73:-124', 'minecraft:overworld', -449, 73, -124, 'barrel', 'Lena', 'player', 'lena', 'Lena', 'r.-1.-1.mca'),
  ('minecraft:overworld:124:79:-246', 'minecraft:overworld', 124, 79, -246, 'chest', 'lena', 'player', 'lena', 'Lena', 'r.0.-1.mca'),
  ('minecraft:overworld:-240:77:430', 'minecraft:overworld', -240, 77, 430, 'chest', 'Jonas', 'player', 'jonas', 'Jonas', 'r.-1.0.mca'),
  ('minecraft:overworld:-383:63:186', 'minecraft:overworld', -383, 63, 186, 'trapped_chest', 'jonas', 'player', 'jonas', 'Jonas', 'r.-1.0.mca'),
  ('minecraft:overworld:-407:68:206', 'minecraft:overworld', -407, 68, 206, 'trapped_chest', 'Mia', 'player', 'mia', 'Mia', 'r.-1.0.mca'),
  ('minecraft:overworld:-154:74:3', 'minecraft:overworld', -154, 74, 3, 'trapped_chest', 'mia', 'player', 'mia', 'Mia', 'r.-1.0.mca'),
  ('minecraft:overworld:231:72:-125', 'minecraft:overworld', 231, 72, -125, 'trapped_chest', 'Paul', 'player', 'paul', 'Paul', 'r.0.-1.mca'),
  ('minecraft:overworld:-157:64:-49', 'minecraft:overworld', -157, 64, -49, 'trapped_chest', 'paul', 'player', 'paul', 'Paul', 'r.-1.-1.mca'),
  ('minecraft:overworld:300:74:37', 'minecraft:overworld', 300, 74, 37, 'trapped_chest', 'Emma', 'player', 'emma', 'Emma', 'r.0.0.mca'),
  ('minecraft:overworld:-181:72:-14', 'minecraft:overworld', -181, 72, -14, 'trapped_chest', 'emma', 'player', 'emma', 'Emma', 'r.-1.-1.mca'),
  ('minecraft:overworld:188:78:-18', 'minecraft:overworld', 188, 78, -18, 'trapped_chest', 'Leon', 'player', 'leon', 'Leon', 'r.0.-1.mca'),
  ('minecraft:overworld:344:61:53', 'minecraft:overworld', 344, 61, 53, 'chest', 'leon', 'player', 'leon', 'Leon', 'r.0.0.mca'),
  ('minecraft:overworld:213:69:166', 'minecraft:overworld', 213, 69, 166, 'barrel', 'Sophie', 'player', 'sophie', 'Sophie', 'r.0.0.mca'),
  ('minecraft:overworld:-99:78:-351', 'minecraft:overworld', -99, 78, -351, 'chest', 'sophie', 'player', 'sophie', 'Sophie', 'r.-1.-1.mca'),
  ('minecraft:overworld:-444:78:-250', 'minecraft:overworld', -444, 78, -250, 'chest', 'Finn', 'player', 'finn', 'Finn', 'r.-1.-1.mca'),
  ('minecraft:overworld:-348:62:-447', 'minecraft:overworld', -348, 62, -447, 'barrel', 'finn', 'player', 'finn', 'Finn', 'r.-1.-1.mca'),
  ('minecraft:overworld:393:61:298', 'minecraft:overworld', 393, 61, 298, 'barrel', 'Allgemein', 'common', 'allgemein', 'Allgemein', 'r.0.0.mca'),
  ('minecraft:overworld:125:72:-275', 'minecraft:overworld', 125, 72, -275, 'shulker_box', 'Allgemein', 'common', 'allgemein', 'Allgemein', 'r.0.-1.mca'),
  ('minecraft:overworld:-410:70:261', 'minecraft:overworld', -410, 70, 261, 'trapped_chest', 'allgemein', 'common', 'allgemein', 'Allgemein', 'r.-1.0.mca'),
  ('minecraft:overworld:90:77:159', 'minecraft:overworld', 90, 77, 159, 'chest', 'ALLGEMEIN', 'common', 'allgemein', 'Allgemein', 'r.0.0.mca'),
  ('minecraft:overworld:-441:62:26', 'minecraft:overworld', -441, 62, 26, 'chest', 'Allgemein', 'common', 'allgemein', 'Allgemein', 'r.-1.0.mca'),
  ('minecraft:overworld:-48:77:389', 'minecraft:overworld', -48, 77, 389, 'chest', 'Projekt Burg', 'project', 'burg', 'Burg', 'r.-1.0.mca'),
  ('minecraft:overworld:84:60:-313', 'minecraft:overworld', 84, 60, -313, 'shulker_box', 'Projekt Burg', 'project', 'burg', 'Burg', 'r.0.-1.mca'),
  ('minecraft:overworld:156:77:377', 'minecraft:overworld', 156, 77, 377, 'barrel', 'projekt burg', 'project', 'burg', 'burg', 'r.0.0.mca'),
  ('minecraft:overworld:-428:68:251', 'minecraft:overworld', -428, 68, 251, 'chest', 'Projekt Hafen', 'project', 'hafen', 'Hafen', 'r.-1.0.mca'),
  ('minecraft:overworld:137:63:428', 'minecraft:overworld', 137, 63, 428, 'chest', 'Projekt Hafen', 'project', 'hafen', 'Hafen', 'r.0.0.mca'),
  ('minecraft:overworld:-213:78:155', 'minecraft:overworld', -213, 78, 155, 'chest', 'Projekt Bahnhof', 'project', 'bahnhof', 'Bahnhof', 'r.-1.0.mca'),
  ('minecraft:overworld:-177:79:100', 'minecraft:overworld', -177, 79, 100, 'shulker_box', 'Allgmein', 'unassigned', 'allgmein', 'Allgmein', 'r.-1.0.mca'),
  ('minecraft:overworld:-213:72:-127', 'minecraft:overworld', -213, 72, -127, 'chest', 'Maxx', 'unassigned', 'maxx', 'Maxx', 'r.-1.-1.mca'),
  ('minecraft:overworld:-441:61:-33', 'minecraft:overworld', -441, 61, -33, 'chest', 'Projektburg', 'unassigned', 'projektburg', 'Projektburg', 'r.-1.-1.mca'),
  ('minecraft:overworld:440:75:-35', 'minecraft:overworld', 440, 75, -35, 'chest', 'Lager', 'unassigned', 'lager', 'Lager', 'r.0.-1.mca'),
  ('minecraft:overworld:112:64:-38', 'minecraft:overworld', 112, 64, -38, 'chest', 'Projekt Netherportal', 'project', 'netherportal', 'Netherportal', 'r.0.-1.mca'),
  ('minecraft:overworld:113:64:-38', 'minecraft:overworld', 113, 64, -38, 'barrel', 'Projekt Netherportal', 'project', 'netherportal', 'Netherportal', 'r.0.-1.mca'),
  ('minecraft:overworld:20:70:15', 'minecraft:overworld', 20, 70, 15, 'chest', 'Allgemein', 'common', 'allgemein', 'Allgemein', 'r.0.0.mca'),
  ('minecraft:the_nether:-40:88:12', 'minecraft:the_nether', -40, 88, 12, 'chest', 'Allgemein', 'common', 'allgemein', 'Allgemein', 'r.-1.0.mca');

insert into private.testdata (tbl, key) values
  ('containers', 'minecraft:overworld:145:68:184'),
  ('containers', 'minecraft:overworld:82:70:265'),
  ('containers', 'minecraft:overworld:-208:69:310'),
  ('containers', 'minecraft:overworld:-292:66:14'),
  ('containers', 'minecraft:overworld:-449:73:-124'),
  ('containers', 'minecraft:overworld:124:79:-246'),
  ('containers', 'minecraft:overworld:-240:77:430'),
  ('containers', 'minecraft:overworld:-383:63:186'),
  ('containers', 'minecraft:overworld:-407:68:206'),
  ('containers', 'minecraft:overworld:-154:74:3'),
  ('containers', 'minecraft:overworld:231:72:-125'),
  ('containers', 'minecraft:overworld:-157:64:-49'),
  ('containers', 'minecraft:overworld:300:74:37'),
  ('containers', 'minecraft:overworld:-181:72:-14'),
  ('containers', 'minecraft:overworld:188:78:-18'),
  ('containers', 'minecraft:overworld:344:61:53'),
  ('containers', 'minecraft:overworld:213:69:166'),
  ('containers', 'minecraft:overworld:-99:78:-351'),
  ('containers', 'minecraft:overworld:-444:78:-250'),
  ('containers', 'minecraft:overworld:-348:62:-447'),
  ('containers', 'minecraft:overworld:393:61:298'),
  ('containers', 'minecraft:overworld:125:72:-275'),
  ('containers', 'minecraft:overworld:-410:70:261'),
  ('containers', 'minecraft:overworld:90:77:159'),
  ('containers', 'minecraft:overworld:-441:62:26'),
  ('containers', 'minecraft:overworld:-48:77:389'),
  ('containers', 'minecraft:overworld:84:60:-313'),
  ('containers', 'minecraft:overworld:156:77:377'),
  ('containers', 'minecraft:overworld:-428:68:251'),
  ('containers', 'minecraft:overworld:137:63:428'),
  ('containers', 'minecraft:overworld:-213:78:155'),
  ('containers', 'minecraft:overworld:-177:79:100'),
  ('containers', 'minecraft:overworld:-213:72:-127'),
  ('containers', 'minecraft:overworld:-441:61:-33'),
  ('containers', 'minecraft:overworld:440:75:-35'),
  ('containers', 'minecraft:overworld:112:64:-38'),
  ('containers', 'minecraft:overworld:113:64:-38'),
  ('containers', 'minecraft:overworld:20:70:15'),
  ('containers', 'minecraft:the_nether:-40:88:12');

with d as (select string_to_array(t, ',') f from unnest(string_to_array('i,1,arrow,23 i,1,diamond_pickaxe,2 i,1,stone_bricks,114 i,1,torch,55 i,1,oak_log,76 i,1,obsidian,74 i,1,elytra,3 i,1,iron_ingot,100 i,1,netherite_ingot,31 i,1,coal,10 i,1,cooked_beef,109 i,1,quartz_block,69 i,1,lapis_lazuli,100 i,1,shulker_box,1 i,1,emerald,40 i,1,experience_bottle,32 i,1,cobblestone,31 i,1,spruce_planks,19 i,1,sand,33 i,1,diamond,6 i,1,deepslate,36 e,1,glass,140 e,1,quartz_block,50 e,1,netherite_ingot,73 e,1,iron_ingot,90 e,1,copper_ingot,36 e,1,lapis_lazuli,60 e,1,cobblestone,87 e,1,obsidian,55 e,1,shulker_box,1 e,1,gold_ingot,50 e,1,diamond_pickaxe,1 e,1,cooked_beef,24 e,1,deepslate,9 e,1,experience_bottle,14 e,1,ender_pearl,15 e,1,elytra,1 e,1,arrow,25 i,2,redstone,102 i,2,arrow,120 i,2,netherite_ingot,1 i,2,glass,128 i,2,bread,11 i,2,diamond_pickaxe,1 i,2,coal,49 i,2,stone_bricks,34 i,2,gold_ingot,40 i,2,cooked_beef,56 e,2,oak_log,1 e,2,copper_ingot,128 e,2,deepslate,38 e,2,diamond,57 e,2,ender_pearl,6 e,2,coal,81 e,2,torch,50 i,3,obsidian,42 i,3,stone_bricks,77 i,3,gold_ingot,59 i,3,diamond,76 i,3,coal,85 i,3,bread,70 i,3,redstone,64 i,3,elytra,1 i,3,diamond_pickaxe,2 i,3,netherite_ingot,68 i,3,oak_log,73 i,3,iron_ingot,30 i,3,emerald,63 i,3,experience_bottle,78 i,3,shulker_box,1 i,3,cobblestone,67 i,3,glass,64 i,3,ender_pearl,8 e,3,bread,15 e,3,spruce_planks,214 e,3,glass,60 e,3,coal,30 e,3,quartz_block,94 e,3,cooked_beef,3 e,3,shulker_box,1 e,3,diamond_pickaxe,1 e,3,deepslate,20 e,3,iron_ingot,45 e,3,redstone,43 e,3,experience_bottle,62 e,3,sand,33 e,3,copper_ingot,22 e,3,stone_bricks,14 e,3,oak_log,54 i,4,elytra,4 i,4,diamond_pickaxe,1 i,4,spruce_planks,96 i,4,glass,31 i,4,sand,5 i,4,cooked_beef,63 i,4,quartz_block,11 i,4,redstone,32 i,4,oak_log,31 i,4,lapis_lazuli,26 i,4,copper_ingot,14 i,4,stone_bricks,38 e,4,iron_ingot,112 e,4,ender_pearl,31 e,4,glass,63 e,4,spruce_planks,51 e,4,deepslate,8 e,4,oak_log,41 e,4,bread,109 e,4,netherite_ingot,79 e,4,stone_bricks,43 e,4,coal,38 e,4,quartz_block,4 e,4,obsidian,74 e,4,shulker_box,1 e,4,copper_ingot,32 e,4,cobblestone,65 e,4,arrow,54 e,4,redstone,10 i,5,quartz_block,86 i,5,stone_bricks,59 i,5,lapis_lazuli,43 i,5,bread,3 i,5,gold_ingot,16 i,5,experience_bottle,19 i,5,diamond,45 i,5,diamond_pickaxe,1 i,5,iron_ingot,39 i,5,oak_log,63 e,5,glass,42 e,5,arrow,12 e,5,gold_ingot,39 e,5,diamond,46 e,5,coal,30 e,5,ender_pearl,14 e,5,stone_bricks,63 e,5,elytra,1 e,5,cooked_beef,4 i,6,stone_bricks,68 i,6,redstone,61 i,6,sand,30 i,6,gold_ingot,6 i,6,quartz_block,64 i,6,spruce_planks,64 i,6,bread,6 i,6,ender_pearl,7 i,6,coal,103 i,6,elytra,2 i,6,cooked_beef,36 i,6,experience_bottle,58 e,6,bread,16 e,6,netherite_ingot,68 e,6,deepslate,28 e,6,cooked_beef,64 e,6,iron_ingot,26 e,6,obsidian,50 e,6,emerald,6 e,6,cobblestone,35 e,6,coal,36 e,6,torch,4 e,6,copper_ingot,43 i,7,arrow,59 i,7,stone_bricks,90 i,7,emerald,18 i,7,gold_ingot,53 i,7,cobblestone,10 i,7,coal,89 i,7,sand,44 i,7,diamond_pickaxe,2 i,7,redstone,32 i,7,bread,5 i,7,netherite_ingot,1 i,7,deepslate,143 i,7,diamond,29 i,7,spruce_planks,3 e,7,copper_ingot,23 e,7,spruce_planks,4 e,7,netherite_ingot,102 e,7,diamond,48 e,7,diamond_pickaxe,1 e,7,stone_bricks,33 i,8,experience_bottle,90 i,8,copper_ingot,90 i,8,sand,50 i,8,ender_pearl,6 i,8,elytra,3 i,8,coal,112 i,8,quartz_block,21 i,8,glass,3 i,8,spruce_planks,107 i,8,iron_ingot,37 i,8,cobblestone,34 i,8,obsidian,42 i,8,bread,136 i,8,shulker_box,1 i,8,lapis_lazuli,62 i,8,gold_ingot,30 i,8,arrow,54 i,8,torch,19 e,8,glass,71 e,8,obsidian,147 e,8,copper_ingot,56 e,8,elytra,1 e,8,bread,41 e,8,diamond_pickaxe,3 e,8,deepslate,34 e,8,oak_log,167 e,8,experience_bottle,66 e,8,redstone,149 e,8,diamond,54 e,8,coal,58 e,8,shulker_box,1 e,8,sand,42 e,8,emerald,66 e,8,gold_ingot,30 e,8,netherite_ingot,71 e,8,quartz_block,13 e,8,stone_bricks,45 e,8,arrow,1 i,9,cobblestone,41 i,9,coal,15 i,9,bread,80 i,9,emerald,9 i,9,redstone,27 i,9,sand,35 i,9,arrow,45 i,9,gold_ingot,126 i,9,oak_log,46 i,9,netherite_ingot,64 i,9,diamond_pickaxe,2 i,9,obsidian,62 i,9,elytra,1 i,9,copper_ingot,24 i,9,experience_bottle,29 e,9,diamond,57 e,9,diamond_pickaxe,1 e,9,quartz_block,63 e,9,lapis_lazuli,8 e,9,sand,6 e,9,bread,51 e,9,coal,35 e,9,ender_pearl,28 e,9,glass,91 e,9,shulker_box,1 e,9,experience_bottle,52 e,9,copper_ingot,18 e,9,gold_ingot,28 e,9,arrow,43 e,9,deepslate,53 e,9,stone_bricks,45 e,9,iron_ingot,12 i,10,elytra,2 i,10,glass,36 i,10,iron_ingot,42 i,10,cooked_beef,22 i,10,diamond_pickaxe,1 i,10,arrow,71 i,10,cobblestone,123 i,10,sand,74 i,10,bread,17 i,10,netherite_ingot,53 i,10,ender_pearl,8 i,10,oak_log,91 i,10,deepslate,9 e,10,torch,89 e,10,ender_pearl,15 e,10,bread,75 e,10,iron_ingot,43 e,10,diamond,7 e,10,sand,107 e,10,elytra,3 e,10,copper_ingot,50 e,10,redstone,26 e,10,emerald,34 e,10,cobblestone,30 e,10,lapis_lazuli,55 e,10,shulker_box,1 e,10,stone_bricks,63 e,10,diamond_pickaxe,2 e,10,cooked_beef,119 e,10,netherite_ingot,34 e,10,obsidian,57 e,10,gold_ingot,3 e,10,spruce_planks,35 e,10,oak_log,48 c,1,arrow,78 c,1,oak_log,32 c,1,stone_bricks,20 c,1,gold_ingot,12 c,1,lapis_lazuli,7 c,1,deepslate,19 c,1,emerald,49 c,1,ender_pearl,15 c,1,diamond,54 c,1,obsidian,45 c,1,iron_ingot,58 c,1,redstone,26 c,2,netherite_ingot,37 c,2,diamond,52 c,2,elytra,1 c,2,cooked_beef,27 c,2,lapis_lazuli,34 c,2,bread,30 c,2,obsidian,52 c,2,coal,8 c,2,ender_pearl,12 c,2,arrow,56 c,2,deepslate,37 c,2,copper_ingot,54 c,2,diamond_pickaxe,1 c,3,lapis_lazuli,49 c,3,stone_bricks,115 c,3,diamond,110 c,3,cobblestone,23 c,3,glass,23 c,3,quartz_block,54 c,3,obsidian,61 c,3,redstone,37 c,3,torch,19 c,3,spruce_planks,6 c,3,gold_ingot,60 c,3,copper_ingot,6 c,3,bread,52 c,4,diamond_pickaxe,1 c,4,bread,54 c,4,obsidian,10 c,4,torch,46 c,4,emerald,51 c,4,sand,5 c,4,elytra,1 c,4,netherite_ingot,21 c,4,experience_bottle,67 c,4,redstone,15 c,4,oak_log,43 c,4,lapis_lazuli,36 c,4,iron_ingot,37 c,5,elytra,1 c,5,stone_bricks,26 c,5,emerald,39 c,5,arrow,99 c,5,bread,51 c,5,oak_log,50 c,5,diamond_pickaxe,3 c,5,cooked_beef,42 c,5,copper_ingot,12 c,5,lapis_lazuli,38 c,5,ender_pearl,9 c,5,obsidian,26 c,5,deepslate,89 c,5,sand,47 c,5,coal,34 c,5,torch,12 c,6,deepslate,34 c,6,netherite_ingot,4 c,6,coal,9 c,6,ender_pearl,7 c,6,experience_bottle,19 c,6,bread,45 c,6,diamond,55 c,6,quartz_block,5 c,6,stone_bricks,16 c,6,lapis_lazuli,19 c,6,diamond_pickaxe,1 c,6,copper_ingot,59 c,6,cobblestone,18 c,6,redstone,1 c,7,experience_bottle,53 c,7,stone_bricks,60 c,7,elytra,1 c,7,quartz_block,59 c,7,netherite_ingot,73 c,7,ender_pearl,12 c,7,redstone,52 c,7,oak_log,39 c,7,copper_ingot,28 c,7,diamond,34 c,7,cobblestone,45 c,7,bread,49 c,8,stone_bricks,54 c,8,obsidian,42 c,8,glass,112 c,8,copper_ingot,113 c,8,redstone,39 c,8,oak_log,43 c,8,ender_pearl,12 c,8,experience_bottle,43 c,8,spruce_planks,64 c,8,diamond,60 c,8,lapis_lazuli,46 c,8,elytra,1 c,8,coal,18 c,9,obsidian,78 c,9,deepslate,174 c,9,emerald,27 c,9,elytra,1 c,9,cobblestone,184 c,9,coal,41 c,9,iron_ingot,49 c,9,cooked_beef,23 c,9,torch,91 c,9,bread,57 c,9,lapis_lazuli,55 c,9,glass,85 c,9,quartz_block,37 c,9,sand,62 c,9,copper_ingot,83 c,9,shulker_box,1 c,9,arrow,103 c,9,diamond,46 c,9,experience_bottle,140 c,9,stone_bricks,47 c,9,gold_ingot,30 c,9,ender_pearl,7 c,10,arrow,40 c,10,emerald,38 c,10,glass,123 c,10,oak_log,96 c,10,cobblestone,42 c,10,redstone,45 c,10,netherite_ingot,12 c,10,bread,102 c,10,lapis_lazuli,60 c,10,stone_bricks,2 c,10,diamond_pickaxe,1 c,10,torch,18 c,10,cooked_beef,9 c,11,arrow,90 c,11,diamond_pickaxe,1 c,11,redstone,112 c,11,diamond,44 c,11,gold_ingot,2 c,11,oak_log,42 c,11,lapis_lazuli,30 c,11,spruce_planks,24 c,11,emerald,7 c,11,stone_bricks,1 c,11,bread,30 c,11,obsidian,47 c,11,torch,58 c,11,iron_ingot,12 c,11,netherite_ingot,9 c,12,diamond,82 c,12,cooked_beef,18 c,12,cobblestone,91 c,12,diamond_pickaxe,1 c,12,torch,30 c,12,quartz_block,23 c,12,elytra,2 c,12,arrow,144 c,12,glass,185 c,12,oak_log,72 c,12,redstone,28 c,12,iron_ingot,167 c,12,copper_ingot,67 c,12,shulker_box,1 c,12,lapis_lazuli,67 c,12,deepslate,21 c,12,spruce_planks,51 c,12,gold_ingot,14 c,12,sand,4 c,13,spruce_planks,40 c,13,diamond_pickaxe,2 c,13,experience_bottle,23 c,13,cooked_beef,172 c,13,stone_bricks,44 c,13,netherite_ingot,57 c,13,ender_pearl,10 c,13,redstone,54 c,13,diamond,29 c,13,elytra,1 c,13,glass,6 c,14,arrow,65 c,14,emerald,44 c,14,redstone,37 c,14,quartz_block,25 c,14,cooked_beef,51 c,14,sand,20 c,14,stone_bricks,118 c,14,diamond_pickaxe,1 c,14,netherite_ingot,149 c,14,spruce_planks,43 c,14,lapis_lazuli,1 c,14,diamond,49 c,14,gold_ingot,64 c,14,deepslate,16 c,14,obsidian,18 c,14,torch,47 c,14,ender_pearl,7 c,14,experience_bottle,30 c,15,ender_pearl,22 c,15,glass,57 c,15,experience_bottle,19 c,15,copper_ingot,3 c,15,deepslate,69 c,15,iron_ingot,46 c,15,cobblestone,7 c,15,stone_bricks,51 c,15,diamond_pickaxe,3 c,15,spruce_planks,100 c,15,diamond,54 c,15,bread,50 c,15,netherite_ingot,66 c,15,shulker_box,1 c,15,coal,62 c,15,oak_log,34 c,15,sand,49 c,15,arrow,13 c,15,redstone,26 c,15,obsidian,15 c,15,cooked_beef,4 c,16,obsidian,33 c,16,diamond,97 c,16,copper_ingot,63 c,16,stone_bricks,86 c,16,netherite_ingot,26 c,16,redstone,56 c,16,ender_pearl,25 c,16,sand,81 c,16,gold_ingot,63 c,16,deepslate,36 c,16,emerald,7 c,16,quartz_block,24 c,17,cobblestone,76 c,17,obsidian,59 c,17,arrow,105 c,17,torch,35 c,17,experience_bottle,38 c,17,cooked_beef,30 c,17,gold_ingot,27 c,17,lapis_lazuli,51 c,17,netherite_ingot,41 c,17,sand,25 c,18,deepslate,167 c,18,iron_ingot,95 c,18,copper_ingot,59 c,18,oak_log,2 c,18,diamond_pickaxe,2 c,18,stone_bricks,87 c,18,coal,15 c,18,redstone,42 c,18,gold_ingot,31 c,18,cooked_beef,59 c,18,spruce_planks,16 c,19,quartz_block,105 c,19,diamond,37 c,19,emerald,17 c,19,diamond_pickaxe,1 c,19,bread,13 c,19,deepslate,38 c,19,torch,8 c,19,gold_ingot,47 c,19,cooked_beef,109 c,19,stone_bricks,8 c,19,cobblestone,44 c,19,iron_ingot,34 c,19,obsidian,30 c,20,elytra,1 c,20,spruce_planks,54 c,20,stone_bricks,92 c,20,arrow,29 c,20,torch,62 c,20,iron_ingot,37 c,20,bread,44 c,20,glass,71 c,20,lapis_lazuli,39 c,20,diamond,6 c,20,oak_log,58 c,20,sand,64 c,20,cobblestone,51 c,20,gold_ingot,1 c,20,experience_bottle,12 c,20,redstone,24 c,20,diamond_pickaxe,1 c,21,iron_ingot,19 c,21,oak_log,29 c,21,torch,69 c,21,deepslate,18 c,21,diamond_pickaxe,1 c,21,lapis_lazuli,16 c,21,experience_bottle,19 c,21,copper_ingot,48 c,21,gold_ingot,18 c,21,redstone,2 c,21,netherite_ingot,62 c,21,emerald,31 c,21,elytra,1 c,21,cooked_beef,24 c,21,glass,48 c,21,coal,5 c,22,stone_bricks,8 c,22,redstone,15 c,22,oak_log,9 c,22,spruce_planks,31 c,22,iron_ingot,53 c,22,coal,19 c,22,arrow,1 c,22,quartz_block,15 c,22,netherite_ingot,26 c,22,ender_pearl,16 c,22,elytra,2 c,22,diamond,5 c,23,elytra,1 c,23,diamond_pickaxe,2 c,23,oak_log,21 c,23,glass,40 c,23,torch,28 c,23,obsidian,47 c,23,netherite_ingot,105 c,23,deepslate,43 c,23,diamond,33 c,23,iron_ingot,87 c,23,emerald,29 c,23,lapis_lazuli,40 c,23,coal,39 c,23,sand,26 c,24,glass,44 c,24,bread,15 c,24,netherite_ingot,21 c,24,iron_ingot,51 c,24,arrow,32 c,24,experience_bottle,56 c,24,lapis_lazuli,11 c,24,emerald,55 c,24,cobblestone,12 c,24,sand,61 c,24,stone_bricks,99 c,24,torch,60 c,24,obsidian,52 c,24,copper_ingot,37 c,24,coal,16 c,25,cooked_beef,49 c,25,deepslate,63 c,25,copper_ingot,80 c,25,experience_bottle,69 c,25,redstone,64 c,25,emerald,50 c,25,glass,16 c,25,oak_log,35 c,25,spruce_planks,100 c,25,coal,39 c,25,elytra,1 c,25,netherite_ingot,50 c,25,iron_ingot,32 c,25,ender_pearl,36 c,25,obsidian,42 c,25,quartz_block,7 c,26,copper_ingot,53 c,26,diamond_pickaxe,1 c,26,sand,58 c,26,stone_bricks,5 c,26,cobblestone,74 c,26,emerald,60 c,26,glass,55 c,26,bread,43 c,26,arrow,100 c,26,deepslate,79 c,26,elytra,1 c,26,spruce_planks,38 c,26,redstone,16 c,26,gold_ingot,62 c,26,experience_bottle,33 c,27,diamond,101 c,27,stone_bricks,63 c,27,oak_log,17 c,27,glass,50 c,27,diamond_pickaxe,1 c,27,redstone,149 c,27,netherite_ingot,19 c,27,cooked_beef,33 c,27,spruce_planks,2 c,27,quartz_block,75 c,27,sand,94 c,27,obsidian,14 c,27,deepslate,39 c,28,diamond_pickaxe,2 c,28,obsidian,80 c,28,spruce_planks,62 c,28,experience_bottle,56 c,28,lapis_lazuli,78 c,28,arrow,50 c,28,cobblestone,66 c,28,glass,62 c,28,iron_ingot,10 c,28,stone_bricks,35 c,28,ender_pearl,5 c,29,ender_pearl,16 c,29,sand,28 c,29,iron_ingot,41 c,29,deepslate,58 c,29,quartz_block,31 c,29,torch,71 c,29,emerald,53 c,29,copper_ingot,101 c,29,netherite_ingot,48 c,29,cobblestone,64 c,29,redstone,20 c,29,lapis_lazuli,28 c,29,bread,38 c,30,ender_pearl,9 c,30,lapis_lazuli,58 c,30,gold_ingot,54 c,30,arrow,58 c,30,sand,44 c,30,bread,64 c,30,torch,29 c,30,spruce_planks,69 c,30,glass,47 c,30,iron_ingot,59 c,30,copper_ingot,20 c,30,elytra,1 c,30,cobblestone,34 c,30,coal,18 c,30,diamond,51 c,30,cooked_beef,33 c,31,bread,57 c,31,netherite_ingot,14 c,31,coal,49 c,31,copper_ingot,39 c,31,quartz_block,84 c,31,spruce_planks,45 c,31,cobblestone,59 c,31,ender_pearl,9 c,31,redstone,134 c,31,diamond,23 c,31,diamond_pickaxe,1 c,31,torch,88 c,31,emerald,58 c,31,deepslate,29 c,31,obsidian,54 c,31,stone_bricks,33 c,31,iron_ingot,79 c,31,shulker_box,1 c,31,elytra,2 c,31,gold_ingot,59 c,31,experience_bottle,156 c,31,glass,39 c,31,sand,28 c,32,deepslate,4 c,32,coal,36 c,32,elytra,2 c,32,cooked_beef,68 c,32,sand,149 c,32,lapis_lazuli,104 c,32,oak_log,59 c,32,netherite_ingot,51 c,32,torch,15 c,32,iron_ingot,19 c,32,spruce_planks,33 c,33,bread,32 c,33,cooked_beef,16 c,33,torch,79 c,33,gold_ingot,44 c,33,ender_pearl,1 c,33,redstone,26 c,33,netherite_ingot,120 c,33,spruce_planks,53 c,33,emerald,31 c,33,stone_bricks,42 c,33,iron_ingot,45 c,33,glass,60 c,33,diamond,30 c,34,ender_pearl,29 c,34,elytra,1 c,34,stone_bricks,76 c,34,obsidian,9 c,34,experience_bottle,45 c,34,cobblestone,27 c,34,lapis_lazuli,54 c,34,copper_ingot,59 c,34,cooked_beef,80 c,34,redstone,80 c,35,ender_pearl,7 c,35,experience_bottle,75 c,35,spruce_planks,16 c,35,bread,87 c,35,obsidian,73 c,35,iron_ingot,85 c,35,diamond,46 c,35,netherite_ingot,35 c,35,elytra,1 c,35,arrow,15 c,35,torch,22 c,35,oak_log,30 c,35,redstone,18 c,35,deepslate,19 c,35,emerald,6 c,35,glass,41 c,35,cooked_beef,9 c,36,stone_bricks,242 c,36,obsidian,16 c,36,cobblestone,64 c,36,flint_and_steel,1 c,37,spruce_stairs,40 c,37,stone_brick_slab,56 c,37,bookshelf,10 c,37,shulker_box,1 c,37,stone_brick_stairs,64 c,37,spruce_slab,36 c,37,iron_bars,10 c,38,stone_bricks,128 c,38,stripped_spruce_log,32 c,38,shulker_box,1 c,38,spruce_trapdoor,18 c,38,spruce_fence,4 c,38,spruce_door,1 c,39,quartz_block,64 c,39,obsidian,30 c,39,gold_ingot,48', ' ')) t),
pl as (select id, n from unnest(array['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000010']) with ordinality a(id, n)),
cl as (select id, n from unnest(array['minecraft:overworld:145:68:184', 'minecraft:overworld:82:70:265', 'minecraft:overworld:-208:69:310', 'minecraft:overworld:-292:66:14', 'minecraft:overworld:-449:73:-124', 'minecraft:overworld:124:79:-246', 'minecraft:overworld:-240:77:430', 'minecraft:overworld:-383:63:186', 'minecraft:overworld:-407:68:206', 'minecraft:overworld:-154:74:3', 'minecraft:overworld:231:72:-125', 'minecraft:overworld:-157:64:-49', 'minecraft:overworld:300:74:37', 'minecraft:overworld:-181:72:-14', 'minecraft:overworld:188:78:-18', 'minecraft:overworld:344:61:53', 'minecraft:overworld:213:69:166', 'minecraft:overworld:-99:78:-351', 'minecraft:overworld:-444:78:-250', 'minecraft:overworld:-348:62:-447', 'minecraft:overworld:393:61:298', 'minecraft:overworld:125:72:-275', 'minecraft:overworld:-410:70:261', 'minecraft:overworld:90:77:159', 'minecraft:overworld:-441:62:26', 'minecraft:overworld:-48:77:389', 'minecraft:overworld:84:60:-313', 'minecraft:overworld:156:77:377', 'minecraft:overworld:-428:68:251', 'minecraft:overworld:137:63:428', 'minecraft:overworld:-213:78:155', 'minecraft:overworld:-177:79:100', 'minecraft:overworld:-213:72:-127', 'minecraft:overworld:-441:61:-33', 'minecraft:overworld:440:75:-35', 'minecraft:overworld:112:64:-38', 'minecraft:overworld:113:64:-38', 'minecraft:overworld:20:70:15', 'minecraft:the_nether:-40:88:12']) with ordinality a(id, n))
insert into public.stock_items (source_kind, source_id, owner_type, owner_key, owner_label, item_id, count)
select case d.f[1] when 'i' then 'inventory' when 'e' then 'enderchest' else 'container' end::public.source_kind,
       coalesce(c.id, p.uuid::text), coalesce(c.owner_type, 'player'), coalesce(c.owner_key, lower(p.name)), coalesce(c.owner_label, p.name),
       'minecraft:' || d.f[3], d.f[4]::int
from d
left join pl on d.f[1] <> 'c' and pl.n = d.f[2]::int left join public.players p on p.uuid::text = pl.id
left join cl on d.f[1] = 'c' and cl.n = d.f[2]::int left join public.containers c on c.id = cl.id;

insert into public.projects (key, label) values
  ('burg', 'Burg'),
  ('hafen', 'Hafen'),
  ('bahnhof', 'Bahnhof'),
  ('netherportal', 'Netherportal');

insert into private.testdata (tbl, key) values
  ('projects', 'burg'),
  ('projects', 'hafen'),
  ('projects', 'bahnhof'),
  ('projects', 'netherportal');

insert into public.project_goals (project_key, item_id, target) values
  ('burg', 'minecraft:stone_bricks', 3000),
  ('burg', 'minecraft:glass', 800),
  ('burg', 'minecraft:oak_log', 400),
  ('burg', 'minecraft:torch', 200),
  ('hafen', 'minecraft:oak_log', 1000),
  ('hafen', 'minecraft:spruce_planks', 600),
  ('hafen', 'minecraft:sand', 300),
  ('bahnhof', 'minecraft:iron_ingot', 500),
  ('bahnhof', 'minecraft:redstone', 300),
  ('bahnhof', 'minecraft:gold_ingot', 120),
  ('netherportal', 'minecraft:stone_bricks', 428),
  ('netherportal', 'minecraft:cobblestone', 104),
  ('netherportal', 'minecraft:spruce_stairs', 98),
  ('netherportal', 'minecraft:stone_brick_stairs', 62),
  ('netherportal', 'minecraft:stone_brick_slab', 56),
  ('netherportal', 'minecraft:spruce_slab', 36),
  ('netherportal', 'minecraft:stripped_spruce_log', 32),
  ('netherportal', 'minecraft:bookshelf', 24),
  ('netherportal', 'minecraft:spruce_trapdoor', 18),
  ('netherportal', 'minecraft:obsidian', 16),
  ('netherportal', 'minecraft:iron_bars', 10),
  ('netherportal', 'minecraft:spruce_fence', 4),
  ('netherportal', 'minecraft:stone_brick_wall', 4),
  ('netherportal', 'minecraft:spruce_planks', 4),
  ('netherportal', 'minecraft:spruce_door', 1),
  ('netherportal', 'minecraft:flint_and_steel', 1);

insert into public.material_lists (project_key, title, raw_text, uploaded_by) values
  ('netherportal', 'Medieval Nether Portal', 'Materials for Medieval Nether Portal
897 blocks · 252 steps
428× Stone Bricks  (6 stacks + 44)
104× Cobblestone  (1 stack + 40)
98× Spruce Stairs  (1 stack + 34)
62× Stone Brick Stairs
56× Stone Brick Slab
36× Spruce Slab
32× Stripped Spruce Log
24× Bookshelf
18× Spruce Trapdoor
16× Obsidian
10× Iron Bars
4× Spruce Fence
4× Stone Brick Wall
4× Spruce Planks
1× Spruce Door
1× Flint & Steel
', 'testdaten');

insert into public.project_tasks (project_key, title, description, assignee, status, position, created_by) values
  ('burg', 'Fundament abstecken', 'Grundriss 40×40 mit Wolle markieren', 'Vale', 'done', 0, 'testdaten'),
  ('burg', 'Steinziegel brennen', 'Ca. 3000 Stück, Öfen am Lager nutzen', 'Max', 'in_progress', 0, 'testdaten'),
  ('burg', 'Glas schmelzen', null, null, 'todo', 0, 'testdaten'),
  ('burg', 'Bergfried hochziehen', 'Erst wenn Steinziegel komplett', 'Lena', 'todo', 1, 'testdaten'),
  ('burg', 'Burggraben mit Lava', 'Verworfen, zu gefährlich', 'Jonas', 'cancelled', 0, 'testdaten'),
  ('hafen', 'Fichten fällen', null, 'Lena', 'todo', 0, 'testdaten'),
  ('hafen', 'Steg Variante 1', null, 'Jonas', 'cancelled', 0, 'testdaten'),
  ('hafen', 'Leuchtturm planen', 'Schematic suchen', 'Mia', 'in_progress', 0, 'testdaten'),
  ('bahnhof', 'Schienen craften', 'Eisen aus der Farm holen', 'Paul', 'todo', 0, 'testdaten'),
  ('bahnhof', 'Bahnsteig bauen', null, 'Emma', 'done', 0, 'testdaten'),
  ('netherportal', 'Materialliste hochladen', null, 'Vale', 'done', 0, 'testdaten'),
  ('netherportal', 'Fichtenholz besorgen', 'Treppen, Stufen, Falltüren', 'Leon', 'in_progress', 0, 'testdaten'),
  ('netherportal', 'Bücherregale craften', '24 Stück, Bücher fehlen noch', 'Sophie', 'todo', 0, 'testdaten'),
  ('netherportal', 'Portal entzünden', null, 'Finn', 'todo', 1, 'testdaten');

with z as (
  insert into public.zones (name, dimension, center_x, center_z, radius, is_main) values
  ('Hauptbasis', 'minecraft:overworld', 0, 0, 400, true),
  ('Außenposten Mesa', 'minecraft:overworld', 900, -650, 120, false),
  ('Nether-Hub', 'minecraft:the_nether', 0, 0, 80, false)
  returning id
) insert into private.testdata (tbl, key) select 'zones', id::text from z;

insert into public.collector_status (id, heartbeat_at, mode, message, version) values (1, now(), 'mock', 'Testdaten, kein Sammler aktiv', 'testdaten')
  on conflict (id) do nothing;
insert into private.testdata (tbl, key) values ('collector_status', '1') on conflict do nothing;

with s as (
  insert into public.scan_requests (requested_at, requested_by, started_at, finished_at, result) values
  (now() - interval '2 days', 'testdaten', now() - interval '2 days', now() - interval '2 days' + interval '40 seconds', 'Testdaten: 3 neue Kisten gefunden'),
  (now() - interval '5 hours', 'testdaten', now() - interval '5 hours', now() - interval '5 hours' + interval '25 seconds', 'Testdaten: keine neuen Kisten')
  returning id
) insert into private.testdata (tbl, key) select 'scan_requests', id::text from s;

insert into public.stock_history (taken_at, owner_type, owner_key, item_id, count)
select date_trunc('hour', now()) - (n * interval '6 hours'), t.owner_type, t.owner_key, t.item_id,
       greatest(0, round(t.count * (1 - n * 0.006 + 0.08 * sin(n * 0.9 + length(t.item_id) + length(t.owner_key)))))::int
from public.owner_totals t cross join generate_series(0, 55) n;
insert into private.testdata (tbl, key) values ('stock_history', 'bis ' || now()::text);

commit;
