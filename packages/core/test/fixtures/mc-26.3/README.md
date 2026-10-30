# Testdaten Minecraft 26.3 (Vanilla, lokaler Testserver)

- Server: offizielle `server.jar` 26.3 von Mojang (SHA1 `33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c`), Java: Temurin 25.0.5+8
- Aufgenommen am 2026-10-30 nach dem Stoppen des Servers (Welt gespeichert beim `stop`)
- Spieler: `VoisuffVale0810`, UUID `be6a62d9-5a99-4429-9e1b-0933842be448` (siehe `usercache.json`)

## Ordnerlayout ab 26.x

`world-tree.txt` listet alle Dateien. Anders als bis 1.21:

- Oberwelt-Regionen: `world/dimensions/minecraft/overworld/region/r.X.Z.mca` (nicht `world/region`)
- Spielerdaten: `world/players/data/<uuid>.dat` (nicht `world/playerdata`), dazu `players/advancements`, `players/stats`

## Enthaltene Dateien

- `world/dimensions/minecraft/overworld/region/r.0.0.mca`: Region mit den von Vale gebauten Kisten
- `world/level.dat`
- `world/players/data/be6a62d9-….dat`: Inventar und Enderkiste leer, Pos ≈ (-0.9, 120, 15.8), Dimension `minecraft:overworld`
- `usercache.json`
- `scan/region-and-player-scan.txt`: Rohdaten aller Kisten-Block-Entities (`RAW`) und das Ergebnis von `containersFromChunk` (`PARSED`) für alle Oberwelt-Regionen

## Von Vale gebaute Kisten (Oberwelt, Region r.0.0)

Zwei Doppelkisten übereinander, alle Hälften `CustomName: "Vale"` (in 26.3 als einfacher String gespeichert):

| Position (x y z) | Inhalt |
|---|---|
| 0 121 16 | 1× `minecraft:anvil` |
| 0 121 17 | leer (zweite Hälfte) |
| 0 120 16 | 1× `minecraft:chest` mit Komponente `minecraft:custom_name: "Vale"` |
| 0 120 17 | leer (zweite Hälfte) |

Die übrigen Kisten in den Regionen sind generierte Dungeon- und Dorfkisten mit `LootTable` und ohne `Items`.

## Noch nicht enthalten

RCON-Rohausgaben (`data get block`, `list uuids`) fehlen noch, weil der Server beim Sammeln schon gestoppt war.
Beim Lesen fällt auf: `LootTableSeed` (Long) kommt als JS-Zahl mit Genauigkeitsverlust zurück.
